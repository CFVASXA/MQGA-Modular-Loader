"use strict";
const fs = require("node:fs"),os = require("node:os"),path = require("node:path");
const {createPaths} = require("../src/core/paths.js");
const {EventHub} = require("../src/core/events.js");
const {EventEmitter} = require("node:events");

const temp = fs.mkdtempSync(path.join(os.tmpdir(),"mqga-rewrite-test-"));
process.on("exit",() => fs.rmSync(temp,{recursive:true,force:true}));
function fixture() {
    const root = fs.mkdtempSync(path.join(temp,"runtime-")),profile = path.join(root,"profile");
    fs.mkdirSync(profile,{recursive:true});
    const paths = createPaths({root,profile}),events = new EventHub();
    fs.mkdirSync(paths.plugins,{recursive:true});
    return {root,profile,paths,events};
}
function makePlugin(paths,slug,files = {},manifest = {}) {
    const root = path.join(paths.plugins,slug);
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(path.join(root,"manifest.json"),JSON.stringify({
        manifest_version:4,type:"extension",slug,name:slug,version:"1.0.0",dependencies:[],platform:["win32","linux","darwin"],
        injects:{main:"main.js",preload:"preload.js",renderer:"renderer.js"},...manifest,
    }));
    for (const [file,content] of Object.entries({"main.js":"module.exports={};","preload.js":"","renderer.js":"",...files})) {
        if (content === null) continue;
        fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
        fs.writeFileSync(path.join(root,file),content);
    }
    return root;
}
function electronFixture() {
    const app = new EventEmitter();let ready = false;
    app.isReady = () => ready;
app.getVersion = () => "fixture";
    app.commandLine = {appendSwitch:() => {}};
    const listeners = new Map(),handlers = new Map(),schemes = new Map();
    const ipcMain = {on:(name,fn) => listeners.set(name,fn),handle:(name,fn) => handlers.set(name,fn)};
    class BrowserWindow { constructor(){ this.webContents = {session:null,send(){},on(){}}; } }
    const session = {defaultSession:{registerPreloadScript(){},protocol:{handle(){}}}};
    const electron = {app,ipcMain,session,shell:{openExternal:async()=>{},openPath:async()=>""},dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})},protocol:{registerSchemesAsPrivileged(){},handle:(name,handler)=>{schemes.set(name,handler);return Promise.resolve();}},net:{fetch:async(url)=>({ok:true,url})},BrowserWindow};
    return {electron,listeners,handlers,schemes,setReady:(value)=>{ready=value; if(value)app.emit("ready");}};
}
module.exports = {fixture,makePlugin,electronFixture,temp};
