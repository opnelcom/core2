"use strict";
// Explicit generator for recommended insurance configuration. Runtime upgrades
// insert missing definitions/examples; they do not rerun this generator.
const fs=require("node:fs"),path=require("node:path");
const file=path.resolve(__dirname,"../../Volumes/Core-ERP/seeds/template-defaults.json");
const s=JSON.parse(fs.readFileSync(file,"utf8"));
const insuranceModule="insurance_management";
const moduleRow=[insuranceModule,"Insurance Management",160,'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>'];
const moduleIndex=s.moduleSeeds.findIndex(row=>row[0]===insuranceModule);
if(moduleIndex<0)s.moduleSeeds.push(moduleRow);else s.moduleSeeds[moduleIndex]=moduleRow;

const text=(title,maxLength=150)=>({type:"text",title,maxLength,uiWidth:"medium"});
const code=title=>({type:"short_text",title,maxLength:50,uiWidth:"short"});
const date=title=>({type:"date",title,uiWidth:"short"});
const money=title=>({type:"currency",title,precision:14,scale:2,minimum:0,uiWidth:"medium"});
const notes=title=>({type:"long_text",title,maxLength:4000,rows:2,uiWidth:"full"});
const currency=()=>({...code("Currency"),maxLength:3,pattern:"[A-Z]{3}",placeholder:"ZAR"});
const ref=(title,cls,types)=>({type:"reference",title,target:{class:cls,...(types?{types}:{})},uiWidth:"medium"});
const dim=(title,type)=>ref(title,"accounting_dimension",[type]);
const item=()=>({type:"reference",title:"Insured item",target:{anyOf:[{class:"subledger_account",types:["asset"]},{class:"accounting_object",types:["property"]}]},uiWidth:"wide"});
const select=(title,values)=>({type:"select",title,options:values.map(([code,description])=>({code,description})),uiWidth:"medium"});
const ordered=properties=>{Object.values(properties).forEach((f,i)=>f.sortOrder=(i+1)*10);return properties;};
const grid=(title,properties,required=[],extra={})=>({type:"grid",title,uiWidth:"full",rowSchema:{type:"object",properties:ordered(properties),required,additionalProperties:false},...extra});
const period=groupBy=>({from:"effectiveFrom",to:"effectiveTo",groupBy,allowOverlap:false});
const dates=()=>({effectiveFrom:date("Effective from"),effectiveTo:date("Effective to")});
const root=(properties,required,tabs)=>({type:"object",properties:ordered(properties),required,additionalProperties:false,tabs:tabs.map(([label,fields])=>({label,fields}))});
const policy=root({
 policyNumber:code("Policy number"),insurer:ref("Insurer","subledger_account",["vendor"]),broker:ref("Broker","subledger_account",["vendor"]),policyholder:ref("Policyholder","legal_entity"),responsibleResource:ref("Responsible resource","resource"),
 startDate:date("Start date"),expiryDate:date("Expiry date"),renewalReviewDate:date("Renewal review date"),currencyCode:currency(),paymentFrequency:select("Payment frequency",[["annual","Annual"],["quarterly","Quarterly"],["monthly","Monthly"],["other","Other"]]),cancellationTerms:notes("Cancellation terms"),
 coverage:grid("Coverage",{coverType:dim("Cover type","insurance_cover_type"),...dates(),limit:money("Coverage limit"),excessAmount:money("Excess amount"),excessPercent:{type:"decimal",title:"Excess (%)",precision:7,scale:4,minimum:0,maximum:100,uiWidth:"short"},exclusions:notes("Exclusions")},["coverType","effectiveFrom","limit"],{periodControl:period(["coverType"]),helpText:"Limits and excesses are reference terms, not automatic claim calculations. State shared limits in exclusions/notes; insured value differs from book and market value."}),
 insuredItems:grid("Insured items",{item:item(),coverType:dim("Cover type","insurance_cover_type"),...dates(),insuredValue:money("Insured value"),specificExcess:money("Specific excess"),notes:notes("Notes")},["item","coverType","effectiveFrom","insuredValue"],{periodControl:period(["item","coverType"])}),
 premiumSchedule:grid("Premium schedule",{coverageFrom:date("Coverage from"),coverageTo:date("Coverage to"),dueDate:date("Due date"),premium:money("Premium"),fees:money("Fees"),tax:money("Tax"),total:money("Total")},["coverageFrom","coverageTo","dueDate","premium","total"],{helpText:"Reference schedule in policy currency. Amounts are entered explicitly; totals, journals and tax are not calculated automatically."}),
 endorsements:grid("Endorsements",{reference:code("Endorsement reference"),effectiveDate:date("Effective date"),description:notes("Change description"),premiumAdjustment:{type:"currency",title:"Premium adjustment",precision:14,scale:2,uiWidth:"medium"}},["reference","effectiveDate","description"])
},["policyNumber","insurer","policyholder","startDate","expiryDate","currencyCode"],[["Policy",["policyNumber","insurer","broker","policyholder","responsibleResource"]],["Terms",["startDate","expiryDate","renewalReviewDate","currencyCode","paymentFrequency","cancellationTerms"]],["Coverage",["coverage"]],["Insured items",["insuredItems"]],["Premium schedule",["premiumSchedule"]],["Endorsements",["endorsements"]]]);
const claim=root({
 policy:ref("Insurance policy","accounting_object",["insurance_policy"]),insurerClaimReference:code("Insurer claim reference"),responsibleResource:ref("Claims handler","resource"),incidentDate:date("Incident date"),location:text("Incident location"),cause:dim("Claim cause","insurance_claim_cause"),description:notes("Incident description"),currencyCode:currency(),claimStage:select("Claim stage",[["reported","Reported"],["submitted","Submitted"],["assessing","Under assessment"],["approved","Approved"],["partially_settled","Partially settled"],["settled","Settled"],["declined","Declined"],["withdrawn","Withdrawn"]]),
 affectedItems:grid("Affected items",{item:{...item(),referenceSource:{field:"policy",grid:"insuredItems",column:"item"}},damage:notes("Damage description"),estimatedLoss:money("Estimated loss"),claimedAmount:money("Claimed amount")},["item","damage","claimedAmount"],{helpText:"Items must be listed on the saved selected policy. Estimates and claimed amounts do not recognise receivables or post journals."}),
 assessor:ref("Assessor","resource"),assessmentDate:date("Assessment date"),approvedAmount:money("Approved amount"),excessAmount:money("Excess amount"),
 events:grid("Claim events",{date:date("Date"),eventType:select("Event type",[["notification","Notification"],["submission","Submission"],["assessment","Assessment"],["decision","Decision"],["correspondence","Correspondence"],["settlement","Settlement"]]),resource:ref("Resource","resource"),notes:notes("Notes")},["date","eventType","notes"]),
 settlementComponents:grid("Settlement breakdown",{component:text("Component"),approvedAmount:money("Approved amount"),recipient:ref("Recipient supplier","subledger_account",["vendor"]),notes:notes("Notes")},["component","approvedAmount"],{helpText:"Approved settlement breakdown only. Actual receipts and payments remain claim-linked accounting transactions."})
},["policy","incidentDate","cause","description","currencyCode","claimStage"],[["Claim",["policy","insurerClaimReference","responsibleResource","claimStage","currencyCode"]],["Incident",["incidentDate","location","cause","description"]],["Affected items",["affectedItems"]],["Assessment",["assessor","assessmentDate","approvedAmount","excessAmount"]],["Events",["events"]],["Settlement",["settlementComponents"]]]);
const put=(list,row)=>{const i=list.findIndex(old=>old[0]===row[0]);if(i<0)list.push(row);else list[i]=row;};
for(const [type,name,schema] of [["insurance_policy","Insurance policy",policy],["insurance_claim","Insurance claim",claim]]){
 put(s.accountingObjectTypeSeeds,[type,name]);s.accountingObjectTypeMetadata[type]={schema_json:schema};s.moduleMappings.accountingObjectTypes[type]=[insuranceModule];
}
const covers=[["property_damage","Property damage"],["motor","Motor"],["equipment","Equipment"],["theft","Theft"],["liability","Liability"],["business_interruption","Business interruption"]];
const causes=[["fire","Fire"],["theft","Theft"],["collision","Collision"],["storm","Storm"],["accidental_damage","Accidental damage"],["mechanical_failure","Mechanical failure"]];
for(const [type,name,records] of [["insurance_cover_type","Insurance cover type",covers],["insurance_claim_cause","Insurance claim cause",causes]]){
 put(s.accountingDimensionTypeSeeds,[type,name]);s.accountingDimensionTypeMetadata[type]={schema_json:root({description:notes("Description")},[],[])};s.moduleMappings.accountingDimensionTypes[type]=[insuranceModule];
 for(const [code,name] of records)if(!s.accountingDimensionSeeds.some(([t,c])=>t===type&&c===code))s.accountingDimensionSeeds.push([type,code,name]);
}
const accounts=[["1250","Prepaid Insurance","asset",false,null],["1260","Insurance Recoveries Receivable","asset",false,null],["2060","Insurance Premium Accrual","liability",false,null],["4120","Insurance Recoveries","revenue",false,null],["5760","Insurance Premium Expense","expense",false,null],["5770","Insurance Broker Fees","expense",false,null]];
accounts.forEach(a=>put(s.chartTemplate,a));put(s.transactionGroups,["insurance","Insurance",75]);s.moduleMappings.transactionGroups.insurance=[insuranceModule];
const transactions=[
 ["insurance_premium_invoice","Premium invoice","Supplier invoice for coverage paid in advance; enter tax lines only when supported by the applicable tax treatment.",[["debit","1250",false,null,"Prepaid premium"],["credit","2000",true,"vendor","Insurer or broker payable"]]],
 ["insurance_premium_credit","Premium credit","Credit unused prepaid premium; reverse already-expensed portions with appropriate manual lines.",[["debit","2000",true,"vendor","Supplier credit"],["credit","1250",false,null,"Prepaid premium credit"]]],
 ["insurance_premium_payment","Premium payment","Settle insurance supplier invoices.",[["debit","2000",true,"vendor","Supplier payment"],["credit","1010",true,"bank","Bank payment"]]],
 ["insurance_premium_allocation","Premium allocation","Manual allocation of prepaid coverage to current-period expense; no generated journals.",[["debit","5760",false,null,"Current coverage expense"],["credit","1250",false,null,"Release prepaid premium"]]],
 ["insurance_premium_accrual","Premium accrual","Record insurance coverage incurred but not invoiced, subject to approved accounting policy.",[["debit","5760",false,null,"Insurance expense accrual"],["credit","2060",false,null,"Accrued premium"]]],
 ["insurance_accrual_reversal","Premium accrual reversal","Reverse the previously recorded insurance premium accrual.",[["debit","2060",false,null,"Reverse accrued premium"],["credit","5760",false,null,"Reverse insurance expense accrual"]]],
 ["insurance_recovery_recognition","Claim recovery recognition","Post only when recognition criteria are met and approved; submitting or approving a claim does not create this journal.",[["debit","1260",false,null,"Recognised recovery receivable"],["credit","4120",false,null,"Insurance recovery"]]],
 ["insurance_settlement_receipt","Claim settlement receipt","Receive a full or partial settlement against a recognised receivable.",[["debit","1010",true,"bank","Settlement received"],["credit","1260",false,null,"Clear recovery receivable"]]],
 ["insurance_premium_refund","Premium refund receipt","Receive cash for a previously recognised supplier premium credit.",[["debit","1010",true,"bank","Premium refund received"],["credit","2000",true,"vendor","Clear supplier premium credit"]]]
];
s.lineDefinitionSeeds=s.lineDefinitionSeeds.filter(row=>!transactions.some(([code])=>code===row[0]));
const classifications=[];
transactions.forEach(([code,name,description,lines],i)=>{
 delete s.moduleMappings.transactionTypeAdditions[code];
 put(s.transactionTypes,[code,"insurance",name,description,700+i*10,code==="insurance_premium_invoice"||code==="insurance_premium_credit"]);
 lines.forEach(([dc,gl,requiresSubledger,subledger,description],j)=>{
  const lineCode=`${code}_${j+1}`;s.lineDefinitionSeeds.push([code,j+1,dc,gl,requiresSubledger,subledger,description,"required",lineCode,"manual"]);
  classifications.push({line_code:lineCode,object_types:code.includes("recovery")||code.includes("settlement")?["insurance_policy","insurance_claim"]:["insurance_policy"]});
 });
});
for(const type of ["insurance_premium_invoice","insurance_premium_credit"]){
 const dc=type==="insurance_premium_invoice"?"debit":"credit";
 for(const [order,gl,label] of [[3,"5770","Separately identified broker fees"],[4,"2200","Input tax only where applicable and recoverable"]]){
  const lineCode=`${type}_${order}`;s.lineDefinitionSeeds.push([type,order,dc,gl,false,null,label,"optional",lineCode,"manual"]);
  classifications.push({line_code:lineCode,object_types:["insurance_policy"]});
 }
}
// Dedicated metadata drives additive template upgrades and full template seeding.
const exampleScenario={moduleCode:insuranceModule,objectTypes:["insurance_policy","insurance_claim"],dimensionTypes:["insurance_cover_type","insurance_claim_cause"],glCodes:accounts.map(a=>a[0]),transactionTypes:transactions.map(t=>t[0]),lineClassifications:classifications,examples:[
 {class:"subledger_account",type:"vendor",code:"DEMO-INSURER",name:"Example Insurance Company",data:{}},
 {class:"subledger_account",type:"vendor",code:"DEMO-BROKER",name:"Example Insurance Broker",data:{}},
 {class:"accounting_object",type:"property",code:"INS-DEMO-PROPERTY",name:"Example insured warehouse",data:{physicalAddress:"Example warehouse site"}},
 {class:"subledger_account",type:"asset",code:"INS-DEMO-VEHICLE",name:"Example delivery vehicle",data:{assetTag:"VEH-001",assetCategory:"Vehicle"}},
 {class:"subledger_account",type:"asset",code:"INS-DEMO-EQUIPMENT",name:"Example workshop equipment",data:{assetTag:"EQP-001",assetCategory:"Equipment"}},
 {class:"accounting_object",type:"insurance_policy",code:"INS-PROPERTY-2026",name:"Example annual property policy",data:{policyNumber:"DEMO-PROP-2026",insurer:{$ref:["subledger_account","vendor","DEMO-INSURER"]},broker:{$ref:["subledger_account","vendor","DEMO-BROKER"]},policyholder:{$ref:["legal_entity","company","INS-DEMO-OWNER"]},startDate:"2026-01-01",expiryDate:"2026-12-31",renewalReviewDate:"2026-11-01",currencyCode:"ZAR",paymentFrequency:"annual",coverage:[{coverType:{$ref:["accounting_dimension","insurance_cover_type","property_damage"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",limit:"5000000.00",excessAmount:"10000.00"}],insuredItems:[{item:{$ref:["accounting_object","property","INS-DEMO-PROPERTY"],mixed:true},coverType:{$ref:["accounting_dimension","insurance_cover_type","property_damage"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",insuredValue:"5000000.00",specificExcess:"10000.00"}],premiumSchedule:[{coverageFrom:"2026-01-01",coverageTo:"2026-12-31",dueDate:"2026-01-01",premium:"60000.00",fees:"0.00",tax:"0.00",total:"60000.00"}]}},
 {class:"accounting_object",type:"insurance_policy",code:"INS-ASSETS-2026",name:"Example vehicle and equipment policy",data:{policyNumber:"DEMO-ASSETS-2026",insurer:{$ref:["subledger_account","vendor","DEMO-INSURER"]},policyholder:{$ref:["legal_entity","company","INS-DEMO-OWNER"]},startDate:"2026-01-01",expiryDate:"2026-12-31",renewalReviewDate:"2026-11-01",currencyCode:"ZAR",paymentFrequency:"annual",coverage:[{coverType:{$ref:["accounting_dimension","insurance_cover_type","motor"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",limit:"450000.00"},{coverType:{$ref:["accounting_dimension","insurance_cover_type","equipment"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",limit:"150000.00"}],insuredItems:[{item:{$ref:["subledger_account","asset","INS-DEMO-VEHICLE"],mixed:true},coverType:{$ref:["accounting_dimension","insurance_cover_type","motor"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",insuredValue:"450000.00"},{item:{$ref:["subledger_account","asset","INS-DEMO-EQUIPMENT"],mixed:true},coverType:{$ref:["accounting_dimension","insurance_cover_type","equipment"]},effectiveFrom:"2026-01-01",effectiveTo:"2026-12-31",insuredValue:"150000.00"}],premiumSchedule:[{coverageFrom:"2026-01-01",coverageTo:"2026-12-31",dueDate:"2026-01-01",premium:"24000.00",fees:"0.00",tax:"0.00",total:"24000.00"}]}},
 {class:"accounting_object",type:"insurance_claim",code:"INS-CLAIM-001",name:"Example vehicle claim with partial settlement",data:{policy:{$ref:["accounting_object","insurance_policy","INS-ASSETS-2026"]},insurerClaimReference:"DEMO-CLAIM-001",incidentDate:"2026-06-15",location:"Example delivery route",cause:{$ref:["accounting_dimension","insurance_claim_cause","collision"]},description:"Illustrative collision damage. Example records do not post accounting transactions.",currencyCode:"ZAR",claimStage:"partially_settled",affectedItems:[{item:{$ref:["subledger_account","asset","INS-DEMO-VEHICLE"],mixed:true},damage:"Body repairs",estimatedLoss:"30000.00",claimedAmount:"30000.00"}],assessmentDate:"2026-06-20",approvedAmount:"25000.00",excessAmount:"5000.00",events:[{date:"2026-06-15",eventType:"notification",notes:"Incident notified"},{date:"2026-06-20",eventType:"decision",notes:"25000 approved after excess"},{date:"2026-07-01",eventType:"settlement",notes:"Illustrative first settlement of 10000. No journal seeded; a further 15000 remains operationally outstanding."}],settlementComponents:[{component:"Vehicle repairs",approvedAmount:"25000.00",notes:"Actual cash movements must be recorded as claim-linked transactions."}]}}
]};
// Add insurance GLs to the existing account groups rather than leaving financial reports incomplete.
for(const format of s.financialStatementFormatSeeds)for(const line of format.lines){
 const opts=line[line.length-1];if(!opts||!Array.isArray(opts.accounts))continue;
 if(opts.accounts.includes("1200"))opts.accounts.push(...["1250","1260"].filter(c=>!opts.accounts.includes(c)));
 if(opts.accounts.includes("2050")&&!opts.accounts.includes("2060"))opts.accounts.push("2060");
 if(opts.accounts.includes("4100")&&!opts.accounts.includes("4120"))opts.accounts.push("4120");

}
for(const format of s.financialStatementFormatSeeds){
 for(const line of format.lines){const opts=line[5];if(opts?.accounts)opts.accounts=opts.accounts.filter(c=>!["5760","5770"].includes(c));}
 if(format.code==="income_standard"){
  if(!format.lines.some(l=>l[0]==="INSURANCE"))format.lines.push(["INSURANCE","Insurance Expense","account_group","OPEX",460,{accounts:["5760","5770"]}]);
  format.lines.find(l=>l[0]==="INSURANCE")[5].accounts=["5760","5770"];
  const net=format.lines.find(l=>l[0]==="NET");if(!net[5].formula.subtract.includes("INSURANCE"))net[5].formula.subtract.push("INSURANCE");
 }
 if(format.code==="income_management")format.lines.find(l=>l[0]==="OPERATING")[5].accounts.push("5760","5770");
}
s.lineClassificationSeeds=(s.lineClassificationSeeds||[]).filter(r=>!r.lineCode.startsWith('insurance_')).concat(exampleScenario.lineClassifications.flatMap(row=>row.object_types.map((type,i)=>({lineCode:row.line_code,class:'accounting_object',type,requirement:'mandatory',valueBehaviour:'captured',sortOrder:(i+1)*10}))));
s.exampleData=(s.exampleData||[]).filter(r=>!exampleScenario.examples.some(e=>e.class===r.class&&e.type===r.type&&e.code===r.code)).concat(exampleScenario.examples);
fs.writeFileSync(file,JSON.stringify(s,null,2)+"\n");console.log("Insurance types, reference vocabulary, GLs, transactions and examples generated.");
