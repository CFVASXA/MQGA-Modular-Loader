"use strict";
class DisposableScope {
    #cleanups = new Set(); #closed = false;
    get closed() { return this.#closed; }
    add(cleanup) {
        if (typeof cleanup !== "function") throw new TypeError("Cleanup must be a function");
        if (this.#closed) { cleanup(); return cleanup; }
        this.#cleanups.add(cleanup); return cleanup;
    }
    dispose() {
        if (this.#closed) return [];
        this.#closed = true;
        const errors = [];
        for (const cleanup of [...this.#cleanups].reverse()) {
            try { cleanup(); } catch (error) { errors.push(error); }
        }
        this.#cleanups.clear(); return errors;
    }
}
module.exports = {DisposableScope};
