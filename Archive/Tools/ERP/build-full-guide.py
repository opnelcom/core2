"""Reusable PDF publisher for the ERP guide.

Run with ReportLab, Pillow and pypdf. Editorial sections live in full-guide.json;
class/field/posting inventories are always read from the canonical template seed.
Screenshots are captured separately through the authenticated browser UI.
"""
from pathlib import Path
import json, re, hashlib
from xml.sax.saxutils import escape
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[2]
CONTENT=ROOT/'docs/erp/full-guide.json'
SHOTS=ROOT/'docs/erp/guide-screenshots'
TMP=ROOT/'tmp/pdfs/full-guide'
OUT=ROOT/'output/pdf/erp-full-guide.pdf'
SEED=json.loads((ROOT/'Volumes/Core-ERP/seeds/template-defaults.json').read_text(encoding='utf-8'))
NAVY=colors.HexColor('#102C3B'); TEAL=colors.HexColor('#007F80'); INK=colors.HexColor('#253D49'); MUTED=colors.HexColor('#59717A'); PALE=colors.HexColor('#EAF3F2')
PAGE_W,PAGE_H=595.276,841.89
WIDTH=PAGE_W-92

def b(title,text): return {'kind':'block','title':title,'text':text}
def note(text): return {'kind':'note','text':text}
def fig(file,caption,mode='main'): return {'kind':'figure','file':file,'caption':caption,'mode':mode}
def sec(title,intro,blocks,part='USER GUIDE'): return {'title':title,'intro':intro,'blocks':blocks,'part':part}

SETUP=[
('Organisations','Organisation','Define the business context and base currency. A template is a reusable starting configuration; a normal organisation owns its own configuration and records.',
 'Open Setup > Organisation > Organisations. Select a row to review it, or use + for a new organisation. Review the code, name and currency before saving. Use Copy Data only after deciding what configuration and records to include.',
 'Example: establish a separate demonstration company and copy selected template configuration. Include required reference records so custom selectors resolve in the destination.',
 'Copying remaps supported custom references by class, type code and record code. Missing destination matches are cleared. Source version history is not copied.'),
('Divisions','Organisation','Divisions organise ownership and scope within an organisation. The active division context is different from a record\'s owner division.',
 'Open Divisions. Review the hierarchy, then select or add a division. Use the top division picker to choose your working context. Include child divisions data only when that is the scope you intend to inspect.',
 'Example: use Construction, Trading and Administration divisions to separate responsibility within one organisation. This is an illustrative structure, not a template requirement.',
 'Visibility still depends on permissions. A parent division or a menu selection is not a substitute for access to the underlying records.'),
('Fiscal Year','Organisation','Fiscal years and periods establish the calendar used for financial capture.',
 'Open Fiscal Year. Add or review a year, its start/end dates and period setup. Review individual periods and their status before transaction capture. Choose a fiscal period appropriate to the transaction date.',
 'Example: configure the organisation\'s approved financial year, then review the period containing 5 October 2026. The template screenshot is empty: it is not ready for a journal merely because transaction types exist.',
 'The shared period validator accepts open and soft_closed; closed or locked periods are rejected. Opening a period is an administrative decision, not a troubleshooting shortcut.'),
('Countries','Organisation','Maintain shared country choices used in organisation records and reference data.',
 'Open Countries and review the configured codes and descriptions. Search before adding another entry. Maintain a consistent vocabulary across records and copied organisations.',
 'Example: use one agreed country entry across address and regional details rather than multiple spelling variants.',
 'A country choice does not automatically configure tax, currency conversion or legal reporting.'),
('Currencies','Organisation','Maintain currency definitions used by the organisation and its configured data.',
 'Open Currencies and review the configured codes and display information. Confirm the organisation\'s base currency separately in Organisations. Check custom amount fields for their configured precision and scale.',
 'Example: keep ZAR as the template base currency and record a policy\'s currency code explicitly alongside its amounts.',
 'A schema currencyCode label is presentation only. It does not perform exchange-rate conversion or store a second currency value automatically.'),
('Tax Types','Organisation','Tax types and their effective rates provide reusable tax configuration.',
 'Open Tax Types. Review the code, direction, active status and dated rate rows. Confirm the organisation\'s intended rate periods and transaction treatment before capturing tax lines.',
 'Example: capture an applicable recoverable input-tax amount on a purchase type that offers an input-tax line. Review the actual source invoice and the organisation\'s authorised policy.',
 'Configured tax types do not establish automatic tax determination, a tax return or legal compliance. Example postings here omit tax unless explicitly stated.'),
('Resource Roles','Organisation','Resource roles describe business responsibility and assignment, such as manager, handler or contact.',
 'Open Resource Roles and review available roles. On a relevant type, use its Roles configuration to map assignments and identify required roles. Maintain the Resources directory before using selectors.',
 'Example: assign a responsible resource to an insurance policy and a handler to a claim where the organisation\'s mappings call for those responsibilities.',
 'Resource roles are separate from security roles. Assigning responsibility does not itself grant permission to edit or approve records.'),
('Financial Statement Formats','Organisation','Formats define the intended layout and account mapping of financial statements.',
 'Open Financial Statement Formats. Select a format to inspect its configuration, then use Reports > Financial Statement with the correct format and period filters. Review mappings when the chart changes.',
 'Example: compare the template Standard and Management income formats to understand presentation choices; validate account totals using ledger and trial-balance views.',
 'A format name such as IFRS is a template label, not proof that the organisation\'s completed statements meet a reporting standard.'),
('Schema UI Tester','Accounting Model','An interactive sandbox uses the same generated field renderer as record forms.',
 'Open Schema UI Tester, inspect the sample definition and its rendered fields. Use it to explore supported field types and layout, then apply deliberate changes to the actual type\'s Design configuration.',
 'Example: preview an integer feature count and a currency amount with two fractional places. Compare required fields and blank values in actual test records before release.',
 'The tester is runtime-only. A visible preview does not save a type definition or prove server validation and reference access.'),
('Modules','Accounting Model','Modules group related types and transaction entries for navigation and access.',
 'Open Modules to review definitions. Review type Scope mappings and the security role\'s module membership together. Switch to the Modules menu to check the result in the intended user context.',
 'Example: keep policy and claim types in Insurance Management while reusing vendor, asset and property records through their existing types.',
 'Inventory and Intercompany exist in the canonical seed but were absent from the captured operational module menu. Check active configuration, mappings and access before promising those entries.'),
('GL Account Types','Accounting Model','GL account types classify the chart into categories such as asset, liability, equity, revenue and expense.',
 'Open GL Account Types and review definitions. Create or edit the actual accounts under Technical > GL Accounts. Check subledger requirements at both account and transaction-line level.',
 'Example: 1100 Accounts Receivable is an asset account whose detail uses customer subledgers in the template.',
 'A GL account type is not a customer/vendor record. Keep the financial category, the GL account and account-level subledger distinct.'),
('Subledger Account Types','Accounting Model','A subledger type defines account-family behaviour, legal-entity requirements, custom fields and mappings.',
 'Select a type, review Definition, Scope, Roles and Design as available, and inspect its generated preview. Confirm legal-entity requirements before creating sample records.',
 'Example: a bank family stores bank/account information; an asset family stores useful-life and residual-value attributes. Each record keeps built-in identification separately.',
 'The captured DEMO-INSURER vendor has no legal entity selected while its type requires one. Complete that relationship before saving it under the current type rule.'),
('Accounting Object Types','Accounting Model','Object types provide reusable business definitions for properties, contracts, projects, policies and other contexts.',
 'Select a type. Review Definition for code/name/workflow, Scope for module mappings, Roles for assignments and Design for Schema JSON and preview. Type codes become read-only in the existing object-type editor.',
 'Example: Property uses separate tabs for location, valuations, measurements and features. Reuse the shared renderer rather than making a separate property-only form.',
 'A schema extends the class. It does not make a property object behave like a subledger or cause operational values to post automatically.'),
('Accounting Dimension Types','Accounting Model','Dimension types define shared classifications or reference vocabularies.',
 'Review the definition, module mappings, workflow, role mappings and schema. Create actual selectable dimension records through Accounting Dimensions, then use references or transaction classifications.',
 'Example: Measurement Unit supplies a shared choice such as a square-metre unit; Measurement Type describes what is measured.',
 'A type without custom fields can still be a valid code/name classification. Add business fields only when requirements justify them.'),
('Transaction Groups','Transactions','Groups organise transaction types into families such as Sales, Purchasing, Banking and Insurance.',
 'Review Transaction Groups, then inspect each Transaction Type in that family. Module mappings determine where the types are offered. A group without usable active types may not appear operationally.',
 'Example: Sales groups Cash sale, Customer invoice and customer payment types. Their line definitions differ because capture purposes differ.',
 'Creating a group does not create a usable financial transaction. Configure types and their line definitions as well.'),
('Transaction Types','Transactions','Types supply a reusable capture pattern, including lines, account restrictions and analysis requirements.',
 'Select a type. Review Definition, Scope and Line Definitions. Expand each line to review its GL account, debit/credit side, subledger requirement, occurrence/amount behaviour and object/dimension requirements.',
 'Example: Customer invoice starts with a debit to 1100 Accounts Receivable and a credit to 4000 Sales Revenue. Capex purchases also support optional input tax and a generated balancing settlement line.',
 'Required, optional and generated lines behave differently. Do not assume every amount is manually entered. Allow additional capture lines only where intended.'),
('Workflows','Transactions','Workflows define record states and transitions; permissions determine who can perform the corresponding actions.',
 'Open Workflows, review paths, initial steps and transitions, and check which types use them. Test intended capture and approval roles separately in a suitable test organisation.',
 'Example: a clerk captures and submits; an authorised approver approves according to the configured path. A record\'s operational claim stage is a separate custom field.',
 'Workflow history, data versions and document history serve different purposes. Data Save does not automatically imply approval or financial posting.'),
]

