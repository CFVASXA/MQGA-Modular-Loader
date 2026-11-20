"use strict";
const {LoaderError} = require("../core/errors.js");

function sortPlugins(entries,platform = process.platform) {
    const map = new Map();
    for (const entry of entries) {
        if (map.has(entry.manifest.slug)) throw new LoaderError("duplicate-plugin",`Duplicate slug: ${entry.manifest.slug}`);
        map.set(entry.manifest.slug,entry);
    }
    const ordered = [],visited = new Set(),visiting = [],cycles = [],missing = [],incompatible = [];
    function visit(slug,parent) {
        if (visited.has(slug)) return;
        const index = visiting.indexOf(slug);
        if (index >= 0) { cycles.push([...visiting.slice(index),slug]); return; }
        const entry = map.get(slug);
        if (!entry) { if (parent) missing.push({parent,dependency:slug}); return; }
        visiting.push(slug);
        for (const dependency of entry.manifest.dependencies) visit(dependency,slug);
        visiting.pop();visited.add(slug);ordered.push(entry);
        if (!entry.manifest.platform.includes(platform)) incompatible.push(slug);
    }
    for (const entry of map.values()) visit(entry.manifest.slug);
    return {ordered,cycles,missing,incompatible};
}
module.exports = {sortPlugins};
