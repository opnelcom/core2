"use strict";
// Author the tour scenario using the same canonical schema convention as other seeds.
const fs = require("node:fs"), path = require("node:path");
const filename = path.resolve(__dirname, "../../Volumes/Core-ERP/seeds/template-defaults.json");
const seeds = JSON.parse(fs.readFileSync(filename, "utf8"));
const field = (type, title, attributes = {}) => ({type, title, uiWidth: type === "long_text" ? "full" : "medium", ...attributes});
const text = title => field("text", title, {maxLength: 200});
const notes = title => field("long_text", title, {maxLength: 4000, rows: 3});
const integer = (title, minimum = 1) => field("integer", title, {minimum, maximum: 100000, uiWidth: "short"});
const money = title => field("currency", title, {precision: 14, scale: 2, minimum: 0});
const choice = (title, codes) => field("select", title, {options: codes.map(code => ({code, description: code.replaceAll("_", " ").replace(/^./, c => c.toUpperCase())}))});
const ref = (title, type, kind = "accounting_object") => field("reference", title, {target: {class: kind, ...(type ? {types: [type]} : {})}, uiWidth: "wide"});
function schema(properties, required = [], tabs = []) {
  Object.values(properties).forEach((f, index) => {f.sortOrder = (index + 1) * 10;});
  return {type: "object", properties, required, additionalProperties: false, ...(tabs.length ? {tabs} : {})};
}
const grid = (title, properties, required, extra = {}) => field("grid", title, {uiWidth: "full", rowSchema: schema(properties, required), ...extra});
const status = values => ({...choice("Tour workflow status", values), default: "draft", helpText: "Changed by workflow actions after saving."});
const time = title => field("date_time", title, {helpText: "Organisation local time. Use the same local time convention on all departures."});
const commercial = () => ({
  currencyCode: choice("Currency", seeds.currencies.map(row => row[0])),
  documentDate: field("date", "Document date"),
  taxInclusive: field("boolean", "Prices include tax", {default: false}),
  lines: grid("Price lines", {
    description: text("Description"), pricingBasis: choice("Pricing basis", ["per_person", "per_tour"]),
    quantity: integer("Tour quantity"), unitPrice: money("Unit price"),
    taxCode: choice("Tax code", seeds.taxTypeSeeds.filter(t => t.direction !== "input" && t.code !== "VID").map(t => t.code))
  }, ["description", "pricingBasis", "quantity", "unitPrice", "taxCode"], {maxRows: 200}),
  netAmount: money("Net amount"), taxAmount: money("Tax amount"), totalAmount: money("Total amount"),
  commercialNotes: notes("Commercial terms")
});
const commercialFields = ["currencyCode", "documentDate", "taxInclusive", "lines", "netAmount", "taxAmount", "totalAmount", "commercialNotes"];
const definitions = {
  tour: ["Tour", schema({tourMode: choice("Tour mode", ["scheduled", "private", "both"]), description: notes("Description"), durationDays: integer("Duration (days)"), itinerary: grid("Itinerary", {day: integer("Day"), activity: text("Activity"), location: text("Location"), notes: notes("Notes")}, ["day", "activity"]), inclusions: notes("Inclusions"), exclusions: notes("Exclusions")}, ["tourMode"], [{label: "Tour", fields: ["tourMode", "description", "durationDays", "inclusions", "exclusions"]}, {label: "Itinerary", fields: ["itinerary"]}])],
  tour_guide: ["Tour guide", schema({resource: ref("Guide resource", null, "resource"), phone: text("Phone"), registrationNumber: text("Guide registration"), registrationExpiry: field("date", "Registration expiry"), languages: text("Languages"), qualifications: notes("Qualifications"), notes: notes("Notes")}, ["resource"])],
  tour_vehicle: ["Tour vehicle", schema({registration: text("Registration"), passengerSeats: integer("Passenger seats (excluding driver/guide)"), asset: ref("Asset account", "asset", "subledger_account"), licenceExpiry: field("date", "Vehicle licence expiry"), notes: notes("Notes")}, ["registration", "passengerSeats"])],
  tour_departure: ["Tour departure", schema({tour: ref("Tour", "tour"), departureMode: choice("Departure mode", ["scheduled", "private"]), startAt: time("Start"), endAt: time("End"), capacity: integer("Passenger capacity"), meetingPoint: text("Meeting point"), operationalStatus: status(["draft", "cancelled"]), notes: notes("Notes")}, ["tour", "departureMode", "startAt", "endAt", "capacity"])],
  tour_booking: ["Tour booking", schema({departure: ref("Departure", "tour_departure"), customer: ref("Customer", "customer", "subledger_account"), passengerCount: integer("Passengers"), contactName: text("Contact name"), contactEmail: field("email", "Contact email", {maxLength: 254}), contactPhone: text("Contact phone"), operationalStatus: status(["draft", "confirmed", "cancelled"]), sourceQuote: ref("Accepted quote", "tour_quote"), ...commercial(), passengers: grid("Passenger manifest", {name: text("Name"), phone: text("Phone"), requirements: notes("Requirements")}, ["name"], {maxRows: 10000}), payments: grid("Manual deposits and refunds", {date: field("date", "Date"), kind: choice("Movement", ["deposit", "payment", "refund"]), amount: money("Amount"), reference: text("Payment reference"), notes: notes("Notes")}, ["date", "kind", "amount", "reference"]), notes: notes("Notes")}, ["departure", "customer", "passengerCount"], [{label: "Booking", fields: ["departure", "customer", "passengerCount", "contactName", "contactEmail", "contactPhone", "operationalStatus", "sourceQuote", "notes"]}, {label: "Pricing", fields: commercialFields}, {label: "Passengers", fields: ["passengers"]}, {label: "Payments", fields: ["payments"]}])],
  tour_job_card: ["Tour job card", schema({departure: ref("Departure", "tour_departure"), operationalStatus: status(["draft", "released", "completed", "cancelled"]), guides: grid("Allocated guides", {guide: ref("Guide", "tour_guide"), duty: text("Duty")}, ["guide"], {uniqueBy: ["guide"]}), vehicles: grid("Allocated vehicles", {vehicle: ref("Vehicle", "tour_vehicle"), notes: notes("Notes")}, ["vehicle"], {uniqueBy: ["vehicle"]}), instructions: notes("Instructions"), completionNotes: notes("Completion notes")}, ["departure"], [{label: "Job", fields: ["departure", "operationalStatus", "instructions", "completionNotes"]}, {label: "Guides", fields: ["guides"]}, {label: "Vehicles", fields: ["vehicles"]}])],
  tour_quote: ["Tour quote", schema({departure: ref("Departure", "tour_departure"), customer: ref("Customer", "customer", "subledger_account"), passengerCount: integer("Passengers"), booking: ref("Origin booking", "tour_booking"), acceptedBooking: ref("Accepted booking", "tour_booking"), validUntil: field("date", "Valid until"), operationalStatus: status(["draft", "accepted", "cancelled"]), ...commercial()}, ["departure", "customer", "passengerCount"], [{label: "Quote", fields: ["departure", "customer", "passengerCount", "booking", "acceptedBooking", "validUntil", "operationalStatus"]}, {label: "Pricing", fields: commercialFields}])],
  tour_invoice: ["Tour invoice", schema({booking: ref("Booking", "tour_booking"), departure: ref("Departure", "tour_departure"), customer: ref("Customer", "customer", "subledger_account"), passengerCount: integer("Passengers"), dueDate: field("date", "Due date"), operationalStatus: status(["draft"]), exchangeRate: field("decimal", "Exchange rate to base currency", {precision: 18, scale: 8, minimum: 0.00000001}), transactionId: field("short_text", "Accounting transaction", {maxLength: 36, uiWidth: "wide", helpText: "Created by the Draft transaction action."}), ...commercial()}, ["booking", "departure", "customer", "passengerCount"], [{label: "Invoice", fields: ["booking", "departure", "customer", "passengerCount", "dueDate", "operationalStatus", "exchangeRate", "transactionId"]}, {label: "Pricing", fields: commercialFields}])]
};
const moduleCode = "tour_management";
if (!seeds.moduleSeeds.some(row => row[0] === moduleCode)) seeds.moduleSeeds.push([moduleCode, "Tour Management", 170, seeds.moduleSeeds.find(row => row[0] === "project_management")[3]]);
for (const [code, [name, definition]] of Object.entries(definitions)) {
  if (!seeds.accountingObjectTypeSeeds.some(row => row[0] === code)) seeds.accountingObjectTypeSeeds.push([code, name]);
  seeds.accountingObjectTypeMetadata[code] = {schema_json: definition};
  seeds.moduleMappings.accountingObjectTypes[code] = [moduleCode];
}
if (!seeds.transactionGroups.some(row => row[0] === "tour_sales")) seeds.transactionGroups.push(["tour_sales", "Tour sales", 170]);
seeds.moduleMappings.transactionGroups.tour_sales = [moduleCode];
if (!seeds.transactionTypes.some(row => row[0] === "tour_customer_invoice")) seeds.transactionTypes.push(["tour_customer_invoice", "tour_sales", "Tour customer invoice", "Draft accounting invoice linked to a tour booking, departure and invoice record.", 10, false]);
for (const line of [["tour_customer_invoice", 1, "debit", "1100", true, "customer", "Customer receivable", "required", "tour_customer_invoice_1", "balancing"], ["tour_customer_invoice", 2, "credit", "4000", false, null, "Tour revenue", "required", "tour_customer_invoice_2", "manual"], ["tour_customer_invoice", 3, "credit", "2100", false, null, "Output tax", "optional", "tour_customer_invoice_3", "manual"]]) {
  if (!seeds.lineDefinitionSeeds.some(row => row[0] === line[0] && row[1] === line[1])) seeds.lineDefinitionSeeds.push(line);
}
const reference = (type, code, kind = "accounting_object") => ({$ref: [kind, type, code]});
const example = (type, code, name, data, kind = "accounting_object") => ({class: kind, type, code, name, data});
const pricing = {currencyCode: "ZAR", documentDate: "2026-10-10", taxInclusive: false, lines: [{description: "Example day tour", pricingBasis: "per_person", quantity: 1, unitPrice: "1000.00", taxCode: "VE"}], netAmount: "2000.00", taxAmount: "0.00", totalAmount: "2000.00", commercialNotes: "Illustrative manual tax selection; choose the appropriate tax treatment for actual sales."};
const exampleScenario = {moduleCode, objectTypes: Object.keys(definitions), financialSetup: {transactionType: "tour_customer_invoice", outputTaxGlCode: "2100"}, resources: [{code: "TOUR-DEMO-GUIDE", name: "Example tour guide", type: "employee"}], examples: [
  example("customer", "TOUR-DEMO-CUSTOMER", "Example tour customer", {}, "subledger_account"),
  example("tour", "TOUR-DAY", "Example scenic day tour", {tourMode: "both", durationDays: 1, description: "Illustrative own-operated tour", itinerary: [{day: 1, activity: "Scenic drive", location: "Example viewpoint"}]}),
  example("tour_guide", "TOUR-GUIDE", "Example tour guide profile", {resource: reference("employee", "TOUR-DEMO-GUIDE", "resource"), languages: "English"}),
  example("tour_vehicle", "TOUR-VEHICLE", "Example tour minibus", {registration: "DEMO-001", passengerSeats: 12}),
  ...["scheduled", "private"].map((mode, i) => example("tour_departure", `TOUR-${mode.toUpperCase()}`, `Example ${mode} departure`, {tour: reference("tour", "TOUR-DAY"), departureMode: mode, startAt: `2026-11-${10 + i}T08:00`, endAt: `2026-11-${10 + i}T17:00`, capacity: mode === "private" ? 2 : 12, operationalStatus: "draft"})),
  example("tour_booking", "TOUR-BOOKING", "Example two-person booking", {departure: reference("tour_departure", "TOUR-SCHEDULED"), customer: reference("customer", "TOUR-DEMO-CUSTOMER", "subledger_account"), passengerCount: 2, operationalStatus: "draft", ...pricing, passengers: [{name: "Example passenger one"}, {name: "Example passenger two"}]}),
  example("tour_job_card", "TOUR-JOB", "Example departure job card", {departure: reference("tour_departure", "TOUR-SCHEDULED"), operationalStatus: "draft", guides: [{guide: reference("tour_guide", "TOUR-GUIDE"), duty: "Lead guide"}], vehicles: [{vehicle: reference("tour_vehicle", "TOUR-VEHICLE")}]}),
  example("tour_quote", "TOUR-QUOTE", "Example draft tour quote", {departure: reference("tour_departure", "TOUR-SCHEDULED"), customer: reference("customer", "TOUR-DEMO-CUSTOMER", "subledger_account"), passengerCount: 2, booking: reference("tour_booking", "TOUR-BOOKING"), operationalStatus: "draft", ...pricing}),
  example("tour_invoice", "TOUR-INVOICE", "Example draft tour invoice", {booking: reference("tour_booking", "TOUR-BOOKING"), departure: reference("tour_departure", "TOUR-SCHEDULED"), customer: reference("customer", "TOUR-DEMO-CUSTOMER", "subledger_account"), passengerCount: 2, operationalStatus: "draft", ...pricing})
]};
seeds.exampleData=(seeds.exampleData||[]).filter(r=>!exampleScenario.examples.some(e=>e.class===r.class&&e.type===r.type&&e.code===r.code)).concat(exampleScenario.examples);
fs.writeFileSync(filename, JSON.stringify(seeds, null, 2) + "\n");
