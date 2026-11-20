"use strict";
const {LoaderError} = require("./errors.js");
class Registry {
    #kind;
    #items = new Map();
    constructor(kind) { this.#kind = kind; }
    register(id,item,metadata = {}) {
        if (typeof id !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(id)) throw new LoaderError("invalid-id",`Invalid ${this.#kind} ID: ${id}`);
        if (this.#items.has(id)) throw new LoaderError("duplicate-id",`Duplicate ${this.#kind}: ${id}`);
        this.#items.set(id,{item,metadata});
        return () => this.#items.delete(id);
    }
    get(id) { const record = this.#items.get(id); if (!record) throw new LoaderError("not-found",`Unknown ${this.#kind}: ${id}`); return record.item; }
    has(id) { return this.#items.has(id); }
    list() { return [...this.#items].map(([id,{metadata}]) => ({id,...metadata})); }
    size() { return this.#items.size; }
}
module.exports = {Registry};
