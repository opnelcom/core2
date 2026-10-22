'use strict';
const {analyseIntake}=require('./_shared/intake');

module.exports=ctx=>analyseIntake(ctx);

module.exports=require("../_shared/context").withContext(module.exports);
