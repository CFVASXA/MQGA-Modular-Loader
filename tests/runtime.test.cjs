"use strict";
const test = require("node:test"),assert = require("node:assert/strict");
const fs = require("node:fs"),path = require("node:path");
const {fixture,makePlugin,electronFixture} = require("./helpers.cjs");
const {ConfigStore} = require("../src/config/store.js");
const {Preferences} = require("../src/config/preferences.js");
const {PluginManager} = require("../src/plugins/manager.js");
const {PluginLifecycle} = require("../src/plugins/lifecycle.js");
const {Runtime} = require("../src/core/runtime.js");
const {createIpcBridge} = require("../src/compat/ipc.js");
const {createApi} = require("../src/compat/liteloader-api.js");
const {SessionInjector} = require("../src/electron/session.js");
const {ResourceProtocol} = require("../src/electron/protocol.js");
const {EventHub} = require("../src/core/events.js");
const {ServiceHub} = require("../src/core/context.js");
function managerFixture(files,manifest) {
    const f=fixture(),root=makePlugin(f.paths,"demo",files || {'main.js':'module.exports={onReady(){require("node:fs").writeFileSync(require("node:path").join(__dirname,"ready.txt"),"ok")} };'},manifest),store=new ConfigStore(f.paths),prefs=new Preferences(store,f.paths);
    const services=new ServiceHub();services.register("config.get",(slug,defaults)=>store.get(slug,defaults));services.register("config.set",(slug,value)=>store.set(slug,value));
    const manager=new PluginManager({paths:f.paths,events:f.events,preferences:prefs,events:f.events,logger:{info(){},error(){}},contextFactory:({entry,scope})=>({slug:entry.manifest.slug,scope,paths:f.paths,services,preferences:prefs})});
    return {...f,root,store,prefs,manager};
}
test("plugin main, preload, and renderer descriptors are discovered",async()=>{
    const f=managerFixture();const report=await f.manager.refresh();
    assert.deepEqual(report.loaded,["demo"]);
    const plugin=f.manager.publicInfo().demo;
    assert.equal(plugin.disabled,false);assert.equal(plugin.path.plugin,f.root);
    assert.ok(plugin.path.injects.main.endsWith("main.js"));assert.ok(plugin.path.injects.preload.endsWith("preload.js"));assert.ok(plugin.path.injects.renderer.endsWith("renderer.js"));
});
test("plugin hooks run and helper-module reload is supported",async()=>{
    const f=managerFixture({'main.js':'module.exports={...require("./helper.js"),onReady(){this.version++}};', 'helper.js':'module.exports={version:1};'});
    await f.manager.refresh();assert.equal(f.manager.getModule("demo").version,1);
    await f.manager.dispatch("onReady");assert.equal(f.manager.getModule("demo").version,1);
    fs.writeFileSync(path.join(f.root,"helper.js"),'module.exports={version:5};');
    await f.manager.refresh();assert.equal(f.manager.getModule("demo").version,5);
});
test("disabled plugin skips main and renderer entry execution",async()=>{
    const f=managerFixture();await f.manager.refresh();
    await f.prefs.save({disabled_plugins:["demo"]});await f.manager.refresh();
    assert.equal(f.manager.publicInfo().demo.disabled,true);
    assert.deepEqual(await f.manager.rendererSources(),[]);
});
test("plugin errors are isolated and reported without hiding valid plugins",async()=>{
    const f=managerFixture({'main.js':'throw new Error("broken plugin");'});makePlugin(f.paths,"valid",{'main.js':'module.exports={valid:true};'});
    const report=await f.manager.refresh();
    assert.equal(report.errors[0].slug,"demo");assert.deepEqual(report.loaded,["valid"]);
    assert.equal(f.manager.getModule("valid").valid,true);
});
test("renderer-only plugins remain discoverable and provide renderer source",async()=>{
    const f=managerFixture({'main.js':null,renderer:'export function onSettingWindowCreated(){}'},{injects:{renderer:"renderer.js"}});
    await f.manager.refresh();
    const list=await f.manager.rendererSources();assert.equal(list.length,1);assert.equal(list[0].slug,"demo");
});
test("plugin main can use typed context without global host object",async()=>{
    const f=managerFixture({'main.js':'module.exports={initialize(ctx){this.slug=ctx.slug;this.enabled=ctx.preferences.get().enable_plugins;}};'});
    await f.manager.refresh();
    assert.equal(f.manager.getModule("demo").slug,"demo");assert.equal(f.manager.getModule("demo").enabled,true);
});
test("configuration is namespaced and supports atomic updates",async()=>{
    const {paths}=fixture(),store=new ConfigStore(paths);
    store.set("one",{value:1});store.set("two",{value:2});
    assert.equal(store.get("one",{}).value,1);
    await store.update(store.namespace("one"),current=>({...current,value:3}));
    assert.equal(store.get("one",{}).value,3);
    assert.throws(()=>store.set("../outside",{}));
});
test("shared preferences remain effective with legacy config override",async()=>{
    const {paths}=fixture(),store=new ConfigStore(paths),prefs=new Preferences(store,paths);
    store.write(path.join(paths.data,"LiteLoader","config.json"),{enable_plugins:true,disabled_plugins:["old"],extra:"keep"});
    await prefs.save({disabled_plugins:["demo"],enable_plugins:false});
    assert.equal(prefs.get().enable_plugins,false);assert.deepEqual(prefs.get().disabled_plugins,["demo"]);
    assert.equal(store.read(path.join(paths.data,"LiteLoader","config.json"),{}).extra,"keep");
});
test("failed plugin activation restores the old version",async()=>{
    const f=fixture(),root=makePlugin(f.paths,"demo"),prefs=new Preferences(new ConfigStore(f.paths),f.paths),lifecycle=new PluginLifecycle(f.paths,prefs,f.events);
    await lifecycle.install(root);fs.writeFileSync(path.join(f.paths.plugins,"demo","main.js"),"old");
    const source=path.join(f.profile,"incoming");fs.mkdirSync(source);
    fs.writeFileSync(path.join(source,"manifest.json"),fs.readFileSync(path.join(f.paths.plugins,"demo","manifest.json")));fs.writeFileSync(path.join(source,"main.js"),"new");
    fs.writeFileSync(path.join(source,"preload.js"),"");fs.writeFileSync(path.join(source,"renderer.js"),"");
    const original=fs.promises.rename;
    fs.promises.rename=async(from,to)=>{
        if(to===path.join(f.paths.plugins,"demo")&&String(from).includes(".installing-"))throw new Error("locked");
        return original(from,to);
    };
    try{const result=await lifecycle.install(source);assert.equal(result.ok,false);assert.equal(result.restored,true);}
    finally{fs.promises.rename=original;}
    assert.equal(fs.readFileSync(path.join(f.paths.plugins,"demo","main.js"),"utf8"),"old");
});
test("IPC retains legacy channel names and awaits asynchronous methods",async()=>{
    const {electron,listeners,handlers}=electronFixture(),{paths}=fixture();
    const api={info:()=>({plugins:{},paths}),operation:async()=>({value:42}),readText:()=>null,exists:()=>false,writeText:()=>false,rendererScripts:async()=>[]};
    createIpcBridge({electron,api,paths,logger:{info(){}}});
    const ev={};listeners.get("mqga.sync")(ev,["info"],[]);
    assert.equal(ev.returnValue.plugins!==undefined,true);
    assert.equal((await handlers.get("mqga.async")({},["operation"],[])).value,42);
});
test("session preload registration is idempotent and supports failure retry",()=>{
    const events=new EventHub();let attempts=0;
    const injector=new SessionInjector("C:/preload.js",events),session={registerPreloadScript(){if(++attempts===1)throw new Error("not ready");}};
    injector.attach(session);injector.attach(session);injector.attach(session);
    assert.equal(attempts,2);
});
test("protocol path boundaries preserve root and profile resource hosts",async()=>{
    const f=fixture(),e=electronFixture();e.setReady(true);
    const protocol=new ResourceProtocol(e.electron,f.paths);protocol.register(e.electron.protocol);
    assert.equal(e.schemes.size,2);
    const response=await e.schemes.get("local")({url:"local://root/../outside"});
    assert.equal(response.status,403);
});
test("runtime starts mocked Electron, registers IPC and loads plugins",async()=>{
    const f=fixture();makePlugin(f.paths,"demo",{'main.js':'module.exports={onReady(){}};'});
    const {electron,listeners,handlers,setReady}=electronFixture();setReady(true);
    const runtime=new Runtime({electron,paths:f.paths});
    await runtime.start();
    assert.equal(runtime.plugins.getModule("demo")!==undefined,true);
    assert.equal(listeners.has("mqga.sync"),true);assert.equal(handlers.has("mqga.async"),true);
    const ev={};listeners.get("mqga.sync")(ev,["info"],[]);
    assert.equal(ev.returnValue.plugins.demo.manifest.slug,"demo");
    await runtime.shutdown();
});
test("new adapter connection failure is reported without preventing other adapters",async()=>{
    const f=fixture(),{electron,setReady}=electronFixture();setReady(true);
    const runtime=new Runtime({electron,paths:f.paths});
    runtime.adapters.registerAdapter({id:"good",connect:()=>{f.good=true;}});
    runtime.adapters.registerAdapter({id:"bad",connect:()=>{throw new Error("adapter offline");}});
    const result=await runtime.adapters.connectAll(runtime);
    assert.equal(f.good,true);assert.equal(result[1].connected,false);
});
test("renderer reload notifications reach each webContents exactly once per refresh",async()=>{
    const f=fixture();makePlugin(f.paths,"demo");
    const {electron,setReady}=electronFixture();setReady(true);
    const sent=[];electron.webContents={getAllWebContents:()=>[{send:(name)=>sent.push(name)}]};
    const runtime=new Runtime({electron,paths:f.paths});await runtime.start();
    sent.length=0;await runtime.plugins.refresh();
    assert.deepEqual(sent,["mqga.rerun"]);await runtime.shutdown();
});
test("legacy app ready hooks fire once even if Electron emits ready again",async()=>{
    const f=fixture(),file=path.join(f.profile,"ready-count.txt");makePlugin(f.paths,"demo",{'main.js':`module.exports={onReady(){require("node:fs").appendFileSync(${JSON.stringify(file)},"1")}};`});
    const {electron,setReady}=electronFixture();setReady(false);const runtime=new Runtime({electron,paths:f.paths});
    await runtime.start();electron.app.emit("ready");electron.app.emit("ready");
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(fs.readFileSync(file,"utf8"),"1");await runtime.shutdown();
});
test("plugin disposer runs exactly once on refresh and runtime shutdown",async()=>{
    const f=fixture(),file=path.join(f.profile,"dispose-count.txt");makePlugin(f.paths,"demo",{'main.js':`module.exports={dispose(){require("node:fs").appendFileSync(${JSON.stringify(file)},"1")}};`});
    const {electron,setReady}=electronFixture();setReady(true);const runtime=new Runtime({electron,paths:f.paths});
    await runtime.start();await runtime.plugins.refresh();await runtime.shutdown();
    assert.equal(fs.readFileSync(file,"utf8"),"11");
});
test("legacy preference failure retains an exact backup and reports recovery path",async()=>{
    const {paths}=fixture(),store=new ConfigStore(paths),prefs=new Preferences(store,paths);
    store.write(prefs.file,{enable_plugins:true});store.write(prefs.legacyFile,{enable_plugins:true,extra:"keep"});
    const before=fs.readFileSync(prefs.legacyFile),original=fs.renameSync;
    fs.renameSync=(from,to)=>{if(to===prefs.file)throw new Error("locked preferences");return original(from,to);};
    try{await assert.rejects(()=>prefs.save({enable_plugins:false}),/locked preferences/);}
    finally{fs.renameSync=original;}
    assert.deepEqual(fs.readFileSync(prefs.legacyFile),before);
});
test("plugin package with links is rejected without removing existing plugin",async()=>{
    const f=fixture(),root=makePlugin(f.paths,"demo"),prefs=new Preferences(new ConfigStore(f.paths),f.paths),lifecycle=new PluginLifecycle(f.paths,prefs,f.events);
    await lifecycle.install(root);const source=path.join(f.profile,"incoming");fs.mkdirSync(source);
    fs.writeFileSync(path.join(source,"manifest.json"),fs.readFileSync(path.join(root,"manifest.json")));
    fs.writeFileSync(path.join(source,"main.js"),"new");fs.writeFileSync(path.join(source,"preload.js"),"");fs.writeFileSync(path.join(source,"renderer.js"),"");
    fs.symlinkSync(path.join(root,"main.js"),path.join(source,"linked.js"));
    const result=await lifecycle.install(source);
    assert.equal(result.ok,false);assert.equal(fs.readFileSync(path.join(f.paths.plugins,"demo","main.js"),"utf8"),"module.exports={};");
});
