"use strict";
const {isValidSlug} = require("../core/slug.js");

function normalizeManifest(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Plugin manifest must be an object");
    for (const key of ["manifest_version","type","slug","name","version"]) {
        if (raw[key] === undefined) throw new Error(`Manifest missing: ${key}`);
    }
    if (!isValidSlug(raw.slug)) throw new Error("Invalid plugin slug");
    if (raw.platform !== undefined && (!Array.isArray(raw.platform) || !raw.platform.every((value) => typeof value === "string"))) throw new Error("platform must be a string array");
    if (raw.dependencies !== undefined && (!Array.isArray(raw.dependencies) || !raw.dependencies.every((value) => typeof value === "string"))) throw new Error("dependencies must be a string array");
    if (raw.injects !== undefined && (!raw.injects || typeof raw.injects !== "object" || Array.isArray(raw.injects))) throw new Error("injects must be an object");
    for (const stage of ["main","preload","renderer"]) {
        const file = raw.injects?.[stage];
        if (file === undefined) continue;
        if (typeof file !== "string" || !file || file.includes(String.fromCharCode(0)) || file.startsWith("/") || file.startsWith(String.fromCharCode(92)) || /^[A-Za-z]:/.test(file) || file.split(String.fromCharCode(92)).join("/").split("/").includes("..")) throw new Error(`Unsafe ${stage} entry`);
    }
    return {
        ...raw,
        platform:raw.platform || ["win32","linux","darwin"],
        dependencies:raw.dependencies || [],
        injects:raw.injects || {},
    };
}
module.exports = {normalizeManifest};
