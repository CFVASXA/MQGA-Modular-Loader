"use strict";
const fs = require("node:fs"),path = require("node:path");
const {isValidSlug} = require("../core/slug.js");
const {normalizeManifest} = require("./schema.js");
const {assertWithin} = require("../core/paths.js");

class PluginLifecycle {
    constructor(paths,preferences,events,logger) { this.paths = paths; this.preferences = preferences; this.events = events; this.logger = logger; }
    async moveAside(directory) {
        const trash = path.join(this.paths.plugins,".trash");
        await fs.promises.mkdir(trash,{recursive:true});
        const target = path.join(trash,path.basename(directory) + "-" + Date.now() + "-" + Math.random().toString(16).slice(2));
        await fs.promises.rename(directory,target);
        return target;
    }
    async validateTree(root) {
        const entries = await fs.promises.readdir(root,{withFileTypes:true});
        for (const entry of entries) {
            if (entry.isSymbolicLink()) throw new Error(`Plugin package contains a symbolic link: ${entry.name}`);
            if (entry.isDirectory()) await this.validateTree(path.join(root,entry.name));
            else if (!entry.isFile()) throw new Error(`Plugin package contains a special file: ${entry.name}`);
        }
    }
    async install(source,options = {}) {
        if (typeof source !== "string" || !source) return {ok:false,error:"No source path provided"};
        await fs.promises.mkdir(this.paths.plugins,{recursive:true});
        const staging = await fs.promises.mkdtemp(path.join(this.paths.plugins,".installing-"));
        let slug = null,destination = null,previous = null,committed = false;
        try {
            const stat = await fs.promises.lstat(source);
            if (stat.isSymbolicLink()) throw new Error("Symbolic-link plugin source is not supported");
            if (stat.isDirectory()) {
                if (path.resolve(source) === path.resolve(this.paths.plugins) || path.resolve(source).startsWith(path.resolve(this.paths.plugins) + path.sep)) {
                    const names = await fs.promises.readdir(source);
                    for (const name of names) await fs.promises.cp(path.join(source,name),path.join(staging,name),{recursive:true});
                } else await fs.promises.cp(source,staging,{recursive:true});
            }
            else if (stat.isFile() && /\.zip$/i.test(source)) await require("../adapters/zip.js").extract(source,staging,this.paths);
            else throw new Error("Only directories and zip archives are supported");
            await this.validateTree(staging);
            const root = await this.findRoot(staging);
            const manifest = normalizeManifest(JSON.parse(await fs.promises.readFile(path.join(root,"manifest.json"),"utf8")));
            slug = manifest.slug;
            for (const stage of ["main","preload","renderer"]) {
                if (!manifest.injects[stage]) continue;
                const file = path.resolve(root,manifest.injects[stage]);
                if (!file.startsWith(root + path.sep) || !(await fs.promises.stat(file)).isFile()) throw new Error(`Invalid ${stage} entry`);
            }
            destination = assertWithin(path.join(this.paths.plugins,slug),[this.paths.plugins]);
            if (fs.existsSync(destination)) previous = await this.moveAside(destination);
            await fs.promises.rename(root,destination);committed = true;
            await fs.promises.rm(staging,{recursive:true,force:true}).catch(() => {});
            if (previous) await fs.promises.rm(previous,{recursive:true,force:true}).catch(() => {});
            this.events.emit("plugin:installed",{slug});
            return {ok:true,slug,replaced:!!previous};
        } catch (error) {
            let restored = false,recoveryPath;
            if (previous && !committed) {
                try { await fs.promises.rename(previous,destination);restored = true; }
                catch (_) { recoveryPath = previous; }
            }
            await fs.promises.rm(staging,{recursive:true,force:true}).catch(() => {});
            return {ok:false,slug,error:error.message,restored,...(recoveryPath ? {recoveryPath} : {})};
        }
    }
    async findRoot(directory) {
        if (fs.existsSync(path.join(directory,"manifest.json"))) return directory;
        const entries = await fs.promises.readdir(directory,{withFileTypes:true});
        const dirs = entries.filter((entry) => entry.isDirectory() && entry.name !== "__MACOSX");
        for (const entry of dirs) {
            const root = path.join(directory,entry.name);
            if (fs.existsSync(path.join(root,"manifest.json"))) return root;
        }
        throw new Error("manifest.json not found");
    }
    async uninstall(slug,options = {}) {
        if (!isValidSlug(slug)) return {ok:false,error:"Invalid plugin slug"};
        if (!options || typeof options !== "object" || Array.isArray(options)) return {ok:false,error:"Invalid deletion options"};
        const mode = options.mode || (options.keepData ? "plugin" : "all");
        if (!["all","plugin","data","none"].includes(mode)) return {ok:false,error:"Invalid deletion mode"};
        if (mode === "none") return {ok:true,slug,mode,skipped:true};
        if (this.preferences.get().protected_plugins.includes(slug) && options.force !== true) return {ok:false,error:"Protected plugin",protected:true};
        const plugin = path.join(this.paths.plugins,slug),data = path.join(this.paths.data,slug),dirs = {};
        const remove = async(directory,key) => {
            if (!fs.existsSync(directory)) { dirs[key] = "not-found";return true; }
            try {
                const aside = await this.moveAside(directory);
                dirs[key] = "moved-to-trash";
                await fs.promises.rm(aside,{recursive:true,force:true}).catch(() => {});
                return true;
            } catch (error) { dirs[key] = "error: " + error.message;return false; }
        };
        if (mode !== "data" && !(await remove(plugin,"plugin"))) return {ok:false,slug,mode,dirs};
        if (mode !== "plugin") {
            if (!(await remove(data,"data"))) return {ok:false,slug,mode,dirs};
        }
        if (mode !== "data") {
            try { await this.preferences.save({disabled_plugins:this.preferences.get().disabled_plugins.filter((item) => item !== slug)}); }
            catch (error) { return {ok:false,slug,mode,error:error.message,dirs}; }
        }
        this.events.emit("plugin:removed",{slug,mode});
        return {ok:true,slug,mode,dirs};
    }
    async applyPendingDeletions() {
        const file = path.join(this.paths.data,"LiteLoader","config.json"),cfg = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,"utf8").replace(/^﻿/,"")) : {};
        const queue = cfg.deleting_plugins;
        if (!queue || typeof queue !== "object" || Array.isArray(queue)) return [];
        const results = [],completed = [];
        for (const [slug,options] of Object.entries(queue)) {
            if (!options || typeof options.self !== "boolean" || typeof options.data !== "boolean") { results.push({slug,result:{ok:false,error:"Invalid queued deletion flags"}});continue; }
            const mode = options.self ? (options.data ? "all" : "plugin") : (options.data ? "data" : "none");
            const result = await this.uninstall(slug,{mode});
            results.push({slug,result});
            if (result.ok) completed.push({slug,options});
        }
        await this.preferences.store.update(file,(current) => {
            for (const {slug,options} of completed) if (JSON.stringify(current.deleting_plugins?.[slug]) === JSON.stringify(options)) delete current.deleting_plugins[slug];
            return current;
        });
        return results;
    }
}
module.exports = {PluginLifecycle};