PROFILES=[
('sales','Customer invoice and part payment','Record a sale on account, then a separate receipt.','customer_invoice',10000,
 'Create a customer legal entity and customer subledger, confirm an open fiscal period and use the sales type. Select the customer on the receivable line. If your line definitions require profit centre, contract or revenue type, select those classifications.',
 'Save Draft, review both sides, then follow Submit and Approve as allowed by the configured workflow. Capture a separate Customer bank payment of 4000 using the same customer and the receiving bank subledger.',
 'The illustrated receivable after a 10000 invoice and 4000 receipt is 6000, before other activity. Check approved journals and the customer/account detail; do not treat the receipt as another sale.',
 'The template does not establish a sales-order, dispatch or automatic invoice-allocation workflow merely by offering a Customer invoice transaction.'),
('crm','One customer, one shared identity','Keep a customer\'s business identity consistent across sales and relationship work.',None,None,
 'Find the legal entity first. Reuse or create its customer subledger under Customer account. Review the generated Contact, Addresses or other available custom tabs, and choose a Region object if needed by your configuration.',
 'Use the Account Manager resource role where mapped. Save the customer record once its required fields and assignments are complete. Use the same customer account in sales transactions.',
 'Search should find the agreed customer record and the legal-entity linkage should identify the intended party. A contact entry by itself has no financial effect.',
 'CRM here reuses customer, region and resource records. The observed configuration does not demonstrate a lead/opportunity pipeline or campaign engine.'),
('procurement','Supplier purchase and partial payment','Record an obligation to a supplier and settle it through a separate payment.','supplier_invoice',8000,
 'Prepare the supplier legal entity and vendor account. Confirm the purchase type, expense account and any required expense-type/object classifications. Review applicable tax separately.',
 'Capture Purchase on account for 8000. Review and approve through the configured workflow. Capture Supplier bank payment for 3000 against the same vendor and the actual paying bank.',
 'The illustrated outstanding payable is 5000 before other activity. Reconcile the supplier/control balance and inspect both approved journals.',
 'A Purchase on account entry is financial capture. It does not by itself prove a purchase requisition, purchase-order, goods-received or three-way matching process.'),
('hr_payroll','Payroll accrual, then payment','Record a determined payroll amount against the correct employee subledger.','payroll_accrual',20000,
 'Create the employee account and required responsibility/classification records. Establish the payroll amount outside this example using the organisation\'s approved payroll process.',
 'Capture Payroll accrual for 20000. Select the employee on the liability line and required cost-centre/other classifications if configured. Capture Payroll bank payment separately when the organisation authorises settlement.',
 'The expense and liability should reflect the approved accrual, with settlement reducing the liability. Inspect payroll/control detail and journals rather than inferring payment from an employee record.',
 'Employee records and payroll transaction types are not an automatic gross-to-net calculation, statutory submission or payslip workflow.'),
('finance','Bank charge and reconciliation','Use a small transaction to prove account, period, approval and reporting setup.','bank_charge',250,
 'Confirm the bank subledger, fiscal period and bank-charge type. Review the current GL settings and the intended division.',
 'Capture 250 through Bank charge. Review line accounts and selected bank. Save, submit and approve only under the intended workflow, then inspect Ledger Balances and Trial Balance.',
 'For this isolated illustration, bank charges increase by 250 and the bank credit movement is 250. Whole-organisation reports include other activity and need consistent filters.',
 'Finance exposes many shared types. Classification fields do not automatically create arbitrary operational reports or complete year-end procedures.'),
('treasury_cash','Receive loan funds','Keep loan account detail separate from the receiving bank.','loan_received',50000,
 'Prepare bank and loan subledgers with their required legal entities. Review Loan received line definitions and the date/period.',
 'Capture 50000: select the receiving bank on its line and the loan account on the payable line. Review and follow the configured approval process.',
 'The illustrated bank debit and loan liability credit are both 50000. Subsequent principal repayments and interest use distinct transaction types.',
 'Loan attributes do not calculate an amortisation schedule or automate interest. Capturing an ERP journal does not initiate an external bank transfer.'),
('tax','Accrue a determined tax liability','Capture an authorised amount using configured tax accounts.','tax_accrual',1500,
 'Review Tax Types/rate periods and obtain the approved amount from the organisation\'s tax process. Confirm the Tax accrual transaction type and period.',
 'Capture 1500 through Tax accrual, review the expense/payable lines and follow approval. Use Tax bank payment separately when settlement is authorised.',
 'This illustration records a 1500 liability; payment reduces that liability. Inspect the relevant GLs and approved journals.',
 'The example illustrates configured capture, not tax advice, automatic tax determination or a return submission.'),
('inventory','Understand the current boundary','Separate an inventory account from a complete stock-management process.',None,None,
 'The seed includes the Inventory module/group and GL 1200 Inventory, but no active Inventory operational menu was observed. Inspect Modules, groups and current transaction types before assigning a workflow.',
 'For an illustrative 6000 inventory purchase, first agree a suitable transaction definition and analysis with the administrator. Do not use the general purchase expense pattern solely because it is available.',
 'A configured financial entry can establish inventory value. It does not establish quantity on hand, warehouse bins, item costing or stock movements.',
 'No screenshot of an Inventory operational module is included because it was not visible. The guide documents this configuration gap rather than inventing a stock screen.'),
('asset_management','Buy an asset on account','Keep the asset account, business property and supplier distinct.','asset_purchase_account',12000,
 'Create the asset subledger and supplier/vendor record. Review useful-life and residual-value fields as attributes. If the transaction requires a property/contract or another object, create it separately.',
 'Capture an Asset purchase on account for 12000 with the correct subledgers on asset/vendor lines. Use the type\'s tax options only when applicable. Review and follow approval.',
 'The illustration increases fixed-asset value and supplier liability by 12000 before tax/other lines. Depreciation is captured separately through its configured type.',
 'Useful-life fields do not automatically run depreciation. Land, buildings, equipment and operational property records need an agreed organisation policy.'),
('project_management','Build a capital project','Record capital work in progress without confusing it with an operational project object.','capex_purchase_account',15000,
 'Prepare a Capital Project (WIP/AUC) subledger, vendor account and relevant team/contract/project classifications. Use Operational Project for a different business context when appropriate.',
 'Capture Capex purchase on account with 15000 on the WIP debit line. If input tax applies, capture it separately; the settlement line is generated to balance under the configured definition. Review all required classifications.',
 'For a no-tax illustration, WIP increases by 15000 and the payable is 15000. A later asset settlement needs an appropriate configured transaction; a milestone row does not settle WIP.',
 'Project milestones, participants and budgets capture operational detail. They do not constitute automatic project scheduling or asset-capitalisation logic.'),
('contract_management','Maintain a fixed-charge contract','Capture commercial facts and effective charge periods in one operational record.',None,None,
 'Create a Contract object with its required contract number, dates, parties and currency details. Review Fixed charges, Parties and Milestones tabs from the template schema.',
 'Illustration: record a 2500 monthly fixed charge with the relevant component and effective dates. When changing a period-controlled charge, close the prior period before the new one starts if overlap is prohibited.',
 'The contract record should show the intended charge rows and a saved snapshot. A separately captured financial transaction is needed for billing or recognition.',
 'Renewal dates and charge rows do not automatically schedule reminders, calculate totals or generate invoices.'),
('property_management','Record a valuation and meter evidence','Keep observation data separate from effective-period data and billed amounts.',None,None,
 'Open Property and review measurements/features. Prepare measurement, unit, feature and valuation-method dimensions. Create a Utility Meter object for the intended installed meter and inspect its readings/installations grids.',
 'Illustration: record a market observation of 5000000 on 5 October 2026, and a measured area of 250.0000 with its effective period. Record cumulative meter readings as observations rather than entering consumption as if it were calculated automatically.',
 'Check the selected references, dates and saved versions. A Municipal services invoice is separate financial capture; its amount should come from the source invoice and approved treatment.',
 'There is no automatic consumption, valuation selection or billing calculation. Measurement groups can prohibit overlaps; market-value observations do not use that same period rule.'),
('intercompany','Configure the relationship first','An intercompany group needs a defined capture and reconciliation policy.',None,None,
 'The canonical seed includes Intercompany but the operational menu was absent. Identify the two organisations, the intended account relationships and the authorised reciprocal posting process.',
 'For an illustrative 10000 intercompany charge, agree and configure suitable transaction types on both sides before capture. Review mapping, currency and period requirements. This guide does not prescribe an account pairing absent from the template.',
 'Reconcile the intended reciprocal entries under matching scopes. Creating an object/reference in one organisation does not automatically create a matching journal in another.',
 'No automatic reciprocal posting or consolidation workflow was verified. There is no live Intercompany module screenshot to imply otherwise.'),
('public_sector','Use shared classification dimensions','Capture public-sector analysis without treating seeded vocabularies as a complete compliance solution.',None,None,
 'Review the MSCOA Fund, Project, Item, Region, Function, Costing and Outcome dimension types and their actual records. Configure transaction-line requirements for the scenario that needs them.',
 'Illustration: classify an approved service-related expense of 2000 by the required fund, item, function and project. Use the organisation\'s approved account and transaction definition; complete mandatory selectors on every applicable line.',
 'Inspect the approved journal\'s classifications. A dimension code/name supplies the selected vocabulary; reporting must use the appropriate mappings and datasets.',
 'Seeded MSCOA type names are not proof of current regulatory-code completeness or compliant statutory reporting. Apply the organisation\'s maintained standard.'),
('corporate_administration','Record an owner contribution','Distinguish equity funding from revenue.','owner_deposit',100000,
 'Confirm the organisation, owner-related legal identity, receiving bank and the Owner deposit definition. Use authorised documentation for the contribution.',
 'Capture 100000 through Owner deposit, select the receiving bank and review the equity credit. Follow the organisation\'s approval process. Use Owner withdrawal separately for its intended scenario.',
 'The illustrated bank debit and owner-equity credit are 100000. This funding entry does not create sales revenue.',
 'An ERP entry does not execute the bank movement or determine its legal character; obtain the organisation\'s approved classification.'),
('insurance_management','Annual premium and claim linkage','Use the saved policy to constrain affected-item selection.','insurance_premium_allocation',5000,
 'Inspect INS-PROPERTY-2026 for the annual warehouse example. Review insurer/broker vendors and legal policyholder; complete legal-entity links on vendors before saving where required. Save the policy and insured-items list before adding a claim.',
 'Review INS-CLAIM-001: it is the separate vehicle example and must remain linked to the vehicle/equipment policy, not the warehouse policy. Inspect affected items, assessment, events and settlement tabs. For the warehouse illustration, a 60000 annual premium can be allocated in 5000 monthly entries.',
 'Allocation debits insurance premium expense and credits prepaid insurance in the template. Recovery/receipt types also require a matching claim/policy pair. Claim-stage updates themselves create no journal.',
 'The model does not calculate coverage at incident date, remaining aggregate limits, excesses, renewal notices or insurer accounting. Recognise a recovery only under the organisation\'s approved accounting policy.'),
]

