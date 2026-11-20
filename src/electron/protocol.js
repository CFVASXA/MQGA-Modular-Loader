"use strict";
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {assertAllowed} = require("../compat/liteloader-api.js");

class ResourceProtocol {
    #registered = new WeakMap();
    constructor(electron,paths,logger) { this.electron = electron; this.paths = paths; this.logger = logger; }
    registerPrivileges() {
        this.electron.protocol.registerSchemesAsPrivileged(["mqga","local"].map((scheme) => ({scheme,privileges:{standard:false,secure:true,supportFetchAPI:true,stream:true,bypassCSP:true,corsEnabled:true}})));
    }
    register(protocol) {
        if (!protocol || !this.electron.app.isReady()) return false;
        let schemes = this.#registered.get(protocol);
        if (!schemes) { schemes = new Set(); this.#registered.set(protocol,schemes); }
        const fetch = async(file) => this.electron.net.fetch(pathToFileURL(assertAllowed(file,this.paths)).href);
        const handler = async(request) => {
            try {
                const raw = String(request.url).replace(/\\/g,"/");
                if (/(?:^|\/)\.\.?(?:\/|$)/.test(raw)) return new Response("forbidden",{status:403});
                const url = new URL(raw),decoded = decodeURIComponent(url.pathname || "");
                const base = url.hostname === "profile" ? this.paths.profile : this.paths.root;
                const target = url.hostname === "root" || url.hostname === "profile" ? path.join(base,decoded.replace(/^\/+/,"")) : decoded.replace(/^\/([a-zA-Z]:)/,"$1");
                return await fetch(target);
            } catch (_) { return new Response("forbidden",{status:403}); }
        };
        for (const scheme of ["mqga","local"]) {
            if (schemes.has(scheme)) continue;
            try { protocol.handle(scheme,handler);schemes.add(scheme); }
            catch (error) { this.logger?.error("Protocol registration failed: " + scheme,error); }
        }
        return schemes.size === 2;
    }
}
module.exports = {ResourceProtocol};
