"use strict";
const fs = require("node:fs"),path = require("node:path");
const {AsyncQueue} = require("../core/async-queue.js");
const {assertWithin} = require("../core/paths.js");
const {isValidSlug} = require("../core/slug.js");

class ConfigStore {
    #queue = new AsyncQueue();
    constructor(paths) { this.paths = paths; }
    read(file,fallback) {
        try { return JSON.parse(fs.readFileSync(file,"utf8").replace(/^﻿/,"")); }
        catch (_) { return fallback; }
    }
    #atomic(file,value) {
        fs.mkdirSync(this.paths.data,{recursive:true});
        const text = JSON.stringify(value,null,4);
        if (text === undefined) throw new TypeError("Configuration must be JSON-serializable");
        fs.mkdirSync(path.dirname(file),{recursive:true});
        const tmp = file + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
        try { fs.writeFileSync(tmp,text,{encoding:"utf8",flag:"wx"}); fs.renameSync(tmp,file); }
        finally { try { fs.unlinkSync(tmp); } catch (_) {} }
    }
    write(file,value) { this.#atomic(file,value); return value; }
    namespace(slug) {
        if (!isValidSlug(slug)) throw new Error("Invalid configuration namespace");
        return assertWithin(path.join(this.paths.data,slug,"config.json"),[this.paths.data]);
    }
    get(slug,defaults = {}) {
        const file = this.namespace(slug),value = this.read(file,null);
        if (!value || typeof value !== "object" || Array.isArray(value)) return this.write(file,defaults);
        return {...defaults,...value};
    }
    set(slug,value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Config must be an object");
        return this.write(this.namespace(slug),value);
    }
    update(file,fn) { return this.#queue.add(async () => this.#atomic(file,await fn(this.read(file,{})))); }
    transaction(fn) { return this.#queue.add(fn); }
    legacy(file) {
        const value = this.read(file,null);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Legacy configuration is invalid");
        return value;
    }
}
module.exports = {ConfigStore};
