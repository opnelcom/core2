'use strict';
const {deleteAttachment}=require('../_shared/attachments');

module.exports=ctx=>deleteAttachment(ctx,'wireframe');
