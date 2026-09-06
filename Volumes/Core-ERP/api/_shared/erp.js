'use strict';

const schema=require('./erp/schema');
const seeding=require('./erp/seeding');
const auth=require('./erp/auth');
const access=require('./erp/access');
const utils=require('./erp/utils');
const journals=require('./erp/journals');

module.exports={
  ...schema,
  ...seeding,
  ...auth,
  ...access,
  ...utils,
  ...journals
};
