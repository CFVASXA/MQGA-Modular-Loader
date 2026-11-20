"use strict";
const fs = require("node:fs");
const path = require("node:path");
function canonical(file) {
    let current = path.resolve(String(file));
    const tail = [];
    while (!fs.existsSync(current)) {
        const parent = path.dirname(current);
        if (parent === current) break;
        tail.unshift(path.basename(current));current = parent;
    }
    if (fs.existsSync(current)) current = fs.realpathSync(current);
    return path.resolve(current,...tail);
}
function isWithin(file,root) {
    const relative = path.relative(canonical(root),canonical(file));
    return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}
function assertNoRedirect(root) {
    const absolute = path.resolve(String(root));
    const missing = [];
    let existing = absolute;
    while (!fs.existsSync(existing)) {
        const parent = path.dirname(existing);
        if (parent === existing) break;
        missing.push(path.basename(existing));existing = parent;
    }
    if (path.resolve(fs.realpathSync(existing)) !== path.resolve(existing)) throw new Error(`Redirected permitted root: ${root}`);
    // Walk down to the root, resolving any existing links on its path.
    for (const part of missing.reverse()) existing = path.join(existing,part);
    return existing;
}
function assertWithin(file,roots) {
    if (typeof file !== "string" || !file || file.includes(String.fromCharCode(0))) throw new Error("Invalid path");
    const resolved = canonical(file);
    if (!roots.some((root) => isWithin(resolved,root))) throw new Error(`Path outside permitted roots: ${resolved}`);
    const absolute = path.resolve(String(file));
    for (const candidate of roots) {
        const candidateAbsolute = path.resolve(candidate);
        if (fs.existsSync(candidateAbsolute) && fs.lstatSync(candidateAbsolute).isSymbolicLink()) throw new Error(`Redirected permitted root: ${candidateAbsolute}`);
    }
    const root = roots.find((candidate) => isWithin(absolute,candidate));
    if (!root) throw new Error(`Path outside permitted roots: ${absolute}`);
    assertNoRedirect(root);
    const relative = path.relative(path.resolve(root),absolute);
    if (relative) {
        let current = path.resolve(root);
        for (const part of relative.split(path.sep)) {
            current = path.join(current,part);
            if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic-link traversal rejected: ${current}`);
        }
    }
    return resolved;
}
function createPaths({root = path.resolve(__dirname,"../.."),profile = process.env.MQGA_PROFILE || root} = {}) {
    const paths = {root,profile,data:path.join(profile,"data"),plugins:path.join(profile,"plugins"),logs:path.join(root,"logs")};
    paths.main = path.join(root,"src","main.js");paths.preload = path.join(root,"src","preload.js");
    paths.bin = path.join(root,"bin");
    return paths;
}
module.exports = {canonical,isWithin,assertWithin,assertNoRedirect,createPaths};