PURPOSES={
 'bank':'A bank account used for account-level bank movements and financial detail.',
 'customer':'A customer account used with receivables and customer receipts.',
 'vendor':'A supplier account used with payables and supplier settlements.',
 'employee':'An employee account for configured payroll financial detail.',
 'cash_point':'A till, safe, petty-cash or other configured cash location.',
 'asset':'An individual asset account used for financial detail and asset attributes.',
 'capex_project':'A capital-work-in-progress account; distinct from an operational project object.',
 'loan':'A loan account for configured borrowing and settlement detail.',
 'property':'A property business record with location, valuations, measurements and features.',
 'team':'A team business record with members and responsibilities.',
 'region':'An organisational/geographic business context; distinct from MSCOA Region.',
 'opex_project':'An operational project with budget, milestones and participants.',
 'cost_centre':'A responsibility context for costs, planning targets and activities.',
 'profit_centre':'A responsibility context for revenue and performance analysis.',
 'contract':'A commercial arrangement with dates, parties, fixed charges and milestones.',
 'utility_meter':'A meter record with dated cumulative readings and installation information.',
 'insurance_policy':'A purchased insurance policy with coverage, items, premium schedule and endorsements.',
 'insurance_claim':'A case linked to a saved policy, with incident, assessment, events and settlement detail.',
 'revenue_type':'A reusable classification of revenue activity.',
 'expense_type':'A reusable classification of expense activity.',
 'service':'A shared service classification for service-related scenarios.',
 'charge_component':'A shared charge component for contract/municipal scenarios.',
 'measurement_type':'What is measured, such as a configured area measure.',
 'measurement_unit':'The unit used for a quantity, separate from measurement type.',
 'property_feature_type':'The kind of counted property feature.',
 'valuation_method':'The selected method describing a market-value observation.',
 'insurance_cover_type':'A shared coverage category used on insurance rows.',
 'insurance_claim_cause':'A shared cause classification used on claim incidents.',
}

