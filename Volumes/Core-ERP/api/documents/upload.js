'use strict';
const {uploadDocument}=require('./_shared/documents');

module.exports=ctx=>uploadDocument(ctx);

module.exports=require("../_shared/context").withContext(module.exports);
