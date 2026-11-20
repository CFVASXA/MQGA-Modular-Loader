"use strict";
const {execFile} = require("node:child_process"),fs = require("node:fs"),path = require("node:path");
const {promisify} = require("node:util");
const {assertWithin} = require("../core/paths.js");
async function extract(file,destination,paths) {
    const absolute = assertWithin(file,[paths.profile,paths.root]);
    await fs.promises.mkdir(destination,{recursive:true});
    const {stdout} = await promisify(execFile)("tar",["-tf",absolute],{windowsHide:true,maxBuffer:8*1024*1024});
    const entries = String(stdout).split(/\r?\n/).filter(Boolean);
    if (entries.length > 4096) throw new Error("Archive has too many entries");
    for (const name of entries) {
        if (name.includes("\0") || /^([A-Za-z]:[\\/]|[\\/]{1,2})/.test(name) || name.split(/[\\/]/).includes("..")) throw new Error("Unsafe archive path");
    }
    await promisify(execFile)("tar",["-xf",absolute,"-C",destination,"--no-same-owner","--no-same-permissions"],{windowsHide:true});
}
module.exports = {extract};