def initial_content():
    old=json.loads((ROOT/'docs/erp/user-guide.json').read_text(encoding='utf-8'))['sections']
    sections=[sec('Read this guide','A task guide and a reference for administrators and everyday users.',[
        b('Two routes','Users: start with navigation, class selection and daily capture, then choose a business module. Administrators: review the setup roadmap and setup reference before changing definitions. Use the class and transaction catalogues to inspect the template without guessing.'),
        b('Three kinds of evidence','Live screenshots show the authenticated Template Organisation on 5 October 2026. Implementation descriptions were checked against repository documentation and source. Worked amounts and outcomes are illustrations; no example journals were saved or approved for this publication.'),
        b('Coverage','All 16 seeded modules are covered. Fourteen were visible in the operational menu; Inventory and Intercompany are described with their current configuration gaps. The guide includes every seeded subledger, object and dimension type plus a complete seeded transaction-line catalogue.'),
        note('The template is a recommended starting configuration. Your organisation can use different fields, mappings, workflows and permissions. Menu presence alone does not prove a complete specialised subsystem.'),
        fig('dashboard.jpg','The live template dashboard: five subledgers, no fiscal periods and no journals. Counts describe this capture, not every organisation.','main')], 'GETTING STARTED')]
    sections.append(sec('Navigate with the right context','The same records can be reached through different menu modes.',[
        b('1. Choose organisation and division','Use the organisation tab at the top, then the Active division picker. Check Include child divisions data only when you intend a wider scope. The owner division on a record is a separate field.'),
        b('2. Choose a menu mode','Modules groups entries by business purpose. Roles groups responsibility-related access. Technical groups classes, transactions and reports. Setup exposes administrative definitions to authorised users.'),
        b('3. Open a type, search, then select','Expand a group, choose its type and search the record list before using +. Select a row to inspect the editor. Editors may use horizontal tab scrolling and grids may require horizontal scrolling to reach all columns.'),
        b('4. Use the editor controls deliberately','Switch tabs to inspect fields, Resources, Documents and Versions. Close panel or Cancel leaves the editor without intentionally saving changes. Save acts on the full record. The resize handle changes the editor size, not stored business data.'),
        note('The screenshots use the live desktop layout. Some wide grids show only their first columns; captions identify this and the field catalogue lists the remaining columns. Do not mistake a cropped figure for the complete form.')], 'GETTING STARTED'))
    shotmap={'Choose the right class':None,'Work with subledgers':'vendor-editor.jpg','Work with accounting objects':'property-identification.jpg','Work with dimensions':None,'A reliable capture routine':'transaction-capture.jpg','Grids, references and history':'property-measurements.jpg','Set up in a sensible order':None,'Configure types and forms':'type-design.jpg','Configure and use transactions':'transaction-capture.jpg','Make setup usable and controlled':'permissions.jpg','A property, with useful evidence':'property-market-values.jpg','From policy to claim':'claim-affected-items.jpg','When something does not work':None}
    for p in old[1:-1]:
        blocks=[b(x['title'],x['text']) for x in p['blocks']]
        if p.get('callout'): blocks.append(note(p['callout']))
        image=shotmap.get(p['title'])
        if image: blocks.append(fig(image,'Live template view. Inspect the visible labels and selected tab; the editor is shown without saving changes.','editor' if image not in ['transaction-capture.jpg','permissions.jpg'] else 'main'))
        if p['title']=='Configure and use transactions':
            blocks.append(note('Amount handling depends on the line definition: ordinary amounts are entered, while generated balancing lines calculate the settlement side. Check occurrence and amount mode in the transaction catalogue.'))
        sections.append(sec(p['title'],p['intro'],blocks,'CORE TASKS'))
    sections.append(sec('See how the type editor fits together','One configuration pattern serves many business types.',[
        b('Definition','Review code, name, description, active status and the workflow path. Existing object-type codes are read-only in the captured editor.'),fig('type-definition.jpg','Definition identifies the type and its workflow.','type'),
        b('Scope and Roles','Scope maps the type to modules. Roles maps resource responsibilities. These mappings are separate from security permissions.'),fig('type-scope.jpg','Scope controls module mappings.','type'),
        b('Design','Schema JSON supplies custom attributes and presentation together. The preview uses the shared renderer. Preserve stable field keys when changing labels or order.'),fig('type-design.jpg','Design combines the schema definition and generated preview. The JSON area is scrollable.','type')], 'ADMINISTRATOR SETUP'))
    for name,group,purpose,steps,example,lim in SETUP:
        slug=re.sub('[^a-z0-9]+','-',name.lower())
        sections.append(sec(name+' setup',purpose,[b('Where to go','Setup > '+group+' > '+name),b('How to use it',steps),b('Business example',example),note(lim),fig('setup-'+slug+'.jpg','Live template: '+name+'. This is the captured list/sandbox state; it is not evidence of a completed setup action.','main')], 'SETUP REFERENCE'))
    sections.append(sec('Permissions and recovery','Access, responsibility and maintenance need separate checks.',[
        b('Review security roles','Open Setup > Security > Permissions. Inspect role users, module membership and master/transaction permissions. The live Security Administrator description grants setup only, while ERP Administrator grants business access without setup administration.'),
        fig('permissions.jpg','The live roles list explicitly separates setup administration from business access.','main'),
        b('Verify as the intended user','Check division, type, workflow and module access. An administrator\'s visible menu is not evidence of another user\'s access. Required resource assignments do not grant security permissions.'),
        b('Initialise Schema','Use the deployment procedure for structure and supported additive template upgrades. It does not automatically give every non-template organisation new grids or permissions.'),
        b('Initialise Template Org and ERP Reset','Full template seeding can overwrite template configuration. Reset is a destructive recovery function. Neither is a routine answer to a missing field, reference or permission.'),
        note('These recovery actions were not executed during screenshot capture. The guide describes their source-documented purpose rather than demonstrating a reset.')], 'SETUP REFERENCE'))
    sections.append(sec('Reading reports','Filters are part of the answer, not an afterthought.',[
        b('Ledger Balances','Choose the intended organisation/division scope and available filters, then refresh. Use account-level movements and balances to reconcile the scenario. Check the selected period/date scope before comparing figures.'),fig('report-ledger-balances.jpg','Live Ledger Balances filter/result view; the template has no posted example journals.','main'),
        b('Trial Balance','Review the date/period range and division scope. Compare debit/credit movements and account balances under matching filters. A balanced total alone does not establish correct classifications.'),fig('report-trial-balance.jpg','Live Trial Balance. Empty/template results are not the illustrated business-case totals.','main'),
        b('Financial Statement','Choose the format and fiscal context. Review configured account mappings and compare the underlying ledger when a result is unexpected.'),fig('report-financial-statement.jpg','Live Financial Statement filters; a suitable fiscal setup and posted activity are prerequisites for meaningful results.','main'),
        b('Grid data versus versions','Current grid reporting uses each grid as its own dataset. Period filtering applies only to period-controlled grids; observations are not automatically reduced to a latest value. Historical values are inspected through saved version snapshots. Combining grids requires deliberate joins/aggregation.')], 'REPORTING'))
    sections.append(sec('Screenshot reading room','Examples of operational details that have different meanings.',[
        b('Policy coverage and items','Coverage and insured items can carry grouped effective periods. Blank end dates mean indefinitely. These record limits/relationships; they do not calculate remaining coverage.'),fig('policy-insured-items.jpg','Saved INS-PROPERTY-2026 insured-items grid. The right-hand columns require horizontal scrolling.','editor'),
        b('Assessment and settlement','The claim\'s assessment and settlement data describes its operational case. Financial recognition and receipts remain separate transactions.'),fig('claim-assessment.jpg','INS-CLAIM-001 assessment: the example vehicle claim, distinct from the warehouse policy.','editor'),fig('claim-settlement.jpg','Claim settlement components. The figure is an operational record, not proof of a posted receipt.','editor'),
        b('Versions','Snapshots are read-only and retain the schema saved with the record. Versioning does not restore a record or reconstruct pre-versioning changes.'),fig('claim-versions.jpg','Saved version list for the example claim.','editor')], 'RECORD DETAILS'))
    return {'edition':'02','date':'2026-10-05','sections':sections,'module_profiles':[dict(zip(['code','case','purpose','transaction','amount','prepare','capture','check','limits'],p)) for p in PROFILES]}

