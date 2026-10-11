"use strict";
// Reusable builders for the recommended template examples. Run explicitly to
// refresh their grid definitions; ordinary organisation setup does not run this tool.
const fs = require("node:fs"), path = require("node:path");
const file = path.resolve(__dirname, "../../Volumes/Core-ERP/seeds/template-defaults.json");
const seeds = JSON.parse(fs.readFileSync(file, "utf8"));
const text = (title, length=150) => ({ type: "text", title, maxLength:length, uiWidth:"medium" });
const code = title => ({ type:"short_text",title,maxLength:30,uiWidth:"short" });
const notes = title => ({type:"long_text",title,maxLength:4000,rows:3,uiWidth:"full"});
const date = title => ({type:"date",title,uiWidth:"short"});
const decimal = (title,scale=2) => ({type:"decimal",title,precision:14,scale,minimum:0,uiWidth:"short"});
const amount = title => ({type:"currency",title,precision:14,scale:2,minimum:0,uiWidth:"medium"});
const currency = () => ({...code("Currency"),maxLength:3,pattern:"[A-Z]{3}",placeholder:"ZAR"});
const select = (title,choices) => ({type:"select",title,options:choices.map(([value,label])=>({code:value,description:label})),uiWidth:"medium"});
const reference = (title,cls,types) => ({type:"reference",title,target:{class:cls,...(types?{types}: {})},uiWidth:"medium"});
const dimension = (title,type) => reference(title,"accounting_dimension",[type]);
const resource = title => reference(title,"resource");
const object = (title,type) => reference(title,"accounting_object",[type]);
const period = groupBy => ({from:"effectiveFrom",to:"effectiveTo",groupBy,allowOverlap:false});
const dates = () => ({effectiveFrom:date("Effective from"),effectiveTo:date("Effective to")});
function grid(title,properties,required=[],periodControl,helpText) {
  Object.values(properties).forEach((field,index) => { field.sortOrder = (index + 1) * 10; });
  return {type:"grid",title,uiWidth:"full",rowSchema:{type:"object",properties,required,additionalProperties:false},...(periodControl?{periodControl}:{}),...(helpText?{helpText}:{})};
}
const contacts = () => grid("Contacts",{name:text("Contact name"),role:text("Role"),email:{type:"email",title:"Email",maxLength:254,uiWidth:"wide"},phone:code("Phone")},["name"]);
const addresses = () => grid("Addresses",{addressType:select("Address type",[["billing","Billing"],["delivery","Delivery"],["postal","Postal"],["other","Other"]]),address:notes("Address")},["addressType","address"]);
const valuations = () => grid("Market values",{valuationDate:date("Valuation date"),amount:amount("Market value"),currencyCode:currency(),method:dimension("Valuation method","valuation_method"),valuer:resource("Valuer"),notes:notes("Notes")},["valuationDate","amount","currencyCode"],undefined,"Dated valuation observations; corrections are preserved in whole-object versions. No automatic financial postings.");
const milestones = () => grid("Milestones",{milestone: text("Milestone"),targetDate:date("Target date"),status:select("Status",[["planned","Planned"],["in_progress","In progress"],["complete","Complete"]]),notes:notes("Notes")},["milestone","targetDate"]);
const participants = () => grid("Participants",{resource:resource("Resource"),role:text("Project role"),notes:notes("Responsibilities")},["resource","role"],undefined,"Reference directory; these rows do not grant permissions or replace Resources assignments.");
const budget = () => grid("Budget breakdown",{category:text("Budget category"),...dates(),amount:amount("Planned amount"),currencyCode:currency()},["category","effectiveFrom","amount","currencyCode"],period(["category"]),"Planning reference only; no postings. The built-in budget amount remains the headline budget.");
const responsibilities = () => grid("Responsibilities",{resource:resource("Resource"),responsibility:text("Responsibility"),...dates()},["resource","responsibility","effectiveFrom"],period(["resource","responsibility"]),"Responsibility directory; Resources assignments remain authoritative for access and assignment rules.");
const targets = () => grid("Planning targets",{targetType:text("Target type"),...dates(),quantity:decimal("Target quantity"),unit:dimension("Unit","measurement_unit"),amount:amount("Target amount"),currencyCode:currency()},["targetType","effectiveFrom"],period(["targetType"]),"Reference targets only. Quantity/unit or amount/currency may be supplied as appropriate.");
const mappings = () => grid("External mappings",{codingSystem:code("Coding system"),externalCode:code("External code"),description:text("Description")},["codingSystem","externalCode"]);
function add(schema,key,field) {
  schema.properties[key]=field;
  schema.tabs ||= Object.keys(schema.properties).filter(k=>k!==key).length?[{label:"Type details",fields:Object.keys(schema.properties).filter(k=>k!==key)}]:[];
  const existing=schema.tabs.find(tab=>tab.fields.includes(key));
  if(!existing)schema.tabs.push({label:field.title,fields:[key]});
}
const ledger=(type,key,field)=>add(seeds.ledgerFamilySchemas[type],key,field);
const accounting=(type,key,field)=>add(seeds.accountingObjectTypeMetadata[type].schema_json,key,field);
const dim=(type,key,field)=>add(seeds.accountingDimensionTypeMetadata[type].schema_json,key,field);

