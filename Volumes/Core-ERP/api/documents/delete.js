'use strict';
const {deleteDocument}=require('./_shared/documents');

module.exports=ctx=>deleteDocument(ctx);

module.exports=require("../_shared/context").withContext(module.exports);
