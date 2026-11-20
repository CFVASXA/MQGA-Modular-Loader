"use strict";
class SessionInjector {
    #native = new WeakSet();
    #wrapped = new WeakSet();
    #instrumented = new WeakSet();
    constructor(preload,events) { this.preload = preload; this.events = events; }
    attach(session) {
        if (!session || this.#native.has(session)) return;
        if (!this.#wrapped.has(session) && typeof session.registerPreloadScript === "function") {
            try {
                session.registerPreloadScript({type:"frame",filePath:this.preload});
                this.#native.add(session);this.#wrapped.add(session);this.events.emit("session:preload",{native:true});
            } catch (_) {}
        }
        if (this.#native.has(session) || this.#wrapped.has(session)) return;
        const original = session.getPreloadScripts?.bind(session);
        if (!original) return;
        Object.defineProperty(session,"getPreloadScripts",{configurable:true,value:(...args) => {
            const scripts = Array.from(original(...args) || []);
            if (!scripts.some((item) => item?.filePath === this.preload)) scripts.unshift({type:"frame",filePath:this.preload});
            return scripts;
        }});
        this.#wrapped.add(session);
    }
    instrument(window) {
        const wc = window?.webContents;
        if (!wc) return;
        this.attach(wc.session);
        this.events.emit("window:created",window);
        if (this.#instrumented.has(wc)) return;
        this.#instrumented.add(wc);
        const send = wc.send?.bind(wc);
        if (send) wc.send = (...args) => {
            const [channel,payload] = args;
            if (typeof channel === "string" && channel.includes("RM_IPCFROM_") && payload?.[1]?.cmdName === "nodeIKernelSessionListener/onSessionInitComplete") this.events.emit("qq:login",{uid:payload?.[1]?.payload?.uid,session:wc.session});
            return send(...args);
        };
        wc.on?.("did-finish-load",() => this.events.emit("window:loaded",{window,url:wc.getURL()}));
    }
    wrap(Original) {
        const self = this;
        let Wrapped;
        Wrapped = new Proxy(Original,{construct(target,args,newTarget) {
            self.events.emit("window:creating",args);
            const win = Reflect.construct(target,args,newTarget === Wrapped ? target : newTarget);
            self.instrument(win);return win;
        }});
        return Wrapped;
    }
    install(moduleLoader = require,electronInstance) {
        const electron = electronInstance || moduleLoader("electron");
        this.registerElectron(electron,moduleLoader);
        return electron;
    }
    registerElectron(electron,moduleLoader) {
        const original = electron.BrowserWindow,wrapped = this.wrap(original),cached = moduleLoader.cache?.electron;
        if (cached) {
            const originalExports = cached.exports;
            const wrappedExports = new Proxy(originalExports,{get(target,key,receiver) { return key === "BrowserWindow" ? wrapped : Reflect.get(target,key,receiver); }});
            moduleLoader.cache.electron = new Proxy(cached,{get(target,key,receiver) { return key === "exports" ? wrappedExports : Reflect.get(target,key,receiver); }});
        } else Object.defineProperty(electron,"BrowserWindow",{configurable:true,get:() => wrapped});
        this.electron = electron;
    }
}
module.exports = {SessionInjector};
