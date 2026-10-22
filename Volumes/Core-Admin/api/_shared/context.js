'use strict';
const {withServices}=require('@core/service-client');
const {withIdentity}=require('@core/identity-client');
module.exports.withContext=handler=>withServices(withIdentity(handler));
