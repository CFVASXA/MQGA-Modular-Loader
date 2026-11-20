"use strict";
class EventHub {
    #handlers = new Map();
    on(name, handler) {
        if (typeof name !== "string" || typeof handler !== "function") throw new TypeError("Invalid event subscription");
        const handlers = this.#handlers.get(name) || [];
        handlers.push(handler); this.#handlers.set(name,handlers);
        return () => this.off(name,handler);
    }
    off(name, handler) {
        const handlers = (this.#handlers.get(name) || []).filter((item) => item !== handler);
        if (handlers.length) this.#handlers.set(name,handlers); else this.#handlers.delete(name);
    }
    emit(name, payload) {
        const errors = [];
        for (const handler of [...(this.#handlers.get(name) || [])]) {
            try { const value = handler(payload); if (value?.catch) value.catch((error) => errors.push({name,error})); }
            catch (error) { errors.push({name,error}); }
        }
        return errors;
    }
    count(name) { return this.#handlers.get(name)?.length || 0; }
}
module.exports = {EventHub};
