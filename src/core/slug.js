"use strict";
function isValidSlug(value) {
    return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." &&
        !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && value === value.trim() &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) && !value.startsWith(".");
}
module.exports = {isValidSlug};
