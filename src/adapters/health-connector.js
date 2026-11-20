"use strict";
function createHealthConnector(health) {
    return {id:"health",description:"Inspectable runtime/component state",capabilities:["read-health"],connect:() => health.snapshot()};
}
module.exports = {createHealthConnector};
