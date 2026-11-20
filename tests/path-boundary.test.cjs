"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {assertWithin,canonical}=require("../src/core/paths.js");
function tree(){return fs.mkdtempSync(path.join(os.tmpdir(),"mqga-path-test-"));}
test("file symlink escapes a permitted root",()=>{
    const root=tree(),outside=path.join(root,"outside"),link=path.join(root,"link.js");
    fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,"secret.txt"),"test");
    fs.symlinkSync(path.join(outside,"secret.txt"),link,"file");
    assert.throws(()=>assertWithin(link,[root]));
});
test("junction root itself is not inside its containing root",()=>{
    const root=tree(),outside=path.join(root,"outside"),link=path.join(root,"link");
    fs.mkdirSync(outside);fs.symlinkSync(outside,link,"junction");
    assert.throws(()=>assertWithin(link,[root]));
});
