"use strict";
class Health {
    constructor() { this.components = new Map();this.events = []; }
    report(id,state,detail = {}) { this.components.set(id,{state,...detail,updatedAt:Date.now()}); }
    event(type,detail = {}) { this.events.push({type,...detail,at:Date.now()});if (this.events.length > 512) this.events.shift(); }
    snapshot() { return {components:Object.fromEntries(this.components),events:[...this.events]}; }
}
module.exports = {Health};
