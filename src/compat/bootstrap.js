"use strict";
const {PluginContext} = require("../core/context.js");
const {DisposableScope} = require("../core/disposable.js");

function exposeLegacyGlobals(target,info) {
    for (const key of ["MQGA","LiteLoader"]) Object.defineProperty(target,key,{configurable:true,get:() => {
        const stack = new Error().stack || "";
        return stack.includes(info.paths.root) || stack.includes(info.paths.profile) ? info : null;
    }});
}
function installLegacyEvents({events,plugins}) {
    const disposer = new DisposableScope();
    disposer.add(events.on("window:created",(win) => { plugins.dispatch("onBrowserWindowCreated",win); }));
    disposer.add(events.on("qq:login",({uid,session}) => { plugins.dispatch("onLogin",uid,session); }));
    disposer.add(events.on("app:ready",() => { plugins.dispatch("onReady"); }));
    return disposer;
}
function createPluginContext({entry,scope},deps) {
    const slug = entry.manifest.slug;
    const context = new PluginContext({
        slug,
        paths:{plugin:entry.root,data:deps.paths.data + "/" + slug,root:deps.paths.root},
        events:deps.events,
        services:deps.services,
        preferences:deps.preferences,
        logger:deps.logger,
    });
    scope.add(deps.events.on("shutdown",() => scope.dispose()));
    return context;
}
module.exports = {exposeLegacyGlobals,installLegacyEvents,createPluginContext};
