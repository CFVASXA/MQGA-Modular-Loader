"use strict";
const {assertAllowed} = require("./liteloader-api.js");
function clone(value) {
    if (value === undefined || value === null || typeof value !== "object") return typeof value === "function" ? undefined : value;
    try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
}
function invoke(root,methodPath,args) {
    if (!Array.isArray(methodPath) || !methodPath.length || !methodPath.every((key) => typeof key === "string" && !["__proto__","prototype","constructor"].includes(key))) throw new Error("Invalid API path");
    let owner = root,target = root;
    for (const key of methodPath) {
        owner = target;target = target?.[key];
        if (target === undefined) throw new Error("Unknown API: " + methodPath.join("."));
    }
    return typeof target === "function" ? target.apply(owner,Array.isArray(args) ? args : []) : target;
}
function error(method,error) { return {mqga_error:error?.message || String(error),method}; }
function createIpcBridge({electron,api,paths,logger,channelPrefix = "mqga"}) {
    if (!electron.ipcMain) throw new Error("ipcMain is required");
    const syncName = channelPrefix + ".sync",asyncName = channelPrefix + ".async";
    electron.ipcMain.on(syncName,(event,methodPath,args) => {
        try {
            const result = invoke(api,methodPath,args);
            if (result && typeof result.then === "function") { result.catch(() => {}); throw new Error("Async API requires invoke"); }
            event.returnValue = clone(result);
        } catch (err) { event.returnValue = error(methodPath,err); }
    });
    electron.ipcMain.handle(asyncName,async(event,methodPath,args) => {
        try { return clone(await invoke(api,methodPath,args)); } catch (err) { return error(methodPath,err); }
    });
    const files = {
        ".readText":(event,file) => { event.returnValue = api.readText(file); },
        ".exists":(event,file) => { event.returnValue = api.exists(file); },
        ".writeText":(event,file,content) => { event.returnValue = api.writeText(file,content); },
        ".preloadHit":(event,detail) => { event.returnValue = true; logger.info("preload hit",detail); },
    };
    for (const [suffix,handler] of Object.entries(files)) electron.ipcMain.on(channelPrefix + suffix,handler);
    electron.ipcMain.handle(channelPrefix + ".readFile",async(event,file) => {
        const fs = require("node:fs");
        return fs.promises.readFile(assertAllowed(file,paths),"utf8");
    });
    electron.ipcMain.handle(channelPrefix + ".rendererScripts",() => api.rendererScripts());
    return {syncName,asyncName};
}
module.exports = {createIpcBridge,invoke};
