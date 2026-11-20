"use strict";
const fs = require("node:fs"),path = require("node:path");
const {normalizeManifest} = require("./schema.js");
const {assertWithin} = require("../core/paths.js");

class PluginCatalog {
    constructor(paths,events) { this.paths = paths; this.events = events; this.entries = new Map(); }
    async discover() {
        const entries = [],issues = []; this.entries.clear();
        let names;
        try { names = await fs.promises.readdir(this.paths.plugins,{withFileTypes:true}); }
        catch (error) { if (error.code === "ENOENT") names = []; else throw error; }
        for (const dirent of names) {
            if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
            const root = path.join(this.paths.plugins,dirent.name);
            try {
                const manifestFile = assertWithin(path.join(root,"manifest.json"),[this.paths.plugins]);
                const raw = JSON.parse((await fs.promises.readFile(manifestFile,"utf8")).replace(/^﻿/,""));
                const manifest = normalizeManifest(raw),entry = {root,manifest};
                for (const stage of ["main","preload","renderer"]) {
                    if (!manifest.injects[stage]) continue;
                    const file = path.resolve(root,manifest.injects[stage]);
                    if (!file.startsWith(root + path.sep)) throw new Error(`Unsafe ${stage} entry: ${file}`);
                    const stat = await fs.promises.lstat(file);
                    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Plugin ${stage} must be a regular file: ${file}`);
                    entry[stage] = file;
                }
                entries.push(entry);this.entries.set(manifest.slug,entry);
            } catch (error) { issues.push({directory:root,error:error.message}); }
        }
        this.events?.emit("catalog:changed",{entries,issues});
        return {entries,issues};
    }
    get(slug) { return this.entries.get(slug); }
}
module.exports = {PluginCatalog};
