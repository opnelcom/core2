# Template organisation: custom schema fields

Generated from `Volumes/Core-ERP/seeds/template-defaults.json`. Regenerate with `node Tools/ERP/export-template-schema-table.js`.

One row per custom field or grid column (gridKey.columnKey), plus one row per empty type. Covers all three classes that use the documented custom-schema system. Built-in record fields (code, name, owner division, etc.) are outside this table. Other setup classes and transaction posting definitions do not use this custom-schema registry. The legacy top-level customerSchema is excluded because it is not the active customer type schema.

Enums lists allowed choices defined by enum or options, including labels where supplied. Reference target identifies the ERP class and permitted types. Period control is blank when no effective-period validation applies. Root custom fields are optional; Required on a grid column applies to each row that is added.

| Object class | Type code | Type name | Field key | Field label | Field type | Required | Tab | Enums | Reference target | Period control |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Subledger | bank | Bank account | bankName | Bank Name | text | No | Bank |  |  |  |
| Subledger | bank | Bank account | branchName | Branch Name | text | No | Bank |  |  |  |
| Subledger | bank | Bank account | branchCode | Branch Code | short_text | No | Bank |  |  |  |
| Subledger | bank | Bank account | accountNumber | Account Number | short_text | No | Account |  |  |  |
| Subledger | bank | Bank account | accountName | Account Name | text | No | Account |  |  |  |
| Subledger | bank | Bank account | accountType | Account Type | select | No | Account | current: Current / Cheque; savings: Savings; transmission: Transmission; credit: Credit; other: Other |  |  |
| Subledger | bank | Bank account | swiftCode | SWIFT Code | short_text | No | International |  |  |  |
| Subledger | bank | Bank account | iban | IBAN | short_text | No | International |  |  |  |
| Subledger | bank | Bank account | currencyCode | Currency Code | short_text | No | Account |  |  |  |
| Subledger | bank | Bank account | contacts | Contacts | grid | No | Contacts |  |  |  |
| Subledger | bank | Bank account | contacts.name | Contact name | text | Yes | Contacts |  |  |  |
| Subledger | bank | Bank account | contacts.role | Role | text | No | Contacts |  |  |  |
| Subledger | bank | Bank account | contacts.email | Email | email | No | Contacts |  |  |  |
| Subledger | bank | Bank account | contacts.phone | Phone | short_text | No | Contacts |  |  |  |
| Subledger | bank | Bank account | bankingTerms | Banking terms | grid | No | Banking terms |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["termType"],"allowOverlap":false} |
| Subledger | bank | Bank account | bankingTerms.termType | Term type | select | Yes | Banking terms | service_fee: Service fee; interest: Interest; overdraft: Overdraft |  |  |
| Subledger | bank | Bank account | bankingTerms.effectiveFrom | Effective from | date | Yes | Banking terms |  |  |  |
| Subledger | bank | Bank account | bankingTerms.effectiveTo | Effective to | date | No | Banking terms |  |  |  |
| Subledger | bank | Bank account | bankingTerms.value | Value | decimal | Yes | Banking terms |  |  |  |
| Subledger | bank | Bank account | bankingTerms.unit | Value unit | select | Yes | Banking terms | percent: Percent; amount: Currency amount |  |  |
| Subledger | bank | Bank account | bankingTerms.currencyCode | Currency | short_text | No | Banking terms |  |  |  |
| Subledger | customer | Customer account | customerType | Customer Type | text | No | General |  |  |  |
| Subledger | customer | Customer account | registrationNumber | Registration Number | short_text | No | General |  |  |  |
| Subledger | customer | Customer account | taxNumber | Tax Number | short_text | No | General |  |  |  |
| Subledger | customer | Customer account | email | Email | email | No | Contact |  |  |  |
| Subledger | customer | Customer account | phone | Phone | short_text | No | Contact |  |  |  |
| Subledger | customer | Customer account | billingAddress | Billing Address | long_text | No | Contact |  |  |  |
| Subledger | customer | Customer account | paymentTerms | Payment Terms | text | No | Credit |  |  |  |
| Subledger | customer | Customer account | creditLimit | Credit Limit | currency | No | Credit |  |  |  |
| Subledger | customer | Customer account | currencyCode | Currency Code | short_text | No | Credit |  |  |  |
| Subledger | customer | Customer account | contacts | Contacts | grid | No | Contacts |  |  |  |
| Subledger | customer | Customer account | contacts.name | Contact name | text | Yes | Contacts |  |  |  |
| Subledger | customer | Customer account | contacts.role | Role | text | No | Contacts |  |  |  |
| Subledger | customer | Customer account | contacts.email | Email | email | No | Contacts |  |  |  |
| Subledger | customer | Customer account | contacts.phone | Phone | short_text | No | Contacts |  |  |  |
| Subledger | customer | Customer account | addresses | Addresses | grid | No | Addresses |  |  |  |
| Subledger | customer | Customer account | addresses.addressType | Address type | select | Yes | Addresses | billing: Billing; delivery: Delivery; postal: Postal; other: Other |  |  |
| Subledger | customer | Customer account | addresses.address | Address | long_text | Yes | Addresses |  |  |  |
| Subledger | customer | Customer account | commercialTerms | Commercial terms | grid | No | Commercial terms |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["termType"],"allowOverlap":false} |
| Subledger | customer | Customer account | commercialTerms.termType | Term type | select | Yes | Commercial terms | credit_limit: Credit limit; payment_days: Payment days; discount_percent: Discount percent |  |  |
| Subledger | customer | Customer account | commercialTerms.effectiveFrom | Effective from | date | Yes | Commercial terms |  |  |  |
| Subledger | customer | Customer account | commercialTerms.effectiveTo | Effective to | date | No | Commercial terms |  |  |  |
| Subledger | customer | Customer account | commercialTerms.value | Value | decimal | Yes | Commercial terms |  |  |  |
| Subledger | customer | Customer account | commercialTerms.currencyCode | Currency | short_text | No | Commercial terms |  |  |  |
| Subledger | vendor | Vendor account | vendorType | Vendor Type | select | No | General | goods_supplier: Goods supplier; service_provider: Service provider; contractor: Contractor; utility_provider: Utility provider; government_tax: Government / tax authority; other: Other |  |  |
| Subledger | vendor | Vendor account | registrationNumber | Registration Number | short_text | No | General |  |  |  |
| Subledger | vendor | Vendor account | taxNumber | Tax Number | short_text | No | General |  |  |  |
| Subledger | vendor | Vendor account | email | Email | email | No | Contact |  |  |  |
| Subledger | vendor | Vendor account | phone | Phone | short_text | No | Contact |  |  |  |
| Subledger | vendor | Vendor account | paymentTerms | Payment Terms | text | No | Payment |  |  |  |
| Subledger | vendor | Vendor account | bankAccountName | Bank Account Name | text | No | Payment |  |  |  |
| Subledger | vendor | Vendor account | bankAccountNumber | Bank Account Number | short_text | No | Payment |  |  |  |
| Subledger | vendor | Vendor account | currencyCode | Currency Code | short_text | No | Payment |  |  |  |
| Subledger | vendor | Vendor account | bankName | Bank Name | text | No | Payment |  |  |  |
| Subledger | vendor | Vendor account | bankAccountType | Bank Account Type | select | No | Payment | current: Current / Cheque; savings: Savings; transmission: Transmission; credit: Credit; other: Other |  |  |
| Subledger | vendor | Vendor account | contacts | Contacts | grid | No | Contacts |  |  |  |
| Subledger | vendor | Vendor account | contacts.name | Contact name | text | Yes | Contacts |  |  |  |
| Subledger | vendor | Vendor account | contacts.role | Role | text | No | Contacts |  |  |  |
| Subledger | vendor | Vendor account | contacts.email | Email | email | No | Contacts |  |  |  |
| Subledger | vendor | Vendor account | contacts.phone | Phone | short_text | No | Contacts |  |  |  |
| Subledger | vendor | Vendor account | addresses | Addresses | grid | No | Addresses |  |  |  |
| Subledger | vendor | Vendor account | addresses.addressType | Address type | select | Yes | Addresses | billing: Billing; delivery: Delivery; postal: Postal; other: Other |  |  |
| Subledger | vendor | Vendor account | addresses.address | Address | long_text | Yes | Addresses |  |  |  |
| Subledger | vendor | Vendor account | paymentAccounts | Payment accounts | grid | No | Payment accounts |  |  |  |
| Subledger | vendor | Vendor account | paymentAccounts.bankName | Bank | text | Yes | Payment accounts |  |  |  |
| Subledger | vendor | Vendor account | paymentAccounts.accountName | Account name | text | Yes | Payment accounts |  |  |  |
| Subledger | vendor | Vendor account | paymentAccounts.accountNumber | Account number | short_text | Yes | Payment accounts |  |  |  |
| Subledger | vendor | Vendor account | paymentAccounts.currencyCode | Currency | short_text | Yes | Payment accounts |  |  |  |
| Subledger | employee | Employee | employeeNumber | Employee Number | short_text | No | Personal |  |  |  |
| Subledger | employee | Employee | firstName | First Name | text | No | Personal |  |  |  |
| Subledger | employee | Employee | lastName | Last Name | text | No | Personal |  |  |  |
| Subledger | employee | Employee | idNumber | ID Number | short_text | No | Personal |  |  |  |
| Subledger | employee | Employee | email | Email | email | No | Contact |  |  |  |
| Subledger | employee | Employee | phone | Phone | short_text | No | Contact |  |  |  |
| Subledger | employee | Employee | jobTitle | Job Title | text | No | Employment |  |  |  |
| Subledger | employee | Employee | department | Department | text | No | Employment |  |  |  |
| Subledger | employee | Employee | startDate | Start Date | date | No | Employment |  |  |  |
| Subledger | employee | Employee | endDate | End Date | date | No | Employment |  |  |  |
| Subledger | employee | Employee | qualifications | Qualifications | grid | No | Qualifications |  |  |  |
| Subledger | employee | Employee | qualifications.qualification | Qualification | text | Yes | Qualifications |  |  |  |
| Subledger | employee | Employee | qualifications.institution | Institution | text | No | Qualifications |  |  |  |
| Subledger | employee | Employee | qualifications.awardDate | Award date | date | No | Qualifications |  |  |  |
| Subledger | employee | Employee | qualifications.expiryDate | Expiry date | date | No | Qualifications |  |  |  |
| Subledger | employee | Employee | employmentAssignments | Employment assignments | grid | No | Employment assignments |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["team","department","role"],"allowOverlap":false} |
| Subledger | employee | Employee | employmentAssignments.team | Team | reference | No | Employment assignments |  | {"class":"accounting_object","types":["team"]} |  |
| Subledger | employee | Employee | employmentAssignments.department | Department | text | No | Employment assignments |  |  |  |
| Subledger | employee | Employee | employmentAssignments.role | Role | text | Yes | Employment assignments |  |  |  |
| Subledger | employee | Employee | employmentAssignments.effectiveFrom | Effective from | date | Yes | Employment assignments |  |  |  |
| Subledger | employee | Employee | employmentAssignments.effectiveTo | Effective to | date | No | Employment assignments |  |  |  |
| Subledger | cash_point | Cash Point | locationName | Location Name | text | No | General |  |  |  |
| Subledger | cash_point | Cash Point | locationCode | Location Code | short_text | No | General |  |  |  |
| Subledger | cash_point | Cash Point | responsiblePerson | Responsible Person | text | No | General |  |  |  |
| Subledger | cash_point | Cash Point | siteName | Site Name | text | No | Operation |  |  |  |
| Subledger | cash_point | Cash Point | reconciliationFrequency | Reconciliation Frequency | text | No | Operation |  |  |  |
| Subledger | cash_point | Cash Point | currencyCode | Currency Code | short_text | No | Operation |  |  |  |
| Subledger | cash_point | Cash Point | activeFrom | Active From | date | No | Control |  |  |  |
| Subledger | cash_point | Cash Point | activeTo | Active To | date | No | Control |  |  |  |
| Subledger | cash_point | Cash Point | notes | Notes | long_text | No | Control |  |  |  |
| Subledger | cash_point | Cash Point | responsibilities | Responsibilities | grid | No | Responsibilities |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["resource","responsibility"],"allowOverlap":false} |
| Subledger | cash_point | Cash Point | responsibilities.resource | Resource | reference | Yes | Responsibilities |  | {"class":"resource"} |  |
| Subledger | cash_point | Cash Point | responsibilities.responsibility | Responsibility | text | Yes | Responsibilities |  |  |  |
| Subledger | cash_point | Cash Point | responsibilities.effectiveFrom | Effective from | date | Yes | Responsibilities |  |  |  |
| Subledger | cash_point | Cash Point | responsibilities.effectiveTo | Effective to | date | No | Responsibilities |  |  |  |
| Subledger | cash_point | Cash Point | operatingHours | Operating hours | grid | No | Operating hours |  |  |  |
| Subledger | cash_point | Cash Point | operatingHours.weekday | Weekday | select | Yes | Operating hours | mon: Monday; tue: Tuesday; wed: Wednesday; thu: Thursday; fri: Friday; sat: Saturday; sun: Sunday |  |  |
| Subledger | cash_point | Cash Point | operatingHours.opens | Opens | short_text | Yes | Operating hours |  |  |  |
| Subledger | cash_point | Cash Point | operatingHours.closes | Closes | short_text | Yes | Operating hours |  |  |  |
| Subledger | asset | Asset | assetTag | Asset Tag | short_text | No | General |  |  |  |
| Subledger | asset | Asset | assetCategory | Asset Category | text | No | General |  |  |  |
| Subledger | asset | Asset | serialNumber | Serial Number | short_text | No | General |  |  |  |
| Subledger | asset | Asset | purchaseDate | Purchase Date | date | No | Dates |  |  |  |
| Subledger | asset | Asset | commissionDate | Commission Date | date | No | Dates |  |  |  |
| Subledger | asset | Asset | custodian | Custodian | text | No | Assignment |  |  |  |
| Subledger | asset | Asset | location | Location | text | No | Assignment |  |  |  |
| Subledger | asset | Asset | depreciationMethod | Depreciation Method | text | No | Depreciation |  |  |  |
| Subledger | asset | Asset | usefulLifeMonths | Useful Life Months | integer | No | Depreciation |  |  |  |
| Subledger | asset | Asset | residualValue | Residual Value | currency | No | Depreciation |  |  |  |
| Subledger | asset | Asset | marketValues | Market values | grid | No | Market values |  |  |  |
| Subledger | asset | Asset | marketValues.valuationDate | Valuation date | date | Yes | Market values |  |  |  |
| Subledger | asset | Asset | marketValues.amount | Market value | currency | Yes | Market values |  |  |  |
| Subledger | asset | Asset | marketValues.currencyCode | Currency | short_text | Yes | Market values |  |  |  |
| Subledger | asset | Asset | marketValues.method | Valuation method | reference | No | Market values |  | {"class":"accounting_dimension","types":["valuation_method"]} |  |
| Subledger | asset | Asset | marketValues.valuer | Valuer | reference | No | Market values |  | {"class":"resource"} |  |
| Subledger | asset | Asset | marketValues.notes | Notes | long_text | No | Market values |  |  |  |
| Subledger | asset | Asset | components | Components | grid | No | Components |  |  |  |
| Subledger | asset | Asset | components.componentCode | Component code | short_text | Yes | Components |  |  |  |
| Subledger | asset | Asset | components.description | Description | text | Yes | Components |  |  |  |
| Subledger | asset | Asset | components.condition | Condition | select | No | Components | good: Good; fair: Fair; poor: Poor |  |  |
| Subledger | asset | Asset | components.responsibleResource | Responsible resource | reference | No | Components |  | {"class":"resource"} |  |
| Subledger | asset | Asset | measurements | Measurements | grid | No | Measurements |  |  |  |
| Subledger | asset | Asset | measurements.measurementDate | Measurement date | date | Yes | Measurements |  |  |  |
| Subledger | asset | Asset | measurements.measurementType | Measurement type | reference | Yes | Measurements |  | {"class":"accounting_dimension","types":["measurement_type"]} |  |
| Subledger | asset | Asset | measurements.quantity | Quantity | decimal | Yes | Measurements |  |  |  |
| Subledger | asset | Asset | measurements.unit | Unit | reference | Yes | Measurements |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | projectCode | Project Code | short_text | No | General |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | projectType | Project Type | text | No | General |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | projectManager | Project Manager | text | No | General |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | startDate | Start Date | date | No | Dates |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | endDate | End Date | date | No | Dates |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetAmount | Budget Amount | currency | No | Budget |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | currencyCode | Currency Code | short_text | No | Budget |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | status | Status | text | No | General |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | milestones | Milestones | grid | No | Milestones |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | milestones.milestone | Milestone | text | Yes | Milestones |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | milestones.targetDate | Target date | date | Yes | Milestones |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | milestones.status | Status | select | No | Milestones | planned: Planned; in_progress: In progress; complete: Complete |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | milestones.notes | Notes | long_text | No | Milestones |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown | Budget breakdown | grid | No | Budget breakdown |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["category"],"allowOverlap":false} |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown.category | Budget category | text | Yes | Budget breakdown |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown.effectiveFrom | Effective from | date | Yes | Budget breakdown |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown.effectiveTo | Effective to | date | No | Budget breakdown |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown.amount | Planned amount | currency | Yes | Budget breakdown |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | budgetBreakdown.currencyCode | Currency | short_text | Yes | Budget breakdown |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | participants | Participants | grid | No | Participants |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | participants.resource | Resource | reference | Yes | Participants |  | {"class":"resource"} |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | participants.role | Project role | text | Yes | Participants |  |  |  |
| Subledger | capex_project | Capital Project (WIP/AUC) | participants.notes | Responsibilities | long_text | No | Participants |  |  |  |
| Subledger | loan | Loan account | loanNumber | Loan Number | short_text | No | General |  |  |  |
| Subledger | loan | Loan account | loanType | Loan Type | text | No | General |  |  |  |
| Subledger | loan | Loan account | counterpartyRole | Counterparty Role | text | No | General |  |  |  |
| Subledger | loan | Loan account | startDate | Start Date | date | No | Dates |  |  |  |
| Subledger | loan | Loan account | maturityDate | Maturity Date | date | No | Dates |  |  |  |
| Subledger | loan | Loan account | principalAmount | Principal Amount | currency | No | Terms |  |  |  |
| Subledger | loan | Loan account | interestRate | Interest Rate | decimal | No | Terms |  |  |  |
| Subledger | loan | Loan account | currencyCode | Currency Code | short_text | No | Terms |  |  |  |
| Subledger | loan | Loan account | interestTerms | Interest terms | grid | No | Interest terms |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["rateComponent"],"allowOverlap":false} |
| Subledger | loan | Loan account | interestTerms.rateComponent | Rate component | select | Yes | Interest terms | fixed: Fixed rate; base: Base rate; margin: Margin |  |  |
| Subledger | loan | Loan account | interestTerms.effectiveFrom | Effective from | date | Yes | Interest terms |  |  |  |
| Subledger | loan | Loan account | interestTerms.effectiveTo | Effective to | date | No | Interest terms |  |  |  |
| Subledger | loan | Loan account | interestTerms.ratePercent | Annual rate (%) | decimal | Yes | Interest terms |  |  |  |
| Subledger | loan | Loan account | repaymentSchedule | Repayment schedule | grid | No | Repayment schedule |  |  |  |
| Subledger | loan | Loan account | repaymentSchedule.dueDate | Due date | date | Yes | Repayment schedule |  |  |  |
| Subledger | loan | Loan account | repaymentSchedule.principal | Planned principal | currency | No | Repayment schedule |  |  |  |
| Subledger | loan | Loan account | repaymentSchedule.interest | Planned interest | currency | No | Repayment schedule |  |  |  |
| Subledger | loan | Loan account | repaymentSchedule.currencyCode | Currency | short_text | Yes | Repayment schedule |  |  |  |
| Subledger | loan | Loan account | securities | Securities | grid | No | Securities |  |  |  |
| Subledger | loan | Loan account | securities.securityType | Security type | text | Yes | Securities |  |  |  |
| Subledger | loan | Loan account | securities.property | Property | reference | No | Securities |  | {"class":"accounting_object","types":["property"]} |  |
| Subledger | loan | Loan account | securities.description | Description | text | No | Securities |  |  |  |
| Subledger | loan | Loan account | securities.amount | Security value | currency | No | Securities |  |  |  |
| Subledger | loan | Loan account | securities.currencyCode | Currency | short_text | No | Securities |  |  |  |
| Accounting object | property | Property | propertyKind | Property Kind | select | No | General | land; site; building; floor; room; wing; leased_store; other |  |  |
| Accounting object | property | Property | ownershipStatus | Ownership Status | select | No | General | owned; leased; managed; right_of_use; other |  |  |
| Accounting object | property | Property | usage | Usage | text | No | General |  |  |  |
| Accounting object | property | Property | cadastralReference | Cadastral / Erf Reference | short_text | No | Location |  |  |  |
| Accounting object | property | Property | physicalAddress | Physical Address | long_text | No | Location |  |  |  |
| Accounting object | property | Property | areaSqm | Area (sqm) | decimal | No | Location |  |  |  |
| Accounting object | property | Property | marketValues | Market values | grid | No | Market values |  |  |  |
| Accounting object | property | Property | marketValues.valuationDate | Valuation date | date | Yes | Market values |  |  |  |
| Accounting object | property | Property | marketValues.amount | Market value | currency | Yes | Market values |  |  |  |
| Accounting object | property | Property | marketValues.currencyCode | Currency | short_text | Yes | Market values |  |  |  |
| Accounting object | property | Property | marketValues.method | Valuation method | reference | No | Market values |  | {"class":"accounting_dimension","types":["valuation_method"]} |  |
| Accounting object | property | Property | marketValues.valuer | Valuer | reference | No | Market values |  | {"class":"resource"} |  |
| Accounting object | property | Property | marketValues.notes | Notes | long_text | No | Market values |  |  |  |
| Accounting object | property | Property | measurements | Measurements | grid | No | Measurements |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["dimensionType"],"allowOverlap":false} |
| Accounting object | property | Property | measurements.dimensionType | Dimension type | reference | Yes | Measurements |  | {"class":"accounting_dimension","types":["measurement_type"]} |  |
| Accounting object | property | Property | measurements.effectiveFrom | Effective from | date | Yes | Measurements |  |  |  |
| Accounting object | property | Property | measurements.effectiveTo | Effective to | date | No | Measurements |  |  |  |
| Accounting object | property | Property | measurements.quantity | Quantity | decimal | Yes | Measurements |  |  |  |
| Accounting object | property | Property | measurements.unit | Unit | reference | Yes | Measurements |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting object | property | Property | features | Features | grid | No | Features |  |  |  |
| Accounting object | property | Property | features.featureType | Feature type | reference | Yes | Features |  | {"class":"accounting_dimension","types":["property_feature_type"]} |  |
| Accounting object | property | Property | features.value | Value | integer | Yes | Features |  |  |  |
| Accounting object | team | Team | members | Members | grid | No | Members |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["resource","role"],"allowOverlap":false} |
| Accounting object | team | Team | members.resource | Resource | reference | Yes | Members |  | {"class":"resource"} |  |
| Accounting object | team | Team | members.role | Team role | text | Yes | Members |  |  |  |
| Accounting object | team | Team | members.effectiveFrom | Effective from | date | Yes | Members |  |  |  |
| Accounting object | team | Team | members.effectiveTo | Effective to | date | No | Members |  |  |  |
| Accounting object | team | Team | members.notes | Responsibilities | long_text | No | Members |  |  |  |
| Accounting object | team | Team | responsibilities | Responsibilities | grid | No | Responsibilities |  |  |  |
| Accounting object | team | Team | responsibilities.responsibilityType | Responsibility type | text | Yes | Responsibilities |  |  |  |
| Accounting object | team | Team | responsibilities.description | Description | long_text | No | Responsibilities |  |  |  |
| Accounting object | region | Region | regionLevel | Region Level | select | No | General | national; province; district; municipality; ward; service_area; other |  |  |
| Accounting object | region | Region | countryCode | Country Code | short_text | No | General |  |  |  |
| Accounting object | region | Region | responsiblePerson | Responsible Person | text | No | General |  |  |  |
| Accounting object | region | Region | externalIdentifiers | External mappings | grid | No | External mappings |  |  |  |
| Accounting object | region | Region | externalIdentifiers.codingSystem | Coding system | short_text | Yes | External mappings |  |  |  |
| Accounting object | region | Region | externalIdentifiers.externalCode | External code | short_text | Yes | External mappings |  |  |  |
| Accounting object | region | Region | externalIdentifiers.description | Description | text | No | External mappings |  |  |  |
| Accounting object | region | Region | contacts | Contacts | grid | No | Contacts |  |  |  |
| Accounting object | region | Region | contacts.name | Contact name | text | Yes | Contacts |  |  |  |
| Accounting object | region | Region | contacts.role | Role | text | No | Contacts |  |  |  |
| Accounting object | region | Region | contacts.email | Email | email | No | Contacts |  |  |  |
| Accounting object | region | Region | contacts.phone | Phone | short_text | No | Contacts |  |  |  |
| Accounting object | opex_project | Operational Project | projectCategory | Project Category | short_text | No | General |  |  |  |
| Accounting object | opex_project | Operational Project | sponsor | Sponsor | text | No | General |  |  |  |
| Accounting object | opex_project | Operational Project | projectManager | Project Manager | text | No | General |  |  |  |
| Accounting object | opex_project | Operational Project | startDate | Start Date | date | No | Dates and Budget |  |  |  |
| Accounting object | opex_project | Operational Project | endDate | End Date | date | No | Dates and Budget |  |  |  |
| Accounting object | opex_project | Operational Project | budgetAmount | Budget Amount | currency | No | Dates and Budget |  |  |  |
| Accounting object | opex_project | Operational Project | milestones | Milestones | grid | No | Milestones |  |  |  |
| Accounting object | opex_project | Operational Project | milestones.milestone | Milestone | text | Yes | Milestones |  |  |  |
| Accounting object | opex_project | Operational Project | milestones.targetDate | Target date | date | Yes | Milestones |  |  |  |
| Accounting object | opex_project | Operational Project | milestones.status | Status | select | No | Milestones | planned: Planned; in_progress: In progress; complete: Complete |  |  |
| Accounting object | opex_project | Operational Project | milestones.notes | Notes | long_text | No | Milestones |  |  |  |
| Accounting object | opex_project | Operational Project | budgetBreakdown | Budget breakdown | grid | No | Budget breakdown |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["category"],"allowOverlap":false} |
| Accounting object | opex_project | Operational Project | budgetBreakdown.category | Budget category | text | Yes | Budget breakdown |  |  |  |
| Accounting object | opex_project | Operational Project | budgetBreakdown.effectiveFrom | Effective from | date | Yes | Budget breakdown |  |  |  |
| Accounting object | opex_project | Operational Project | budgetBreakdown.effectiveTo | Effective to | date | No | Budget breakdown |  |  |  |
| Accounting object | opex_project | Operational Project | budgetBreakdown.amount | Planned amount | currency | Yes | Budget breakdown |  |  |  |
| Accounting object | opex_project | Operational Project | budgetBreakdown.currencyCode | Currency | short_text | Yes | Budget breakdown |  |  |  |
| Accounting object | opex_project | Operational Project | participants | Participants | grid | No | Participants |  |  |  |
| Accounting object | opex_project | Operational Project | participants.resource | Resource | reference | Yes | Participants |  | {"class":"resource"} |  |
| Accounting object | opex_project | Operational Project | participants.role | Project role | text | Yes | Participants |  |  |  |
| Accounting object | opex_project | Operational Project | participants.notes | Responsibilities | long_text | No | Participants |  |  |  |
| Accounting object | cost_centre | Cost Centre | costCentreClass | Cost Centre Class | short_text | No | General |  |  |  |
| Accounting object | cost_centre | Cost Centre | manager | Manager | text | No | General |  |  |  |
| Accounting object | cost_centre | Cost Centre | purpose | Purpose | long_text | No | General |  |  |  |
| Accounting object | cost_centre | Cost Centre | responsibilities | Responsibilities | grid | No | Responsibilities |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["resource","responsibility"],"allowOverlap":false} |
| Accounting object | cost_centre | Cost Centre | responsibilities.resource | Resource | reference | Yes | Responsibilities |  | {"class":"resource"} |  |
| Accounting object | cost_centre | Cost Centre | responsibilities.responsibility | Responsibility | text | Yes | Responsibilities |  |  |  |
| Accounting object | cost_centre | Cost Centre | responsibilities.effectiveFrom | Effective from | date | Yes | Responsibilities |  |  |  |
| Accounting object | cost_centre | Cost Centre | responsibilities.effectiveTo | Effective to | date | No | Responsibilities |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets | Planning targets | grid | No | Planning targets |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["targetType"],"allowOverlap":false} |
| Accounting object | cost_centre | Cost Centre | planningTargets.targetType | Target type | text | Yes | Planning targets |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.effectiveFrom | Effective from | date | Yes | Planning targets |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.effectiveTo | Effective to | date | No | Planning targets |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.quantity | Target quantity | decimal | No | Planning targets |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.unit | Unit | reference | No | Planning targets |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.amount | Target amount | currency | No | Planning targets |  |  |  |
| Accounting object | cost_centre | Cost Centre | planningTargets.currencyCode | Currency | short_text | No | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | profitCentreClass | Profit Centre Class | short_text | No | General |  |  |  |
| Accounting object | profit_centre | Profit Centre | manager | Manager | text | No | General |  |  |  |
| Accounting object | profit_centre | Profit Centre | revenueResponsibility | Revenue Responsibility | long_text | No | General |  |  |  |
| Accounting object | profit_centre | Profit Centre | responsibilities | Responsibilities | grid | No | Responsibilities |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["resource","responsibility"],"allowOverlap":false} |
| Accounting object | profit_centre | Profit Centre | responsibilities.resource | Resource | reference | Yes | Responsibilities |  | {"class":"resource"} |  |
| Accounting object | profit_centre | Profit Centre | responsibilities.responsibility | Responsibility | text | Yes | Responsibilities |  |  |  |
| Accounting object | profit_centre | Profit Centre | responsibilities.effectiveFrom | Effective from | date | Yes | Responsibilities |  |  |  |
| Accounting object | profit_centre | Profit Centre | responsibilities.effectiveTo | Effective to | date | No | Responsibilities |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets | Planning targets | grid | No | Planning targets |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["targetType"],"allowOverlap":false} |
| Accounting object | profit_centre | Profit Centre | planningTargets.targetType | Target type | text | Yes | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.effectiveFrom | Effective from | date | Yes | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.effectiveTo | Effective to | date | No | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.quantity | Target quantity | decimal | No | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.unit | Unit | reference | No | Planning targets |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.amount | Target amount | currency | No | Planning targets |  |  |  |
| Accounting object | profit_centre | Profit Centre | planningTargets.currencyCode | Currency | short_text | No | Planning targets |  |  |  |
| Accounting object | contract | Contract | contractNumber | Contract Number | short_text | No | General |  |  |  |
| Accounting object | contract | Contract | contractType | Contract Type | select | No | General | lease_in: Lease in; lease_out: Lease out; service_provision: Service provision; service_contract: Service contract; supply_contract: Supply contract; grant_agreement: Grant agreement; maintenance_contract: Maintenance contract; rental_agreement: Rental agreement; other: Other |  |  |
| Accounting object | contract | Contract | counterpartyName | Counterparty Name | text | No | General |  |  |  |
| Accounting object | contract | Contract | startDate | Start Date | date | No | Dates |  |  |  |
| Accounting object | contract | Contract | endDate | End Date | date | No | Dates |  |  |  |
| Accounting object | contract | Contract | renewalDate | Renewal Date | date | No | Dates |  |  |  |
| Accounting object | contract | Contract | contractValue | Contract Value | currency | No | Value |  |  |  |
| Accounting object | contract | Contract | currencyCode | Currency Code | short_text | No | Value |  |  |  |
| Accounting object | contract | Contract | responsiblePerson | Responsible Person | text | No | Value |  |  |  |
| Accounting object | contract | Contract | fixedCharges | Fixed charges | grid | No | Fixed charges |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["chargeComponent"],"allowOverlap":false} |
| Accounting object | contract | Contract | fixedCharges.chargeComponent | Charge component | reference | Yes | Fixed charges |  | {"class":"accounting_dimension","types":["charge_component"]} |  |
| Accounting object | contract | Contract | fixedCharges.effectiveFrom | Effective from | date | Yes | Fixed charges |  |  |  |
| Accounting object | contract | Contract | fixedCharges.effectiveTo | Effective to | date | No | Fixed charges |  |  |  |
| Accounting object | contract | Contract | fixedCharges.amount | Amount | currency | Yes | Fixed charges |  |  |  |
| Accounting object | contract | Contract | fixedCharges.currencyCode | Currency | short_text | Yes | Fixed charges |  |  |  |
| Accounting object | contract | Contract | fixedCharges.frequency | Frequency | select | Yes | Fixed charges | once: Once; monthly: Monthly; quarterly: Quarterly; annually: Annually |  |  |
| Accounting object | contract | Contract | parties | Parties | grid | No | Parties |  |  |  |
| Accounting object | contract | Contract | parties.party | Party | reference | Yes | Parties |  | {"class":"legal_entity"} |  |
| Accounting object | contract | Contract | parties.role | Role | select | Yes | Parties | customer: Customer; supplier: Supplier; landlord: Landlord; tenant: Tenant; guarantor: Guarantor; other: Other |  |  |
| Accounting object | contract | Contract | parties.notes | Notes | long_text | No | Parties |  |  |  |
| Accounting object | contract | Contract | milestones | Milestones | grid | No | Milestones |  |  |  |
| Accounting object | contract | Contract | milestones.milestone | Milestone | text | Yes | Milestones |  |  |  |
| Accounting object | contract | Contract | milestones.targetDate | Target date | date | Yes | Milestones |  |  |  |
| Accounting object | contract | Contract | milestones.status | Status | select | No | Milestones | planned: Planned; in_progress: In progress; complete: Complete |  |  |
| Accounting object | contract | Contract | milestones.notes | Notes | long_text | No | Milestones |  |  |  |
| Accounting object | utility_meter | Utility Meter | readings | Readings | grid | No | Readings |  |  |  |
| Accounting object | utility_meter | Utility Meter | readings.readingDateTime | Reading date/time | date_time | Yes | Readings |  |  |  |
| Accounting object | utility_meter | Utility Meter | readings.registerType | Register type | select | Yes | Readings | import: Import; export: Export; total: Total |  |  |
| Accounting object | utility_meter | Utility Meter | readings.reading | Cumulative reading | decimal | Yes | Readings |  |  |  |
| Accounting object | utility_meter | Utility Meter | readings.unit | Unit | reference | Yes | Readings |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting object | utility_meter | Utility Meter | readings.method | Reading method | select | Yes | Readings | actual: Actual; estimated: Estimated |  |  |
| Accounting object | utility_meter | Utility Meter | readings.event | Meter event | select | No | Readings | normal: Normal; reset: Reset; rollover: Rollover; replacement: Replacement |  |  |
| Accounting object | utility_meter | Utility Meter | readings.notes | Notes | long_text | No | Readings |  |  |  |
| Accounting object | utility_meter | Utility Meter | installations | Installations | grid | No | Installations |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["installationSlot"],"allowOverlap":false} |
| Accounting object | utility_meter | Utility Meter | installations.installationSlot | Installation slot | short_text | Yes | Installations |  |  |  |
| Accounting object | utility_meter | Utility Meter | installations.property | Property | reference | Yes | Installations |  | {"class":"accounting_object","types":["property"]} |  |
| Accounting object | utility_meter | Utility Meter | installations.effectiveFrom | Effective from | date | Yes | Installations |  |  |  |
| Accounting object | utility_meter | Utility Meter | installations.effectiveTo | Effective to | date | No | Installations |  |  |  |
| Accounting object | utility_meter | Utility Meter | installations.notes | Notes | long_text | No | Installations |  |  |  |
| Accounting object | insurance_policy | Insurance policy | policyNumber | Policy number | short_text | Yes | Policy |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insurer | Insurer | reference | Yes | Policy |  | {"class":"subledger_account","types":["vendor"]} |  |
| Accounting object | insurance_policy | Insurance policy | broker | Broker | reference | No | Policy |  | {"class":"subledger_account","types":["vendor"]} |  |
| Accounting object | insurance_policy | Insurance policy | policyholder | Policyholder | reference | Yes | Policy |  | {"class":"legal_entity"} |  |
| Accounting object | insurance_policy | Insurance policy | responsibleResource | Responsible resource | reference | No | Policy |  | {"class":"resource"} |  |
| Accounting object | insurance_policy | Insurance policy | startDate | Start date | date | Yes | Terms |  |  |  |
| Accounting object | insurance_policy | Insurance policy | expiryDate | Expiry date | date | Yes | Terms |  |  |  |
| Accounting object | insurance_policy | Insurance policy | renewalReviewDate | Renewal review date | date | No | Terms |  |  |  |
| Accounting object | insurance_policy | Insurance policy | currencyCode | Currency | short_text | Yes | Terms |  |  |  |
| Accounting object | insurance_policy | Insurance policy | paymentFrequency | Payment frequency | select | No | Terms | annual: Annual; quarterly: Quarterly; monthly: Monthly; other: Other |  |  |
| Accounting object | insurance_policy | Insurance policy | cancellationTerms | Cancellation terms | long_text | No | Terms |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage | Coverage | grid | No | Coverage |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["coverType"],"allowOverlap":false} |
| Accounting object | insurance_policy | Insurance policy | coverage.coverType | Cover type | reference | Yes | Coverage |  | {"class":"accounting_dimension","types":["insurance_cover_type"]} |  |
| Accounting object | insurance_policy | Insurance policy | coverage.effectiveFrom | Effective from | date | Yes | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage.effectiveTo | Effective to | date | No | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage.limit | Coverage limit | currency | Yes | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage.excessAmount | Excess amount | currency | No | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage.excessPercent | Excess (%) | decimal | No | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | coverage.exclusions | Exclusions | long_text | No | Coverage |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems | Insured items | grid | No | Insured items |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["item","coverType"],"allowOverlap":false} |
| Accounting object | insurance_policy | Insurance policy | insuredItems.item | Insured item | reference | Yes | Insured items |  | {"anyOf":[{"class":"subledger_account","types":["asset"]},{"class":"accounting_object","types":["property"]}]} |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.coverType | Cover type | reference | Yes | Insured items |  | {"class":"accounting_dimension","types":["insurance_cover_type"]} |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.effectiveFrom | Effective from | date | Yes | Insured items |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.effectiveTo | Effective to | date | No | Insured items |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.insuredValue | Insured value | currency | Yes | Insured items |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.specificExcess | Specific excess | currency | No | Insured items |  |  |  |
| Accounting object | insurance_policy | Insurance policy | insuredItems.notes | Notes | long_text | No | Insured items |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule | Premium schedule | grid | No | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.coverageFrom | Coverage from | date | Yes | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.coverageTo | Coverage to | date | Yes | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.dueDate | Due date | date | Yes | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.premium | Premium | currency | Yes | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.fees | Fees | currency | No | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.tax | Tax | currency | No | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | premiumSchedule.total | Total | currency | Yes | Premium schedule |  |  |  |
| Accounting object | insurance_policy | Insurance policy | endorsements | Endorsements | grid | No | Endorsements |  |  |  |
| Accounting object | insurance_policy | Insurance policy | endorsements.reference | Endorsement reference | short_text | Yes | Endorsements |  |  |  |
| Accounting object | insurance_policy | Insurance policy | endorsements.effectiveDate | Effective date | date | Yes | Endorsements |  |  |  |
| Accounting object | insurance_policy | Insurance policy | endorsements.description | Change description | long_text | Yes | Endorsements |  |  |  |
| Accounting object | insurance_policy | Insurance policy | endorsements.premiumAdjustment | Premium adjustment | currency | No | Endorsements |  |  |  |
| Accounting object | insurance_claim | Insurance claim | policy | Insurance policy | reference | Yes | Claim |  | {"class":"accounting_object","types":["insurance_policy"]} |  |
| Accounting object | insurance_claim | Insurance claim | insurerClaimReference | Insurer claim reference | short_text | No | Claim |  |  |  |
| Accounting object | insurance_claim | Insurance claim | responsibleResource | Claims handler | reference | No | Claim |  | {"class":"resource"} |  |
| Accounting object | insurance_claim | Insurance claim | incidentDate | Incident date | date | Yes | Incident |  |  |  |
| Accounting object | insurance_claim | Insurance claim | location | Incident location | text | No | Incident |  |  |  |
| Accounting object | insurance_claim | Insurance claim | cause | Claim cause | reference | Yes | Incident |  | {"class":"accounting_dimension","types":["insurance_claim_cause"]} |  |
| Accounting object | insurance_claim | Insurance claim | description | Incident description | long_text | Yes | Incident |  |  |  |
| Accounting object | insurance_claim | Insurance claim | currencyCode | Currency | short_text | Yes | Claim |  |  |  |
| Accounting object | insurance_claim | Insurance claim | claimStage | Claim stage | select | Yes | Claim | reported: Reported; submitted: Submitted; assessing: Under assessment; approved: Approved; partially_settled: Partially settled; settled: Settled; declined: Declined; withdrawn: Withdrawn |  |  |
| Accounting object | insurance_claim | Insurance claim | affectedItems | Affected items | grid | No | Affected items |  |  |  |
| Accounting object | insurance_claim | Insurance claim | affectedItems.item | Insured item | reference | Yes | Affected items |  | {"anyOf":[{"class":"subledger_account","types":["asset"]},{"class":"accounting_object","types":["property"]}]} |  |
| Accounting object | insurance_claim | Insurance claim | affectedItems.damage | Damage description | long_text | Yes | Affected items |  |  |  |
| Accounting object | insurance_claim | Insurance claim | affectedItems.estimatedLoss | Estimated loss | currency | No | Affected items |  |  |  |
| Accounting object | insurance_claim | Insurance claim | affectedItems.claimedAmount | Claimed amount | currency | Yes | Affected items |  |  |  |
| Accounting object | insurance_claim | Insurance claim | assessor | Assessor | reference | No | Assessment |  | {"class":"resource"} |  |
| Accounting object | insurance_claim | Insurance claim | assessmentDate | Assessment date | date | No | Assessment |  |  |  |
| Accounting object | insurance_claim | Insurance claim | approvedAmount | Approved amount | currency | No | Assessment |  |  |  |
| Accounting object | insurance_claim | Insurance claim | excessAmount | Excess amount | currency | No | Assessment |  |  |  |
| Accounting object | insurance_claim | Insurance claim | events | Claim events | grid | No | Events |  |  |  |
| Accounting object | insurance_claim | Insurance claim | events.date | Date | date | Yes | Events |  |  |  |
| Accounting object | insurance_claim | Insurance claim | events.eventType | Event type | select | Yes | Events | notification: Notification; submission: Submission; assessment: Assessment; decision: Decision; correspondence: Correspondence; settlement: Settlement |  |  |
| Accounting object | insurance_claim | Insurance claim | events.resource | Resource | reference | No | Events |  | {"class":"resource"} |  |
| Accounting object | insurance_claim | Insurance claim | events.notes | Notes | long_text | Yes | Events |  |  |  |
| Accounting object | insurance_claim | Insurance claim | settlementComponents | Settlement breakdown | grid | No | Settlement |  |  |  |
| Accounting object | insurance_claim | Insurance claim | settlementComponents.component | Component | text | Yes | Settlement |  |  |  |
| Accounting object | insurance_claim | Insurance claim | settlementComponents.approvedAmount | Approved amount | currency | Yes | Settlement |  |  |  |
| Accounting object | insurance_claim | Insurance claim | settlementComponents.recipient | Recipient supplier | reference | No | Settlement |  | {"class":"subledger_account","types":["vendor"]} |  |
| Accounting object | insurance_claim | Insurance claim | settlementComponents.notes | Notes | long_text | No | Settlement |  |  |  |
| Accounting dimension | revenue_type | Revenue Type | externalMappings | External mappings | grid | No | External mappings |  |  |  |
| Accounting dimension | revenue_type | Revenue Type | externalMappings.codingSystem | Coding system | short_text | Yes | External mappings |  |  |  |
| Accounting dimension | revenue_type | Revenue Type | externalMappings.externalCode | External code | short_text | Yes | External mappings |  |  |  |
| Accounting dimension | revenue_type | Revenue Type | externalMappings.description | Description | text | No | External mappings |  |  |  |
| Accounting dimension | expense_type | Expense Type | externalMappings | External mappings | grid | No | External mappings |  |  |  |
| Accounting dimension | expense_type | Expense Type | externalMappings.codingSystem | Coding system | short_text | Yes | External mappings |  |  |  |
| Accounting dimension | expense_type | Expense Type | externalMappings.externalCode | External code | short_text | Yes | External mappings |  |  |  |
| Accounting dimension | expense_type | Expense Type | externalMappings.description | Description | text | No | External mappings |  |  |  |
| Accounting dimension | mscoa_fund | MSCOA Fund | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_project | MSCOA Project | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_item | MSCOA Item | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_region | MSCOA Region | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_function | MSCOA Function | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_costing | MSCOA Costing | — | — | — | — | — |  |  |  |
| Accounting dimension | mscoa_outcome | MSCOA Outcome | — | — | — | — | — |  |  |  |
| Accounting dimension | service | Service | characteristics | Characteristics | grid | No | Characteristics |  |  |  |
| Accounting dimension | service | Service | characteristics.characteristicType | Characteristic type | text | Yes | Characteristics |  |  |  |
| Accounting dimension | service | Service | characteristics.value | Value | text | Yes | Characteristics |  |  |  |
| Accounting dimension | service | Service | characteristics.unit | Unit | reference | No | Characteristics |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting dimension | charge_component | Charge Component | referenceRates | Reference rates | grid | No | Reference rates |  |  | {"from":"effectiveFrom","to":"effectiveTo","groupBy":["rateCategory"],"allowOverlap":false} |
| Accounting dimension | charge_component | Charge Component | referenceRates.rateCategory | Rate category | text | Yes | Reference rates |  |  |  |
| Accounting dimension | charge_component | Charge Component | referenceRates.effectiveFrom | Effective from | date | Yes | Reference rates |  |  |  |
| Accounting dimension | charge_component | Charge Component | referenceRates.effectiveTo | Effective to | date | No | Reference rates |  |  |  |
| Accounting dimension | charge_component | Charge Component | referenceRates.amount | Rate | currency | Yes | Reference rates |  |  |  |
| Accounting dimension | charge_component | Charge Component | referenceRates.currencyCode | Currency | short_text | Yes | Reference rates |  |  |  |
| Accounting dimension | charge_component | Charge Component | referenceRates.chargingUnit | Charging unit | reference | No | Reference rates |  | {"class":"accounting_dimension","types":["measurement_unit"]} |  |
| Accounting dimension | measurement_type | Measurement Type | description | Description | long_text | No | — |  |  |  |
| Accounting dimension | measurement_unit | Measurement Unit | description | Description | long_text | No | — |  |  |  |
| Accounting dimension | property_feature_type | Property Feature Type | description | Description | long_text | No | — |  |  |  |
| Accounting dimension | valuation_method | Valuation Method | description | Description | long_text | No | — |  |  |  |
| Accounting dimension | insurance_cover_type | Insurance cover type | description | Description | long_text | No | — |  |  |  |
| Accounting dimension | insurance_claim_cause | Insurance claim cause | description | Description | long_text | No | — |  |  |  |
