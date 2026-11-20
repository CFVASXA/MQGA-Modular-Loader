"use strict";
const fs = require("node:fs"),path = require("node:path");
const {createPaths} = require("./paths.js");
const {EventHub} = require("./events.js");
const {ServiceHub} = require("./context.js");
const {Logger} = require("./logger.js");
const {Health} = require("./health.js");
const {ConfigStore} = require("../config/store.js");
const {Preferences} = require("../config/preferences.js");
const {PluginManager} = require("../plugins/manager.js");
const {PluginLifecycle} = require("../plugins/lifecycle.js");
const {createApi} = require("../compat/liteloader-api.js");
const {createIpcBridge} = require("../compat/ipc.js");
const {SessionInjector} = require("../electron/session.js");
const {ResourceProtocol} = require("../electron/protocol.js");
const {exposeLegacyGlobals,installLegacyEvents,createPluginContext} = require("../compat/bootstrap.js");
const {AdapterRegistry} = require("../adapters/index.js");
class Runtime {
    constructor({electron,paths = createPaths(),requireModule = require} = {}) {
        this.paths = paths;this.events = new EventHub();this.services = new ServiceHub();this.logger = new Logger(paths);this.health = new Health();this.adapters = new AdapterRegistry();
        this.config = new ConfigStore(paths);this.preferences = new Preferences(this.config,paths);
        this.requireModule = requireModule;
        this.requireModule.cache = this.requireModule.cache || {};
        this.electron = electron || requireModule("electron");
        this.requireModule.cache = this.requireModule.cache || {electron:{exports:this.electron}};
        this.plugins = new PluginManager({paths,events:this.events,preferences:this.preferences,logger:this.logger,contextFactory:({entry,scope}) => createPluginContext({entry,scope},this),requireModule});
        this.lifecycle = new PluginLifecycle(paths,this.preferences,this.events,this.logger);
        this.sessions = new SessionInjector(paths.preload,this.events);
        this.protocol = new ResourceProtocol(this.electron,paths,this.logger);
        this.operations = {
            install:(source,options) => this.lifecycle.install(source,options).then(async(result) => { if (result.ok) await this.plugins.refresh(); return result; }),
            uninstall:(slug,options) => this.lifecycle.uninstall(slug,options).then(async(result) => { if (result.ok) await this.plugins.refresh(); return result; }),
            setEnabled:async(slug,enabled) => {
                    const disabled = this.preferences.get().disabled_plugins.filter((item) => item !== slug);
                if (!enabled) disabled.push(slug);
                await this.preferences.save({disabled_plugins:[...new Set(disabled)]});
                await this.plugins.refresh();return true;
            },
            version:() => require("../../package.json").version,
            qqVersion:() => { try { return requireModule(path.join(process.resourcesPath,"app","package.json")).version; } catch (_) { return "unknown"; } },
        };
        this.api = createApi({plugins:this.plugins,preferences:this.preferences,store:this.config,paths,electron:this.electron,operations:this.operations,logger:this.logger,services:this.services});
        this.services.register("plugins",this.plugins);
        this.services.register("events",this.events);
        this.services.register("config.get",(slug,defaults) => this.config.get(slug,defaults));
        this.services.register("config.set",(slug,value) => this.config.set(slug,value));
        this.services.register("health",this.health);
        this.events.on("catalog:changed",(report) => this.health.event("catalog",report));
        this.events.on("plugin:loaded",({slug}) => this.health.report("plugin:" + slug,"loaded"));
        this.events.on("plugins:refreshed",() => {
            try { for (const wc of this.electron.webContents?.getAllWebContents?.() || []) wc.send("mqga.rerun"); } catch (error) { this.logger.error("Renderer reload notification failed",error); }
        });
    }
    async start() {
        for (const dir of [this.paths.data,this.paths.plugins,this.paths.logs]) await fs.promises.mkdir(dir,{recursive:true});
        this.protocol.registerPrivileges();
        this.sessions.install(this.requireModule,this.electron);
        this.electron.app.on("session-created",(session) => { this.sessions.attach(session);this.protocol.register(session.protocol); });
        if (this.electron.app.isReady()) {
            this.sessions.attach(this.electron.session.defaultSession);
            this.protocol.register(this.electron.protocol);
        } else this.electron.app.once("ready",() => {
            this.sessions.attach(this.electron.session.defaultSession);
            this.protocol.register(this.electron.protocol);
            this.events.emit("app:ready",{});
        });
        this.electron.app.commandLine.appendSwitch("fetch-schemes","local,mqga");
        createIpcBridge({electron:this.electron,api:this.api,paths:this.paths,logger:this.logger});
        this.eventDisposers = installLegacyEvents({events:this.events,plugins:this.plugins});
        await this.lifecycle.applyPendingDeletions().catch((error) => this.logger.error("Queued deletion failed",error));
        this.health.report("runtime","started",{version:this.operations.version()});
        const plugins = await this.plugins.refresh();
        this.exposeGlobals();
        this.logger.info("Modular MQGA runtime started",plugins);
        return plugins;
    }
    exposeGlobals() {
        const api = this.api,paths = this.paths;
        const info = {
            api,plugins:api.pluginsInfo(),path:paths,paths,versions:{qqnt:this.operations.qqVersion(),mqga:this.operations.version(),liteloader:this.operations.version(),...process.versions},
            package:{mqga:require("../../package.json"),qqnt:{}},os:{platform:process.platform},loader:api.loader,
        };
        exposeLegacyGlobals(globalThis,info);
        this.globals = info;
    }
    async shutdown() {
        this.events.emit("shutdown",{});
        this.eventDisposers?.dispose();await this.logger.flush();
    }
}
module.exports = {Runtime};
