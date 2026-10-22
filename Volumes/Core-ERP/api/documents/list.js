'use strict';
const {listDocuments}=require('./_shared/documents');

module.exports=ctx=>listDocuments(ctx);

module.exports=require("../_shared/context").withContext(module.exports);
