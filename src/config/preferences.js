"use strict";
const path = require("node:path");
const fs = require("node:fs");
const DEFAULTS = Object.freeze({enable_plugins:true,disabled_plugins:[],inject_settings_entry:true,renderer_inject:"webframe",protect_login:true,protected_plugins:[],debug_console:false});
class Preferences {
    constructor(store,paths) { this.store = store; this.paths = paths; this.file = path.join(paths.data,"loader.json"); this.legacyFile = path.join(paths.data,"LiteLoader","config.json"); }
    get() {
        const local = this.store.read(this.file,{}),legacy = this.store.read(this.legacyFile,{}),cfg = {...DEFAULTS,...local};
        if (typeof legacy.enable_plugins === "boolean") cfg.enable_plugins = legacy.enable_plugins;
        if (Array.isArray(legacy.disabled_plugins)) cfg.disabled_plugins = [...legacy.disabled_plugins];
        return cfg;
    }
    save(patch) {
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Preferences must be an object");
        if ("enable_plugins" in patch && typeof patch.enable_plugins !== "boolean") throw new TypeError("enable_plugins must be boolean");
        if ("disabled_plugins" in patch && (!Array.isArray(patch.disabled_plugins) || !patch.disabled_plugins.every((value) => typeof value === "string"))) throw new TypeError("disabled_plugins must be strings");
        return this.store.transaction(() => {
            const local = {...this.store.read(this.file,{}),...patch};
            const hasShared = "enable_plugins" in patch || "disabled_plugins" in patch;
            if (!hasShared) return this.store.write(this.file,local);
            const exists = fs.existsSync(this.legacyFile);
            let legacy = {},previous = null,backup = null;
            if (exists) {
                previous = fs.readFileSync(this.legacyFile);
                if (hasShared) legacy = this.store.legacy(this.legacyFile);
            }
            const nextLegacy = {...legacy};
            if ("enable_plugins" in patch) nextLegacy.enable_plugins = patch.enable_plugins;
            if ("disabled_plugins" in patch) nextLegacy.disabled_plugins = [...patch.disabled_plugins];
            const legacyChanged = hasShared && JSON.stringify(nextLegacy) !== JSON.stringify(legacy);
            if (legacyChanged) {
                fs.mkdirSync(path.dirname(this.legacyFile),{recursive:true});
                backup = this.legacyFile + ".backup-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
                fs.writeFileSync(backup,exists ? previous : Buffer.alloc(0),{flag:"wx"});
            }
            try {
                if (legacyChanged) this.store.write(this.legacyFile,nextLegacy);
                this.store.write(this.file,local);
                return local;
            } catch (error) {
                if (legacyChanged) {
                    try {
                        const expected = Buffer.from(JSON.stringify(nextLegacy,null,4),"utf8");
                        if (fs.readFileSync(this.legacyFile).equals(expected)) {
                            if (exists) fs.copyFileSync(backup,this.legacyFile);
                            else fs.unlinkSync(this.legacyFile);
                        } else throw new Error("Legacy configuration changed after this transaction");
                    } catch (rollbackError) {
                        error.recoveryPath = backup;
                        error.message += "; rollback failed: " + rollbackError.message;
                        backup = null;
                    }
                }
                throw error;
            } finally {
                if (backup) { try { fs.unlinkSync(backup); } catch (_) {} }
            }
        });
    }
}
module.exports = {Preferences,DEFAULTS};
