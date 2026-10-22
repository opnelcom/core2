'use strict';
const {uploadAttachment}=require('../_shared/attachments');

module.exports=ctx=>uploadAttachment(ctx,'document');

module.exports=require("../../_shared/context").withContext(module.exports);
