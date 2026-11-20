"use strict";
class AsyncQueue {
    #tail = Promise.resolve();
    add(operation) {
        const run = this.#tail.then(operation,operation);
        this.#tail = run.catch(() => {});
        return run;
    }
}
module.exports = {AsyncQueue};
