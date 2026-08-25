'use strict';
const {listAttachments}=require('../_shared/attachments');

module.exports=ctx=>listAttachments(ctx,'document');
