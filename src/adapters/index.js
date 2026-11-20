"use strict";
const {Registry} = require("../core/registry.js");
class AdapterRegistry extends Registry {
    constructor() { super("adapter"); }
    registerAdapter({id,description = "",connect,disconnect = () => {},capabilities = []}) {
        if (typeof connect !== "function") throw new TypeError("Adapter connect function is required");
        const dispose = this.register(id,{connect,disconnect},{description,capabilities,connected:false});
        return () => dispose();
    }
    async connectAll(runtime) {
        const results = [];
        for (const {id} of this.list()) {
            try { await this.get(id).connect(runtime);results.push({id,connected:true}); }
            catch (error) { results.push({id,connected:false,error:error.message}); }
        }
        return results;
    }
}
module.exports = {AdapterRegistry};
