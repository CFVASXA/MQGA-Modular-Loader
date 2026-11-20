import {build} from "esbuild";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
await build({
    entryPoints:[path.join(root,"legacy","lq-entry.js")],
    bundle:true,
    outfile:path.join(root,"legacy","lq.bundle.js"),
    platform:"browser",
    format:"iife",
    target:"chrome128",
    legalComments:"inline",
    sourcemap:false,
});
console.log("Legacy compatibility renderer rebuilt: legacy/lq.bundle.js");
