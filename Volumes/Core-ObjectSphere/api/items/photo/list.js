'use strict';
const {listAttachments}=require('../_shared/attachments');

module.exports=ctx=>listAttachments(ctx,'photo');

module.exports=require("../../_shared/context").withContext(module.exports);
