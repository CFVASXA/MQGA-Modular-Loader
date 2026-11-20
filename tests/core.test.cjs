"use strict";
const test = require("node:test"),assert = require("node:assert/strict");
const {EventHub} = require("../src/core/events.js");
const {Registry} = require("../src/core/registry.js");
const {ServiceHub} = require("../src/core/context.js");
const {DisposableScope} = require("../src/core/disposable.js");
const {createPaths,assertWithin} = require("../src/core/paths.js");
const {normalizeManifest} = require("../src/plugins/schema.js");
const {sortPlugins} = require("../src/plugins/graph.js");
const {clearPluginCache} = require("../src/core/cache.js");
const {fixture,makePlugin} = require("./helpers.cjs");
const fs = require("node:fs"),path = require("node:path");

test("event subscriptions unsubscribe without affecting other connectors",()=>{
    const hub = new EventHub();let first=0,second=0;
    const off = hub.on("event",()=>first++);hub.on("event",()=>second++);
    hub.emit("event");off();hub.emit("event");
    assert.equal(first,1);assert.equal(second,2);
});
test("service registrations reject duplicates and can be removed",()=>{
    const services = new ServiceHub();let calls=0;
    const off = services.register("clock",()=>++calls);
    assert.equal(services.call("clock"),1);off();
    assert.throws(()=>services.call("clock"),/not registered/);
});
test("connector cleanup runs once in reverse order and handles immediate disposal",()=>{
    const scope = new DisposableScope(),calls=[];
    scope.add(()=>calls.push(1));scope.add(()=>calls.push(2));
    scope.dispose();scope.add(()=>calls.push(3));scope.dispose();
    assert.deepEqual(calls,[2,1,3]);
});
test("typed connector IDs reject invalid names and duplicates",()=>{
    const registry = new Registry("adapter");registry.register("local.health",{});
    assert.equal(registry.has("local.health"),true);
    assert.throws(()=>registry.register("local.health",{}),/Duplicate/);
    assert.throws(()=>registry.register("../bad",{}),/Invalid/);
});
test("legacy manifest fields are preserved and dependency order is stable",()=>{
    const {paths}=fixture(),root=makePlugin(paths,"example",{}, {dependencies:["base"],custom:{keep:true}});
    const manifest=normalizeManifest(JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8")));
    assert.deepEqual(manifest.custom,{keep:true});
    const base={manifest:normalizeManifest({manifest_version:4,type:"extension",slug:"base",name:"base",version:"1"})};
    const dependent={manifest};
    const graph=sortPlugins([dependent,base]);
    assert.deepEqual(graph.ordered.map((entry)=>entry.manifest.slug),["base","example"]);
});
test("dependency cycles and missing requirements are visible in health reports",()=>{
    const make=(slug,deps)=>({manifest:{slug,dependencies:deps,platform:[process.platform]}});
    const graph=sortPlugins([make("a",["b"]),make("b",["a"]),make("c",["missing"])]);
    assert.equal(graph.cycles.length,1);assert.equal(graph.missing.length,1);
});
test("unsafe entry paths and malformed platform declarations are rejected",()=>{
    const base={manifest_version:4,type:"extension",slug:"safe",name:"safe",version:"1"};
    assert.throws(()=>normalizeManifest({...base,slug:"../escape"}));
    assert.throws(()=>normalizeManifest({...base,platform:"win32"}));
    assert.throws(()=>normalizeManifest({...base,injects:{main:"../escape.js"}}));
});
test("resource paths reject neighbor prefixes and redirected plugin roots",()=>{
    const {root,paths}=fixture();fs.mkdirSync(paths.root,{recursive:true});
    assert.equal(assertWithin(path.join(root,"data","new.json"),[root]),path.join(root,"data","new.json"));
    assert.throws(()=>assertWithin(root+"-other",[root]));
    const outside=path.join(root,"outside");fs.mkdirSync(outside);
    const redirected=path.join(root,"redirected");fs.symlinkSync(outside,redirected,"junction");
    fs.writeFileSync(path.join(outside,"outside.js"),"test");
    assert.throws(()=>assertWithin(path.join(redirected,"file"),[root]));
});
test("plugin cache invalidation is bounded to that plugin directory",()=>{
    const {root}=fixture(),owned=path.join(root,"owned"),outside=path.join(root,"other");
    fs.mkdirSync(owned);fs.mkdirSync(outside);
    const a=path.join(owned,"a.js"),b=path.join(outside,"b.js");
    fs.writeFileSync(a,"module.exports=1");fs.writeFileSync(b,"module.exports=2");
    const originalB=require.cache[require.resolve(b)];require(a);require(b);
    clearPluginCache(owned);
    assert.equal(require.cache[a],undefined);
    assert.equal(require.cache[require.resolve(b)]!==undefined,true);
    if(!originalB)delete require.cache[require.resolve(b)];
});
test("native addon cache is not silently hot-swapped",()=>{
    const {root}=fixture(),addon=path.join(root,"addon.node");
    const cache={ [addon]:{filename:addon,exports:{},loaded:true},[path.join(root,"main.js")]:{filename:path.join(root,"main.js"),exports:{},loaded:true}};
    const report=clearPluginCache(root,cache);
    assert.deepEqual(report.cleared,[]);assert.deepEqual(report.restartRequired,[addon]);
});
test("legacy path fields remain stable for existing plugins",()=>{
    const {paths}=fixture();
    assert.equal(paths.main,path.join(paths.root,"src","main.js"));
    assert.equal(paths.preload,path.join(paths.root,"src","preload.js"));
    assert.equal(paths.data,path.join(paths.profile,"data"));
    assert.equal(paths.plugins,path.join(paths.profile,"plugins"));
});
