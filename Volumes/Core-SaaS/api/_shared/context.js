'use strict';
const {withServices}=require('@core/service-client');
const {withSession}=require('./session');
module.exports.withContext=handler=>withServices(withSession(handler));
