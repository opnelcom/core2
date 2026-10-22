'use strict';
const {submitComment}=require('../_shared/erp/comments');
module.exports=submitComment;

module.exports=require("../_shared/context").withContext(module.exports);
