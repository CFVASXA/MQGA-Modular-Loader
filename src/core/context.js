"use strict";
const {LoaderError} = require("./errors.js");

class PluginContext {
    constructor({slug,paths,events,services,preferences,logger}) {
        this.slug = slug;
        this.path = paths;
        this.events = events;
        this.services = services;
        this.logger = logger;
        this.preferences = preferences;
        this.storage = {
            get:(defaults = {}) => services.call("config.get",slug,defaults),
            set:(value) => services.call("config.set",slug,value),
        };
    }
    requireService(id) {
        if (id === "filesystem" || id === "ipc" || id === "shell") throw new LoaderError("capability-denied",`Explicit service capability required: ${id}`);
        return this.services.get(id);
    }
}
class ServiceHub {
    #services = new Map();
    register(id,service) {
        if (typeof id !== "string" || !/^[a-z][a-z0-9.-]+$/.test(id) || !service) throw new LoaderError("invalid-service",`Invalid service ID: ${id}`);
        if (this.#services.has(id)) throw new LoaderError("duplicate-service",`Service already registered: ${id}`);
        this.#services.set(id,service);
        return () => this.#services.delete(id);
    }
    get(id) {
        if (!this.#services.has(id)) throw new LoaderError("service-unavailable",`Service not registered: ${id}`);
        return this.#services.get(id);
    }
    call(id,...args) {
        const service = this.get(id);
        if (typeof service !== "function") throw new LoaderError("invalid-service",`Not a callable service: ${id}`);
        return service(...args);
    }
    capabilities() { return [...this.#services.keys()].sort(); }
}
module.exports = {PluginContext,ServiceHub};
