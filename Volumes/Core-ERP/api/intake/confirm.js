'use strict';
const {confirmIntake}=require('./_shared/intake');

module.exports=ctx=>confirmIntake(ctx);

module.exports=require("../_shared/context").withContext(module.exports);
