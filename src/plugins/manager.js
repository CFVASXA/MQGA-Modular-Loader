"use strict";
const path = require("node:path");
const {PluginCatalog} = require("./catalog.js");
const {sortPlugins} = require("./graph.js");
const {clearPluginCache} = require("../core/cache.js");
const {DisposableScope} = require("../core/disposable.js");

class PluginManager {
    #records = new Map();
    #loaded = new Set();
    constructor({paths,events,preferences,contextFactory,logger,requireModule = require}) {
        this.paths = paths; this.events = events || new (require("../core/events.js").EventHub)(); this.preferences = preferences;
        this.contextFactory = contextFactory; this.logger = logger; this.requireModule = requireModule;
        this.catalog = new PluginCatalog(paths,events);
    }
    publicInfo() {
        const result = {};
        for (const [slug,record] of this.#records) {
            const plugin = record.entry;
            const disabled = this.preferences.get().disabled_plugins.includes(slug) || !this.preferences.get().enable_plugins;
            result[slug] = {
                manifest:plugin.manifest,disabled:disabled || !this.#loaded.has(slug),incompatible:!plugin.manifest.platform.includes(process.platform),
                path:{plugin:plugin.root,data:path.join(this.paths.data,slug),injects:{main:plugin.main || null,preload:plugin.preload || null,renderer:plugin.renderer || null}},
                status:record.status,restartRequired:record.restartRequired,error:record.error || null,
            };
        }
        return result;
    }
    getModules() { return [...this.#records.values()].filter((record) => record.exports).map((record) => ({entry:record.entry,exports:record.exports})); }
    getModule(slug) { return this.#records.get(slug)?.exports; }
    async refresh() {
        const preferences = this.preferences.get();
        const {entries,issues} = await this.catalog.discover();
        const plan = sortPlugins(entries);
        const report = {loaded:[],disabled:[],errors:[...issues.map((issue) => ({...issue,stage:"discover"}))],restartRequired:[],cycle:plan.cycles,missing:plan.missing};
        const disabled = new Set(preferences.disabled_plugins);
        for (const slug of this.#records.keys()) if (!plan.ordered.some((entry) => entry.manifest.slug === slug)) report.restartRequired.push(slug);
        for (const previous of this.#records.values()) previous.scope?.dispose();
        this.#loaded.clear();
        for (const entry of plan.ordered) {
            const slug = entry.manifest.slug,previous = this.#records.get(slug);
            const record = {entry,exports:previous?.exports,scope:new DisposableScope(),status:"disabled",restartRequired:previous?.restartRequired || false,error:null};
            this.#records.set(slug,record);
            if (!preferences.enable_plugins || disabled.has(slug)) { report.disabled.push(slug); continue; }
            if (!entry.manifest.platform.includes(process.platform)) { report.disabled.push(slug); continue; }
            if (!entry.main) {
                record.status = "renderer-only";this.#loaded.add(slug);
                if (previous?.exports) { record.status = "restart-required";record.restartRequired = true;report.restartRequired.push(slug); }
                continue;
            }
            const plan = clearPluginCache(entry.root,this.requireModule.cache);
            if (plan.restartRequired.length) {
                record.status = "restart-required";record.restartRequired = true;
                record.error = "Native, ESM or initializing modules require restart";
                this.#loaded.add(slug);report.restartRequired.push(slug);
                this.logger?.info("Plugin cannot safely hot reload: " + slug);
                continue;
            }
            try {
                const context = this.contextFactory({entry,scope:record.scope});
                const exports = this.requireModule(entry.main);
                record.exports = exports || {};
                if (typeof record.exports.dispose === "function") record.scope.add(() => record.exports.dispose(context));
                if (typeof record.exports.initialize === "function") await record.exports.initialize(context);
                record.status = "loaded";this.#loaded.add(slug);report.loaded.push(slug);
                this.events.emit("plugin:loaded",{slug});
            } catch (error) {
                record.scope.dispose();
                record.status = "error";record.error = error.message;
                record.restartRequired = !!previous?.exports;
                this.#loaded.add(slug);
                report.errors.push({slug,stage:"main",error:error.message});
                if (record.restartRequired) report.restartRequired.push(slug);
                this.logger?.error("Plugin load failed: " + slug,error);
            }
        }
        this.events.emit("plugins:refreshed",report);
        return report;
    }
    async dispatch(hookName,...args) {
        const errors = [];
        for (const {entry,exports} of this.getModules()) {
            const hook = exports?.[hookName];
            if (typeof hook !== "function") continue;
            try { await hook(...args); }
            catch (error) { errors.push({slug:entry.manifest.slug,hook:hookName,error:error.message}); this.logger?.error("Plugin hook failed: " + entry.manifest.slug,error); }
        }
        this.events.emit("plugin:hook",{hook:hookName,errors});
        return errors;
    }
    async rendererSources() {
        const fs = require("node:fs");
        const list = [];
        for (const slug of this.#loaded) {
            const record = this.#records.get(slug),file = record?.entry.renderer;
            if (!file) continue;
            try { list.push({slug,file,source:await fs.promises.readFile(file,"utf8")}); }
            catch (error) { this.logger?.error("Cannot read renderer entry: " + slug,error); }
        }
        return list;
    }
}
module.exports = {PluginManager};
