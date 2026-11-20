"use strict";
const ok = (value) => ({ok:true,value});
const fail = (code,message,cause) => ({ok:false,error:{code,message,cause}});
function resultOf(fn) {
    try { return ok(fn()); } catch (error) { return fail("operation-failed",error?.message || String(error),error); }
}
module.exports = {ok,fail,resultOf};