for name,file in [('Guide','72-Regular.ttf'),('GuideBold','72-Bold.ttf'),('GuideLight','72-Light.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
ST={
 'h1':ParagraphStyle('h1',fontName='GuideLight',fontSize=25,leading=29,textColor=NAVY,spaceAfter=13,keepWithNext=True),
 'h2':ParagraphStyle('h2',fontName='GuideBold',fontSize=11.7,leading=15,textColor=TEAL,spaceBefore=12,spaceAfter=5,keepWithNext=True),
 'body':ParagraphStyle('body',fontName='Guide',fontSize=10,leading=14.2,textColor=INK,spaceAfter=7),
 'intro':ParagraphStyle('intro',fontName='GuideLight',fontSize=12.5,leading=17,textColor=MUTED,spaceAfter=14),
 'small':ParagraphStyle('small',fontName='Guide',fontSize=8.5,leading=11.6,textColor=INK,spaceAfter=5),
 'caption':ParagraphStyle('caption',fontName='Guide',fontSize=8.7,leading=12,textColor=MUTED,spaceAfter=11),
 'eyebrow':ParagraphStyle('eyebrow',fontName='GuideBold',fontSize=8.3,leading=12,textColor=TEAL,spaceAfter=8,keepWithNext=True),
 'note':ParagraphStyle('note',fontName='Guide',fontSize=9.3,leading=13,textColor=INK,borderColor=TEAL,borderWidth=.6,borderPadding=10,backColor=PALE,spaceBefore=8,spaceAfter=16),
}
ST['h1ref']=ParagraphStyle('h1ref',parent=ST['h1'])
ST['modulebody']=ParagraphStyle('modulebody',parent=ST['body'],fontSize=9.2,leading=12.3,spaceAfter=5)
ST['modulehead']=ParagraphStyle('modulehead',parent=ST['h2'],fontSize=10.5,leading=13,spaceBefore=7,spaceAfter=3)
def p(text,style='body'): return Paragraph(escape(str(text)),ST[style])
def table(rows,widths=None):
    cells=[[p(v,'small') for v in row] for row in rows]
    t=Table(cells,colWidths=widths or [WIDTH/len(rows[0])]*len(rows[0]),repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.7,TEAL),('LINEBELOW',(0,1),(-1,-1),.35,colors.HexColor('#DAE4E7'))]))
    return t

