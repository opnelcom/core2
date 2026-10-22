'use strict';
const {deleteAttachment}=require('../_shared/attachments');

module.exports=ctx=>deleteAttachment(ctx,'document');

module.exports=require("../../_shared/context").withContext(module.exports);
