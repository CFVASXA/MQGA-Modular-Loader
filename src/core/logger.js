"use strict";
const fs = require("node:fs"),path = require("node:path");
class Logger {
    constructor(paths) {
        this.paths = paths;
        this.queue = Promise.resolve();
        this.file = path.join(paths.logs,"loader.log");
        this.errors = 0;
    }
    stringify(value) {
        if (value instanceof Error) return value.stack || value.message;
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    write(level,args) {
        const line = `[${new Date().toISOString()}] [${level}] ` + args.map((value) => this.stringify(value)).join(" ");
        this.queue = this.queue.then(async () => {
            await fs.promises.mkdir(this.paths.logs,{recursive:true});
            await fs.promises.appendFile(this.file,line + "\r\n","utf8");
        }).catch((error) => { this.errors++; return error; });
        if (level === "error") this.errors++;
        return this.queue;
    }
    info(...args) { return this.write("info",args); }
    error(...args) { return this.write("error",args); }
    async flush() { await this.queue; }
}
module.exports = {Logger};
