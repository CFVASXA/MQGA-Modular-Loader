"use strict";
const path = require("node:path");
const fs = require("node:fs");
const {assertWithin} = require("../core/paths.js");

function createApi({plugins,preferences,store,paths,electron,operations,logger,services}) {
    const api = {
        config:{get:(slug,defaults) => store.get(slug,defaults),set:(slug,value) => store.set(slug,value)},
        plugin:{
            install:(source,options = {}) => operations.install(source,options),
            delete:(slug,options = {}) => operations.uninstall(slug,options),
            disable:(slug,disabled = true) => operations.setEnabled(slug,!disabled),
            enable:(slug,enabled = true) => operations.setEnabled(slug,enabled),
        },
        openExternal:async(url) => { await electron.shell.openExternal(String(url)); return true; },
        openPath:async(target) => { const error = await electron.shell.openPath(String(target)); if (error) throw new Error(error); return true; },
        reload:() => plugins.refresh(),
        log:(...args) => logger.info(...args),
        rendererScripts:() => plugins.rendererSources(),
        pickAndInstallPlugin:async(mode) => {
            const picked = await electron.dialog.showOpenDialog({
                title:mode === "folder" ? "选择插件文件夹" : "选择插件压缩包",
                properties:mode === "folder" ? ["openDirectory"] : ["openFile"],
                filters:mode === "folder" ? [] : [{name:"插件压缩包",extensions:["zip"]}],
            });
            if (picked.canceled || !picked.filePaths.length) return {ok:false,canceled:true};
            return {path:picked.filePaths[0],...await operations.install(picked.filePaths[0],{})};
        },
        installPluginFromPath:(source,options) => operations.install(source,options || {}),
        setLoaderConfig:async(patch) => { await preferences.save(patch || {}); return {ok:true,config:preferences.get()}; },
        reloadPlugins:() => plugins.refresh(),
        info:() => ({
            plugins:plugins.publicInfo(),paths,
            versions:{qqnt:operations.qqVersion(),mqga:operations.version(),liteloader:operations.version(),electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome},
            preferences:preferences.get(),
        }),
        pluginsInfo:() => plugins.publicInfo(),
        loader:{version:operations.version(),paths,plugins:() => plugins.publicInfo(),log:logger.info.bind(logger),versions:process.versions},
        services:{
            list:() => services.capabilities(),
            call:(id,...args) => services.call(id,...args),
        },
        readText:(file) => {
            try { return fs.readFileSync(assertAllowed(file,paths),"utf8"); } catch (_) { return null; }
        },
        exists:(file) => { try { return fs.existsSync(assertAllowed(file,paths)); } catch (_) { return false; } },
        writeText:(file,content) => {
            try {
                const target = assertAllowed(file,paths);
                fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,String(content ?? ""),"utf8");return true;
            } catch (_) { return false; }
        },
    };
    return api;
}
function assertAllowed(file,paths) {
    return assertWithin(String(file),[paths.root,paths.profile,paths.plugins]);
}
module.exports = {createApi,assertAllowed};