ledger("bank","contacts",contacts());
ledger("bank","bankingTerms",grid("Banking terms",{termType:select("Term type",[["service_fee","Service fee"],["interest","Interest"],["overdraft","Overdraft"]]),...dates(),value:decimal("Value",4),unit:select("Value unit",[["percent","Percent"],["amount","Currency amount"]]),currencyCode:currency()},["termType","effectiveFrom","value","unit"],period(["termType"]),"Reference terms only; no charge or interest calculation."));
for(const type of ["customer","vendor"]){ledger(type,"contacts",contacts());ledger(type,"addresses",addresses());}
ledger("customer","commercialTerms",grid("Commercial terms",{termType:select("Term type",[["credit_limit","Credit limit"],["payment_days","Payment days"],["discount_percent","Discount percent"]]),...dates(),value:decimal("Value",2),currencyCode:currency()},["termType","effectiveFrom","value"],period(["termType"]),"Reference terms; current creditLimit and paymentTerms remain the primary single-field settings."));
ledger("vendor","paymentAccounts",grid("Payment accounts",{bankName:text("Bank"),accountName:text("Account name"),accountNumber:{...code("Account number"),maxLength:34},currencyCode:currency()},["bankName","accountName","accountNumber","currencyCode"],undefined,"Alternative reference accounts; primary bank fields remain unchanged. No payment execution."));
ledger("employee","qualifications",grid("Qualifications",{qualification:text("Qualification"),institution:text("Institution"),awardDate:date("Award date"),expiryDate:date("Expiry date")},["qualification"]));
ledger("employee","employmentAssignments",grid("Employment assignments",{team:object("Team","team"),department:text("Department"),role:text("Role"),...dates()},["role","effectiveFrom"],period(["team","department","role"]),"Reference assignments; existing jobTitle and department are current headline details."));
ledger("cash_point","responsibilities",responsibilities());
ledger("cash_point","operatingHours",grid("Operating hours",{weekday:select("Weekday",[["mon","Monday"],["tue","Tuesday"],["wed","Wednesday"],["thu","Thursday"],["fri","Friday"],["sat","Saturday"],["sun","Sunday"]]),opens:{...code("Opens"),maxLength:5,pattern:"(?:[01][0-9]|2[0-3]):[0-5][0-9]",placeholder:"08:00"},closes:{...code("Closes"),maxLength:5,pattern:"(?:[01][0-9]|2[0-3]):[0-5][0-9]",placeholder:"17:00"}},["weekday","opens","closes"]));
ledger("asset","marketValues",valuations());
ledger("asset","components",grid("Components",{componentCode:code("Component code"),description:text("Description"),condition:select("Condition",[["good","Good"],["fair","Fair"],["poor","Poor"]]),responsibleResource:resource("Responsible resource")},["componentCode","description"]));
ledger("asset","measurements",grid("Measurements",{measurementDate:date("Measurement date"),measurementType:dimension("Measurement type","measurement_type"),quantity:decimal("Quantity",4),unit:dimension("Unit","measurement_unit")},["measurementDate","measurementType","quantity","unit"]));
for(const [fn,type] of [[ledger,"capex_project"],[accounting,"opex_project"]]){fn(type,"milestones",milestones());fn(type,"budgetBreakdown",budget());fn(type,"participants",participants());}
ledger("loan","interestTerms",grid("Interest terms",{rateComponent:select("Rate component",[["fixed","Fixed rate"],["base","Base rate"],["margin","Margin"]]),...dates(),ratePercent:decimal("Annual rate (%)",4)},["rateComponent","effectiveFrom","ratePercent"],period(["rateComponent"]),"Rates are percentages (7.5 means 7.5%); reference only. Current interestRate remains unchanged."));
ledger("loan","repaymentSchedule",grid("Repayment schedule",{dueDate:date("Due date"),principal:amount("Planned principal"),interest:amount("Planned interest"),currencyCode:currency()},["dueDate","currencyCode"],undefined,"Planned repayments; actual payments remain transactions."));
ledger("loan","securities",grid("Securities",{securityType:text("Security type"),property:object("Property","property"),description:text("Description"),amount:amount("Security value"),currencyCode:currency()},["securityType"]));

