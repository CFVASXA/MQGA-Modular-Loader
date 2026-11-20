"use strict";
const path = require("node:path");
const {Runtime} = require("./core/runtime.js");

let runtime;
let nativeStarted = false;
function startOriginal() {
    if (nativeStarted) return;
    nativeStarted = true;
    require(path.join(process.resourcesPath,"app","application.asar","app_launcher","index.js"));
}
const status = {version:require("../package.json").version,pid:process.pid,root:path.resolve(__dirname,".."),ready:false,qqStarted:false,error:null};
(async() => {
    try {
        runtime = new Runtime();
        await runtime.start();
        status.ready = true;
        startOriginal();
        status.qqStarted = true;
        setImmediate(() => {
            try { if (global.launcher?.installPathPkgJson) global.launcher.installPathPkgJson.main = "./application.asar/app_launcher/index.js"; } catch (_) {}
        });
    } catch (error) {
        status.error = error?.stack || String(error);
        try { runtime?.logger.error("Loader bootstrap failed",error); } catch (_) {}
        try { startOriginal();status.qqStarted = true; } catch (nativeError) { status.error += "\n" + String(nativeError); }
    } finally {
        try {
            const fs = require("node:fs"),root = runtime?.paths.root || path.resolve(__dirname,"..");
            fs.mkdirSync(path.join(root,"logs"),{recursive:true});
            fs.writeFileSync(path.join(root,"logs","startup-status.json"),JSON.stringify(status,null,2));
        } catch (_) {}
        runtime?.logger.info("Loader startup status",status);
    }
})();
module.exports = status;