MANIFEST=[]
def figure(block):
    path=SHOTS/block['file']
    if not path.exists(): raise FileNotFoundError(path)
    im=PILImage.open(path); w,h=im.size
    mode=block.get('mode','main')
    # Remove the host profile/header and unrelated organisation tabs from detail views.
    boxes={'main':(.185,.15,.985,.93),'editor':(.598,.225,.963,.79),'type':(.727,.225,.963,.80),'menu':(.014,.16,.172,.925)}
    box=boxes[mode]; im=im.crop(tuple(int(v*(w if i%2==0 else h)) for i,v in enumerate(box)))
    dest=TMP/(path.stem+'-'+mode+'.jpg'); im.save(dest,quality=95)
    iw,ih=im.size
    max_height={'main':210,'editor':290,'type':320,'menu':250}[mode]
    scale=min(WIDTH/iw,max_height/ih); image=Image(str(dest),width=iw*scale,height=ih*scale,hAlign='LEFT')
    MANIFEST.append({'file':block['file'],'mode':mode,'caption':block['caption'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'captured':'2026-10-05','organisation':'TEMPLATE'})
    return [KeepTogether([image,Spacer(1,6),p(block['caption'],'caption')])]

class GuideDoc(BaseDocTemplate):
    def __init__(self,path):
        super().__init__(str(path),pagesize=(PAGE_W,PAGE_H),leftMargin=46,rightMargin=46,topMargin=55,bottomMargin=57,title='ERP | Full user and administrator guide',author='ERP project documentation')
        self.addPageTemplates(PageTemplate(id='guide',frames=[Frame(46,57,WIDTH,PAGE_H-112,id='normal',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.decorate))
        self.sequence=0
    def beforeDocument(self):
        self.sequence=0
        self.current_title=''
    def afterPage(self):
        if self.page>1:
            self.canv.setFont('Guide',8)
            self.canv.setFillColor(MUTED)
            self.canv.drawString(46,PAGE_H-32,self.current_title)
    def decorate(self,c,doc):
        if doc.page==1:return
        c.setFillColor(TEAL);c.rect(0,PAGE_H-10,PAGE_W,10,fill=1,stroke=0)
        c.setStrokeColor(colors.HexColor('#DCE5E8'));c.line(46,43,PAGE_W-46,43)
        c.setFont('Guide',8);c.setFillColor(MUTED);c.drawString(46,29,'ERP / FULL GUIDE / EDITION 02 / 5 OCT 2026');c.drawRightString(PAGE_W-46,29,str(doc.page))
    def afterFlowable(self,f):
        if isinstance(f,Paragraph) and f.style.name in ['h1','h1ref']:
            self.sequence+=1; key='chapter-'+str(self.sequence); title=f.getPlainText()
            self.current_title=title
            self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0,False)
            if f.style.name=='h1':self.notify('TOCEntry',(0,title,self.page,key))

from reportlab.platypus import Flowable
class Cover(Flowable):
    def __init__(self):super().__init__();self.width=WIDTH;self.height=PAGE_H-113
    def draw(self):
        c=self.canv;c.saveState();c.translate(-46,-57);c.setFillColor(NAVY);c.rect(0,0,PAGE_W,PAGE_H,fill=1,stroke=0);c.setFillColor(TEAL);c.rect(PAGE_W-165,0,165,PAGE_H,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#F4BF62'));c.rect(46,PAGE_H-92,56,5,fill=1,stroke=0)
        c.setFillColor(colors.white);c.setFont('GuideBold',12);c.drawString(46,PAGE_H-127,'ERP / USER & ADMINISTRATOR GUIDE')
        c.setFont('GuideLight',43)
        for i,line in enumerate(['From setup','to everyday','business.']):c.drawString(44,PAGE_H-238-i*58,line)
        c.setFont('Guide',14);c.drawString(46,330,'Object classes. Real screens. Worked examples.')
        c.setFont('Guide',11);c.drawString(46,290,'All 16 template modules | Complete type reference')
        c.drawString(46,270,'Setup, transactions, reporting and troubleshooting')
        c.setStrokeColor(colors.HexColor('#65B7AF'));c.line(46,222,PAGE_W-46,222)
        c.setFont('GuideBold',10);c.drawString(46,186,'EDITION 02 / 5 OCTOBER 2026')
        c.setFont('Guide',9);c.drawString(46,155,'Screens captured from the Template Organisation.')
        c.drawString(46,138,'Worked outcomes are illustrations; live business data was not changed.')
        c.restoreState()

def add_section(story,s):
    story.extend([PageBreak(),p(s['part'],'eyebrow'),p(s['title'],'h1'),p(s['intro'],'intro')])
    for x in s['blocks']:
        if x['kind']=='block': story.extend([p(x['title'],'h2'),p(x['text'])])
        elif x['kind']=='note':story.append(p(x['text'],'note'))
        elif x['kind']=='figure':story.extend(figure(x))

def mappings(kind,code):return SEED['moduleMappings'].get(kind,{}).get(code,[])
NAMES={x[0]:x[1] for x in SEED['moduleSeeds']}
TYPE_NAMES={x[0]:x[1] for k in ['ledgerFamilies','accountingObjectTypeSeeds','accountingDimensionTypeSeeds'] for x in SEED[k]}
GLS={x[0]:x[1] for x in SEED['chartTemplate']}
def txns_for(module):
    result=[]
    for t in SEED['transactionTypes']:
        if module in set(mappings('transactionGroups',t[1])+mappings('transactionTypeAdditions',t[0])):result.append(t)
    return result
def lines_for(code):return [x for x in SEED['lineDefinitionSeeds'] if x[0]==code]
def line_rows(code,amount=None):
    rows=[['Side / GL','Line purpose','Subledger / occurrence']]
    for x in lines_for(code):
        occ=x[7] if len(x)>7 else 'required'; mode=x[9] if len(x)>9 else 'manual'
        rows.append([x[2].upper()+' '+x[3]+' '+GLS.get(x[3],''),x[6],(TYPE_NAMES.get(x[5],x[5]) if x[4] else 'Not required by this seed line')+'; '+occ+' / '+mode])
    return rows

def modules(story,data):
    for profile in data['module_profiles']:
        code=profile['code'];name=NAMES[code]
        story.extend([PageBreak(),p('BUSINESS MODULES','eyebrow'),p(name,'h1'),p(profile['purpose'],'intro')])
        slug=re.sub('[^a-z0-9]+','-',name.lower());file='module-'+slug+'.jpg'
        narrative=[p('Business case: '+profile['case'],'modulehead'),p('1. Prepare','modulehead'),p(profile['prepare'],'modulebody'),p('2. Capture or maintain','modulehead'),p(profile['capture'],'modulebody'),p('3. Check the result','modulehead'),p(profile['check'],'modulebody')]
        if (SHOTS/file).exists():
            visual=figure(fig(file,name+' menu.','menu'))[0]._content
            # Keep the navigation evidence beside the instructions, rather than
            # producing a sparse continuation page containing only a tiny menu.
            panel=Table([[visual,narrative]],colWidths=[112,WIDTH-112],hAlign='LEFT')
            panel.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(0,0),0),('RIGHTPADDING',(0,0),(0,0),8),('LEFTPADDING',(1,0),(1,0),8),('RIGHTPADDING',(1,0),(1,0),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
            story.append(panel)
        else:story.extend(narrative)
        story.append(p(profile['limits'],'note'))
        story.append(p('Template scope','h2'))
        rows=[['Class','Mapped types']]
        for kind,label in [('ledgerFamilies','Subledger'),('accountingObjectTypes','Object'),('accountingDimensionTypes','Dimension')]:
            types=[TYPE_NAMES.get(k,k) for k,v in SEED['moduleMappings'].get(kind,{}).items() if code in v]
            rows.append([label,', '.join(types) or 'No type mapped in this seed category'])
        transactions=txns_for(code)
        transaction_summary=', '.join(x[2] for x in transactions) or 'No transaction types mapped by the current canonical seed'
        if code=='finance':
            groups={x[1] for x in transactions}
            group_names=[x[1] for x in SEED['transactionGroups'] if x[0] in groups]
            transaction_summary=str(len(transactions))+' transaction types across '+', '.join(group_names)+'. See the transaction reference for every starting line.'
        rows.append(['Transactions',transaction_summary])
        story.append(table(rows,[95,WIDTH-95]))
        if profile['transaction']:
            t=next(x for x in transactions if x[0]==profile['transaction'])
            story.append(p('Illustrated transaction: '+t[2],'h2'))
            required=[x for x in lines_for(t[0]) if len(x)<8 or x[7] in ['required','generated']]
            if len(required)==2 and required[0][2]!=required[1][2]:
                amount=format(profile['amount'],',.2f')
                pattern='; '.join(x[2].upper()+' '+x[3]+' '+GLS.get(x[3],'')+' '+amount+(' ('+TYPE_NAMES.get(x[5],x[5])+')' if x[4] else '') for x in required)
                story.append(p('No-tax illustration: '+pattern+'. Total debits and credits are '+amount+' each. Enter ordinary amounts; a generated balancing settlement line supplies its amount. Review classifications and optional lines separately.','note'))
            else:
                story.extend([p('Example amount: '+format(profile['amount'],',.2f')+'. Review the current line definitions and classifications before capture.'),table(line_rows(t[0]),[177,145,WIDTH-322])])
        if not (SHOTS/file).exists():story.append(p('Live screen coverage: this module was absent from the captured operational menu. See Modules setup before configuring an actual workflow.','note'))

def ordered(properties):return sorted(properties.items(),key=lambda x:(x[1].get('sortOrder',10**9),x[0]))
def rules(field,required):
    out=['Required' if required else 'Optional']
    for key,label in [('minLength','min length'),('maxLength','max length'),('minimum','min'),('maximum','max'),('precision','precision'),('scale','scale'),('minRows','min rows'),('maxRows','max rows')]:
        if key in field:out.append(label+' '+str(field[key]))
    choices=field.get('options',field.get('enum',[]))
    if choices:out.append('choices: '+', '.join(str(v.get('code',v.get('value',''))) if isinstance(v,dict) else str(v) for v in choices))
    if field.get('target'):
        target=field['target'];out.append('reference: '+json.dumps(target,separators=(',',':')))
    if field.get('referenceSource'):out.append('saved parent grid membership')
    return '; '.join(out)

def catalogue(story):
    story.extend([PageBreak(),p('CLASS & FIELD REFERENCE','eyebrow'),p('Every template type','h1'),p('The following inventory is generated from the canonical seed. It describes recommended fields, not mandatory configuration for every organisation.','intro')])
    story.append(p('Reading the catalogue','h2'));story.append(p('Built-in code, name, organisation and owner division are outside custom schemas. Object identification also includes parent/validity fields. Required below means required by this recommended custom schema. Each grid lists its own row requirements separately. IDs/references are stored as identifiers, not the displayed names.'))
    story.append(p('Custom value conventions','h2'));story.append(table([['Type','What to enter / expect'],['integer','Whole number; no fractional value.'],['decimal / currency','Ungrouped decimal text; configured scale is enforced, not rounded. Currency labels do not convert amounts.'],['reference','Choose an accessible eligible ERP record. Mixed-class references preserve class plus ID.'],['grid','Add/remove rows, complete required columns, then save the parent record.'],['object / array','Raw JSON editor; arbitrary nested generated forms/validation are not implemented.']],[120,WIDTH-120]))
    groups=[('Subledger types','ledgerFamilies','ledgerFamilies','ledgerFamilySchemas'),('Accounting object types','accountingObjectTypeSeeds','accountingObjectTypes','accountingObjectTypeMetadata'),('Accounting dimension types','accountingDimensionTypeSeeds','accountingDimensionTypes','accountingDimensionTypeMetadata')]
    for group,listkey,mapkey,schemaKey in groups:
        for index,item in enumerate(SEED[listkey]):
            code,name=item[:2]
            story.extend([PageBreak(),p(group.upper(),'eyebrow'),p(name,'h1ref'),p(PURPOSES.get(code,'A shared '+name+' classification used where configured.'),'intro'),p('Stable type code: '+code+' | Modules: '+', '.join(NAMES.get(v,v) for v in mappings(mapkey,code)),'small')])
            if listkey=='ledgerFamilies':
                schema=SEED[schemaKey].get(code,{})
                story.append(p('Recommended type requires a legal entity: '+('Yes' if item[3] else 'No')+'. Confirm current organisation settings before Save.'))
            else:schema=SEED[schemaKey].get(code,{}).get('schema_json',{})
            tabs=schema.get('tabs',[])
            if tabs:story.append(p('Custom tabs: '+', '.join(t.get('label','Details') for t in tabs)))
            props=schema.get('properties',{})
            if props:
                rows=[['Field / storage key','Type','Template rule']]
                for key,field in ordered(props):rows.append([field.get('title',key)+'\n'+key,field.get('type',''),rules(field,key in schema.get('required',[]))])
                story.append(table(rows,[160,68,WIDTH-228]))
            else:story.append(p('No custom fields are configured in this seed definition. Built-in identification and configured workflow/access still apply.','note'))
            for key,field in ordered(props):
                if field.get('type')!='grid':continue
                rs=field.get('rowSchema',{});story.append(p(field.get('title',key)+' rows','h2'))
                pc=field.get('periodControl')
                if pc:story.append(p('Effective period: '+pc['from']+' to '+pc['to']+'; group by '+(', '.join(pc.get('groupBy',[])) or 'whole grid')+'; overlaps '+('allowed' if pc.get('allowOverlap',True) else 'prohibited')+'. Endpoints are inclusive; blank end means indefinitely.','small'))
                else:story.append(p('No effective-period validation configured for this grid. Dates, if present, do not themselves activate that rule.','small'))
                if field.get('uniqueBy'):story.append(p('Unique combination: '+', '.join(field['uniqueBy']),'small'))
                rows=[['Column / storage key','Type','Template rule']]
                for k,v in ordered(rs.get('properties',{})):rows.append([v.get('title',k)+'\n'+k,v.get('type',''),rules(v,k in rs.get('required',[]))])
                story.append(table(rows,[160,68,WIDTH-228]))

def transaction_catalogue(story):
    story.extend([PageBreak(),p('TRANSACTION REFERENCE','eyebrow'),p('Every template posting pattern','h1'),p('A reference to configured starting lines. Actual organisation settings, access, fiscal periods and analysis requirements must be reviewed before capture.','intro')])
    story.append(p('How to read occurrence and amount mode','h2'));story.append(p('Required lines form the starting capture. Optional lines are used only when the scenario requires them. Generated balancing lines calculate their amount from the other captured lines. Ordinary lines are manual unless the seed specifies another mode. Account-level requirements may also require a subledger beyond the line flag shown here.'))
    story.append(p('Scope of this reference','note'));story.append(p('These are capture definitions, not accounting advice or a guarantee of automation. Object/dimension requirements are configured separately and checked during Save/posting. The live invoice definition showed no analysis requirements on its two starting lines.'))
    for group in SEED['transactionGroups']:
        group_code,group_name=group[:2]
        tx=[t for t in SEED['transactionTypes'] if t[1]==group_code]
        if not tx:continue
        story.extend([PageBreak(),p(group_name+' transaction types','h1ref')])
        for t in tx:
            story.extend([p(t[2],'h2'),p(t[0]+' | '+t[3],'small'),table(line_rows(t[0]),[177,145,WIDTH-322]),Spacer(1,12)])

def endmatter(story):
    add_section(story,sec('Glossary','Terms that are easy to confuse.',[b(k,v) for k,v in [
        ('Class','The built-in role of a record: for example subledger, accounting object or dimension.'),('Type','A reusable business definition inside a class, with mappings and a custom schema where supported.'),('Record','One actual account, object or classification instance.'),('Schema JSON','The single custom definition for additional attributes, validation and presentation.'),('Reference','A stored link to an eligible ERP record, displayed through a selector.'),('Effective period','An inclusive start/end interval on a grid with explicit period control.'),('Observation','A dated fact such as a valuation or cumulative reading; not automatically a period or a latest-value calculation.'),('Resource role','A business responsibility used for assignments.'),('Security role','A user access definition, separate from resource responsibility.'),('Workflow','Configured states/transitions and their permitted actions.'),('Version','A complete read-only snapshot created by a supported successful record Save.'),('Generated line','A transaction line whose configured amount behaviour supplies a calculated value, such as balancing settlement.')]],'REFERENCE'))
    add_section(story,sec('Verification and maintenance','Know what this edition establishes and what remains to be tested.',[
        b('Live verification','The Template Organisation was selected by the user. Navigation, setup lists, shared directories, property/insurance tabs, the vendor editor, an unsaved invoice capture form, a type editor and report filter views were observed. Screenshots were captured without deliberately saving or approving business records.'),
        b('Observed setup gaps','The template dashboard had no fiscal periods/journals. Inventory and Intercompany were absent operationally. DEMO-INSURER and DEMO-BROKER showed no linked legal entity in the vendor list; the opened insurer editor marked legal entity required. Review these before using the records for a saved workflow.'),
        b('Unverified outcomes','The worked financial amounts are illustrations, not live posted results. Posting, permission enforcement for non-admin users, imports, database migrations and organisation-copy outcomes were not executed for this guide. Live fields may differ from seed definitions when configuration was customised.'),
        b('Authoritative sources','Use docs/erp/schema-json.md for implemented schema/rendering rules and limitations; docs/erp/insurance-management.md for the buying-insurance scenario; and Volumes/Core-ERP/seeds/template-defaults.json for the recommended business configuration. Frontend forms/navigation and Save/transaction validators were checked for the described behaviours.'),
        b('Reusable publishing sources','docs/erp/full-guide.json contains editorial sections and business profiles. Tools/ERP/build-full-guide.py renders them, reads current seed inventories and validates deliverable structure. docs/erp/guide-screenshots contains actual screen captures and metadata. Capture-specific files are separate from business definitions.'),
        note('Maintenance: when navigation, supported field rules, setup behaviour or template scenarios change, update the relevant sections and screenshot evidence. Rebuild, check contents/bookmarks and visually review every page. Organisation-specific policies should be added explicitly as such.')], 'REFERENCE'))

def build():
    TMP.mkdir(parents=True,exist_ok=True);OUT.parent.mkdir(parents=True,exist_ok=True)
    if not CONTENT.exists():CONTENT.write_text(json.dumps(initial_content(),indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    data=json.loads(CONTENT.read_text(encoding='utf-8'))
    story=[Cover(),PageBreak(),p('CONTENTS','eyebrow'),p('Find your task','h1')]
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('toc',fontName='Guide',fontSize=9.4,leading=13.2,textColor=INK,leftIndent=0,firstLineIndent=0,spaceBefore=4)];story.append(toc)
    for s in data['sections']:add_section(story,s)
    modules(story,data);catalogue(story);transaction_catalogue(story);endmatter(story)
    GuideDoc(OUT).multiBuild(story)
    (SHOTS/'manifest.json').write_text(json.dumps(MANIFEST,indent=2)+'\n',encoding='utf-8')
    r=PdfReader(OUT)
    result={'pdf':str(OUT),'pages':len(r.pages),'bookmarks':len(r.outline),'figures':len(MANIFEST),'unique_screenshots':len(set(x['file'] for x in MANIFEST)),'modules':len(data['module_profiles']),'subledger_types':len(SEED['ledgerFamilies']),'object_types':len(SEED['accountingObjectTypeSeeds']),'dimension_types':len(SEED['accountingDimensionTypeSeeds']),'transaction_types':len(SEED['transactionTypes']),'empty_pages':[i+1 for i,x in enumerate(r.pages) if len((x.extract_text() or '').strip())<20]}
    (TMP/'validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,indent=2))

if __name__=='__main__':build()
