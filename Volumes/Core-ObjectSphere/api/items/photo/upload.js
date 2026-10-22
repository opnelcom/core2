'use strict';
const {uploadAttachment}=require('../_shared/attachments');

module.exports=ctx=>uploadAttachment(ctx,'photo',['image/']);

module.exports=require("../../_shared/context").withContext(module.exports);
