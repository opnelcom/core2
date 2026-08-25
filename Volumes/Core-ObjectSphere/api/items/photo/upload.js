'use strict';
const {uploadAttachment}=require('../_shared/attachments');

module.exports=ctx=>uploadAttachment(ctx,'photo',['image/']);
