// Preserve the original renderer/ESM/settings implementation as a compatibility adapter.
// New code should use typed runtime APIs rather than modify this legacy layer.
"use strict";
const fs = require("node:fs"),path = require("node:path");
const root = path.resolve(__dirname,"..");
let source = fs.readFileSync(path.join(root,"legacy","preload.js"),"utf8");
source = source.replace(/__dirname/g,JSON.stringify(path.join(root,"legacy")));
const marker = "// 登录页保护可在 data\\loader.json";
const override = `
info.paths = Object.assign({}, info.paths || {}, {root:${JSON.stringify(root)},preload:__filename,main:${JSON.stringify(path.join(root,"src","main.js"))}});
info.versions = Object.assign({}, info.versions || {}, {mqga:${JSON.stringify(require("../package.json").version)},liteloader:${JSON.stringify(require("../package.json").version)}});
info.loader = Object.assign({}, info.loader || {}, {version:${JSON.stringify(require("../package.json").version)},root:${JSON.stringify(root)}});
`;
if (!source.includes(marker)) throw new Error("Compatibility preload initialization marker missing");
source = source.replace(marker,override + marker);
new Function("require","module","exports","__filename","__dirname",source)(require,module,module.exports,__filename,__dirname);