accounting("property","marketValues",valuations());
accounting("property","measurements",grid("Measurements",{dimensionType:dimension("Dimension type","measurement_type"),...dates(),quantity:decimal("Quantity",4),unit:dimension("Unit","measurement_unit")},["dimensionType","effectiveFrom","quantity","unit"],period(["dimensionType"]),"Period-based measurements grouped by dimension type. Existing areaSqm is a headline area; these rows describe specifically named measurements."));
accounting("property","features",grid("Features",{featureType:dimension("Feature type","property_feature_type"),value:{type:"integer",title:"Value",minimum:0,uiWidth:"short"}},["featureType","value"],undefined,"Counts such as bedrooms, bathrooms and garages. No period control."));
accounting("team","members",grid("Members",{resource:resource("Resource"),role:text("Team role"),...dates(),notes:notes("Responsibilities")},["resource","role","effectiveFrom"],period(["resource","role"]),"Membership directory; rows do not change permissions or replace Resources assignments."));
accounting("team","responsibilities",grid("Responsibilities",{responsibilityType:text("Responsibility type"),description:notes("Description")},["responsibilityType"]));
accounting("region","externalIdentifiers",mappings());accounting("region","contacts",contacts());
for(const type of ["cost_centre","profit_centre"]){accounting(type,"responsibilities",responsibilities());accounting(type,"planningTargets",targets());}
accounting("contract","fixedCharges",grid("Fixed charges",{chargeComponent:dimension("Charge component","charge_component"),...dates(),amount:amount("Amount"),currencyCode:currency(),frequency:select("Frequency",[["once","Once"],["monthly","Monthly"],["quarterly","Quarterly"],["annually","Annually"]])},["chargeComponent","effectiveFrom","amount","currencyCode","frequency"],period(["chargeComponent"]),"Reference charges only; no automatic billing or postings."));
accounting("contract","parties",grid("Parties",{party:reference("Party","legal_entity"),role:select("Role",[["customer","Customer"],["supplier","Supplier"],["landlord","Landlord"],["tenant","Tenant"],["guarantor","Guarantor"],["other","Other"]]),notes:notes("Notes")},["party","role"]));accounting("contract","milestones",milestones());
accounting("utility_meter","readings",grid("Readings",{readingDateTime:{type:"date_time",title:"Reading date/time",uiWidth:"medium"},registerType:select("Register type",[["import","Import"],["export","Export"],["total","Total"]]),reading:decimal("Cumulative reading",4),unit:dimension("Unit","measurement_unit"),method:select("Reading method",[["actual","Actual"],["estimated","Estimated"]]),event:select("Meter event",[["normal","Normal"],["reset","Reset"],["rollover","Rollover"],["replacement","Replacement"]]),notes:notes("Notes")},["readingDateTime","registerType","reading","unit","method"],undefined,"Dated cumulative readings, not consumption. No automatic consumption calculation; resets and replacements must be recorded."));
accounting("utility_meter","installations",grid("Installations",{installationSlot:code("Installation slot"),property:object("Property","property"),...dates(),notes:notes("Notes")},["installationSlot","property","effectiveFrom"],period(["installationSlot"])));

for(const type of ["revenue_type","expense_type"])dim(type,"externalMappings",mappings());
dim("service","characteristics",grid("Characteristics",{characteristicType:text("Characteristic type"),value:text("Value"),unit:dimension("Unit","measurement_unit")},["characteristicType","value"]));
dim("charge_component","referenceRates",grid("Reference rates",{rateCategory:text("Rate category"),...dates(),amount:amount("Rate"),currencyCode:currency(),chargingUnit:dimension("Charging unit","measurement_unit")},["rateCategory","effectiveFrom","amount","currencyCode"],period(["rateCategory"]),"Reference rates only; contract-specific amounts are held on the contract."));

const referenceTypes=[
  ["measurement_type","Measurement Type",[["gross_lettable_area","Gross Lettable Area"],["retail_space","Retail Space"],["usable_area","Usable Area"],["land_area","Land Area"],["weight","Weight"],["capacity","Capacity"]]],
  ["measurement_unit","Measurement Unit",[["sqm","Square metre (m²)"],["kwh","Kilowatt-hour (kWh)"],["kl","Kilolitre (kL)"],["m3","Cubic metre (m³)"],["kg","Kilogram (kg)"],["count","Count"],["month","Month"]]],
  ["property_feature_type","Property Feature Type",[["bedrooms","Bedrooms"],["bathrooms","Bathrooms"],["garages","Garages"],["parking_bays","Parking bays"]]],
  ["valuation_method","Valuation Method",[["independent","Independent valuation"],["market_comparison","Market comparison"],["internal_estimate","Internal estimate"]]],
];
for(const [type,name,records] of referenceTypes){
  if(!seeds.accountingDimensionTypeSeeds.some(([code])=>code===type))seeds.accountingDimensionTypeSeeds.push([type,name]);
  seeds.accountingDimensionTypeMetadata[type] ||= {schema_json:{type:"object",properties:{description:notes("Description")},required:[],additionalProperties:false}};
  seeds.moduleMappings.accountingDimensionTypes[type]=["property_management","asset_management","finance"];
  for(const [recordCode,recordName] of records)if(!seeds.accountingDimensionSeeds.some(([t,c])=>t===type&&c===recordCode))seeds.accountingDimensionSeeds.push([type,recordCode,recordName]);
}
for(const [c,n] of [["rent","Rent"],["maintenance","Maintenance"]])if(!seeds.accountingDimensionSeeds.some(([t,code])=>t==="charge_component"&&code===c))seeds.accountingDimensionSeeds.push(["charge_component",c,n]);
fs.writeFileSync(file,JSON.stringify(seeds,null,2)+"\n");
console.log("Updated template grid schemas and shared reference types.");
