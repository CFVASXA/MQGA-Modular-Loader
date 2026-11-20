"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {fixture,makePlugin,electronFixture}=require("./helpers.cjs");
const {createApi}=require("../src/compat/liteloader-api.js");
const {ConfigStore}=require("../src/config/store.js");
const {Preferences}=require("../src/config/preferences.js");
const {PluginManager}=require("../src/plugins/manager.js");
const {ServiceHub}=require("../src/core/context.js");
const {Runtime}=require("../src/core/runtime.js");
function apiFixture(){
    const f=fixture();makePlugin(f.paths,"demo");
    const store=new ConfigStore(f.paths),prefs=new Preferences(store,f.paths),services=new ServiceHub();
    const plugins=new PluginManager({paths:f.paths,events:f.events,preferences:prefs,events:f.events,logger:{info(){},error(){}},contextFactory:()=>({})});
    const electron={shell:{openExternal:async()=>{},openPath:async()=>""},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[f.root]})}};
    const operations={install:async()=>({ok:true}),uninstall:async()=>({ok:true}),setEnabled:async(slug,enabled)=>{const disabled=prefs.get().disabled_plugins.filter(item=>item!==slug);if(!enabled)disabled.push(slug);await prefs.save({disabled_plugins:[...new Set(disabled)]});await plugins.refresh();return true;},version:()=>"0.2.0",qqVersion:()=>"fixture"};
    return {...f,api:createApi({plugins,preferences:prefs,store,paths:f.paths,electron,operations,logger:{info(){}},services})};
}
test("legacy public plugins include manifest, inject paths and compatibility fields",async()=>{
    const f=apiFixture();await f.api.reloadPlugins();
    const plugin=f.api.pluginsInfo().demo;
    assert.equal(plugin.manifest.slug,"demo");
    assert.ok(plugin.path.injects.main.endsWith("main.js"));
    assert.ok(plugin.path.injects.preload.endsWith("preload.js"));
    assert.ok(plugin.path.injects.renderer.endsWith("renderer.js"));
    const info=f.api.info();assert.equal(info.versions.mqga,"0.2.0");
});
test("legacy config, disable/enable, install and delete method shapes are retained",async()=>{
    const f=apiFixture();await f.api.reloadPlugins();
    f.api.config.set("demo",{value:1});assert.equal(f.api.config.get("demo",{}).value,1);
    await f.api.plugin.disable("demo");assert.equal(f.api.pluginsInfo().demo.disabled,true);
    await f.api.plugin.enable("demo");assert.equal(f.api.pluginsInfo().demo.disabled,false);
    assert.equal((await f.api.plugin.install("source",{})).ok,true);
    assert.equal((await f.api.plugin.delete("demo",{mode:"none"})).ok,true);
});
test("legacy pick/install APIs preserve async result rather than serializing Promise",async()=>{
    const f=apiFixture();const result=await f.api.pickAndInstallPlugin("zip");
    assert.equal(result.ok,true);assert.equal(result.path,f.root);
});
test("legacy file helpers cannot access path-prefix neighbor directories",()=>{
    const f=apiFixture();const file=f.paths.root+"-other/file.txt";
    assert.equal(f.api.exists(file),false);assert.equal(f.api.readText(file),null);assert.equal(f.api.writeText(file,"bad"),false);
});
test("old global plugin hooks still receive BrowserWindow, login and app ready events",async()=>{
    const f=fixture(),eventFile=path.join(f.profile,"events.json");
    makePlugin(f.paths,"demo",{'main.js':`const fs=require("node:fs");const state=[];function save(){fs.writeFileSync(${JSON.stringify(eventFile)},JSON.stringify(state));}module.exports={onBrowserWindowCreated(w){state.push(w.webContents.id);save()},onLogin(uid){state.push(uid);save()},onReady(){state.push("ready");save()}};`});
    const {electron,setReady}=electronFixture();setReady(false);const runtime=new Runtime({electron,paths:f.paths});await runtime.start();
    runtime.sessions.instrument({webContents:{session:{registerPreloadScript(){}},id:7,send(){},on(){}}});
    electron.app.emit("ready");await new Promise(resolve=>setTimeout(resolve,120));
    assert.deepEqual(JSON.parse(fs.readFileSync(eventFile,"utf8")),[7,"ready"]);
    runtime.sessions.electron=electron;
    await runtime.shutdown();
});
test("legacy startup loads native QQ and publishes explicit status",async()=>{
    const {electron,setReady}=electronFixture();setReady(true);
    const root=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"mqga-entry-test-")),native=path.join(root,"resources","app","application.asar","app_launcher","index.js");
    fs.mkdirSync(path.dirname(native),{recursive:true});fs.writeFileSync(native,"");
    const module={exports:{}};let loaded=false;
    const req=(id)=>{
        if(id==="electron")return electron;
        if(id===native){loaded=true;return{};}
        if(id==="./core/runtime.js")return {Runtime:class{constructor(){this.paths={root};this.logger={info(){}}}async start(){}} };
        if(id==="../package.json")return{version:"test"};
        return require(id);
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../src/main.js"),"utf8"),{require:req,module,exports:module.exports,__dirname:path.join(__dirname,"../src"),global:{},process:{pid:1,resourcesPath:path.join(root,"resources")},setImmediate:fn=>fn(),console});
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(loaded,true);assert.equal(module.exports.ready,true);assert.equal(module.exports.qqStarted,true);
});
test("legacy preload adapter still contains renderer and LiteLoader global bridge",()=>{
    const source=fs.readFileSync(path.join(__dirname,"../legacy/preload.js"),"utf8");
    assert.match(source,/expose\("MQGA"/);assert.match(source,/expose\("LiteLoader"/);
    assert.match(source,/loadPluginPreloads/);assert.match(source,/loadRendererScripts/);
    assert.match(source,/local:\/\/\//);
    assert.match(source,/lq\.bundle\.js/);
    assert.ok(fs.existsSync(path.join(__dirname,"../legacy/lq.bundle.js")));
});
test("compatibility preload retains login protection and legacy script loading",()=>{
    const source=fs.readFileSync(path.join(__dirname,"../legacy/preload.js"),"utf8");
    assert.match(source,/MQGA_AUTH_PAGE/);assert.match(source,/protect_login/);
    assert.match(source,/login\.html|passport\.qq\.com|ptlogin/);
    assert.match(source,/loadPluginPreloads\(\)/);assert.match(source,/loadRendererScripts\(\)/);
    assert.match(source,/getPathForFile/);assert.match(source,/moduleCache/);
});
