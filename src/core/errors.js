"use strict";
class LoaderError extends Error {
    constructor(code,message,options = {}) {
        super(message,{cause:options.cause});
        this.name = "LoaderError";
        this.code = code;
        Object.assign(this,options.details || {});
    }
}
module.exports = {LoaderError};
