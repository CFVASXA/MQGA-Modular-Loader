"use strict";
const {isWithin} = require("./paths.js");
const path = require("node:path");
function clearPluginCache(directory,cache = require.cache) {
    const owned = [],restartRequired = [];
    for (const [key,mod] of Object.entries(cache)) {
        const file = mod?.filename || key;
        if (typeof file !== "string" || !path.isAbsolute(file)) continue;
        try { if (!isWithin(file,directory)) continue; } catch (_) { continue; }
        owned.push(key);
        if (/\.(node|mjs)$/i.test(file) || Object.prototype.toString.call(mod?.exports) === "[object Module]" || mod?.loaded === false) restartRequired.push(file);
    }
    if (restartRequired.length) return {cleared:[],restartRequired};
    for (const key of owned) delete cache[key];
    return {cleared:owned,restartRequired:[]};
}
module.exports = {clearPluginCache};
