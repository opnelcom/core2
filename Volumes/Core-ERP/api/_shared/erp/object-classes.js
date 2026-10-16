'use strict';
// Trusted metadata shared by object reports and record actions.
module.exports=Object.freeze({
 subledger_account:{table:'erp_subledger_account',id:'subledger_account_id',type:'subledger_account_type_id',types:'erp_subledger_account_type',code:'account_code',name:'account_name',label:'Sub Ledger'},
 accounting_object:{table:'erp_accounting_object',id:'accounting_object_id',type:'accounting_object_type_id',types:'erp_accounting_object_type',code:'object_code',name:'object_name',label:'Accounting Object'},
 accounting_dimension:{table:'erp_accounting_dimension',id:'accounting_dimension_id',type:'accounting_dimension_type_id',types:'erp_accounting_dimension_type',code:'dimension_code',name:'dimension_name',label:'Accounting Dimension'}
});
