'use strict';
const {listComments}=require('../_shared/erp/comments');
module.exports=listComments;

module.exports=require("../_shared/context").withContext(module.exports);
