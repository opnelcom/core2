"""Build the ERP starter guide. Run with ReportLab installed.

Content is kept as structured blocks so it can also be reused for web help.
The template inventory is read from the canonical seed, never duplicated.
"""
from pathlib import Path
import json
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/erp-user-guide.pdf'
SOURCE = ROOT / 'docs/erp/user-guide.json'
SEED = json.loads((ROOT / 'Volumes/Core-ERP/seeds/template-defaults.json').read_text(encoding='utf-8'))
NAVY = colors.HexColor('#102C3B')
TEAL = colors.HexColor('#007F80')
INK = colors.HexColor('#253D49')
MUTED = colors.HexColor('#59717A')
PALE = colors.HexColor('#EAF3F2')
GOLD = colors.HexColor('#F4BF62')
W, H = 595.276, 841.89

def block(title, text): return {'title': title, 'text': text}
def page(section, title, intro, blocks, callout=None):
    return dict(section=section, title=title, intro=intro, blocks=blocks, callout=callout)

PAGES = [
page('START HERE', 'Your route through the ERP', 'A practical guide for people who configure the ERP and people who use it every day.', [
block('New to the system?', 'Start with the class selector on page 3. Learn the difference between an account, a business object and a classification before creating records.'),
block('Setting up an organisation?', 'Use the roadmap on page 9, then review types and custom forms on page 10, transactions on page 11 and access on page 12.'),
block('Working with records?', 'Pages 4-6 explain the core classes. Page 7 gives a repeatable capture routine. Page 8 explains grids, references and history.'),
block('Want a business example?', 'Follow the property example on page 13 or the policy-to-claim example on page 14. Use page 15 when something does not work.')],
'Edition 01 | 5 October 2026. Based on the current source implementation and recommended template. Available menus, fields and actions depend on your organisation configuration and access.'),
page('01 / THE MODEL', 'Choose the right class', 'The class sets a record\'s role. Its type supplies a business meaning and custom fields. An individual record is one instance of that type.', [
block('GL account | Where does the value belong?', 'A chart-of-accounts record classifies financial value: for example bank, supplier control or an expense account. It is the financial account used on a transaction line.'),
block('Subledger | Whose or which account is it?', 'Use an account-level record when financial detail is needed for a customer, supplier, bank, asset or another configured subledger type. A transaction line links the relevant subledger to its GL account.'),
block('Accounting object | What business context is involved?', 'Use a business record such as a property, contract, project, cost centre, insurance policy or claim. It can hold operational detail and classify transactions. Creating it does not create a journal.'),
block('Accounting dimension | How should it be classified?', 'Use a reusable reference or classification such as an expense type, measurement unit or insurance cover type. Dimensions can classify transaction lines or be referenced by custom fields.'),
block('Legal entity and resource | Who is involved?', 'Legal entities identify parties and can link to subledger accounts. Resources represent people or other configured resources assigned through resource roles. A resource role is distinct from a security role.')],
'Example: a repair can use an expense GL account, a vendor subledger, a property object and an expense-type dimension. These describe different aspects of the same transaction.'),
page('02 / ACCOUNTS', 'Work with subledgers', 'Use the GL account for financial classification and the subledger for account-level detail.', [
block('Choose the type before capturing', 'Open Sub Ledgers in the Technical menu, or the corresponding entry in a module. Choose the relevant type and add a record. The recommended template includes the account families listed below.'),
block('Capture identification', 'Provide the account type, owner division, code and name. Link a legal entity when appropriate; the selected type can make this link mandatory. Complete the custom fields displayed for that type.'),
block('Check the financial relationship', 'On a transaction line, select the GL account and the required subledger. GL account settings and transaction line definitions can require a particular subledger type. A vendor account cannot satisfy a bank-account requirement.'),
block('Keep operational fields in perspective', 'Asset useful life, loan interest rate and bank information are recorded attributes. Entering these attributes alone does not run depreciation, calculate interest or generate a payment.')],
'Template account families: ' + ', '.join(x[1] for x in SEED['ledgerFamilies']) + '. These are starting options, not compulsory account structures.'),
page('03 / BUSINESS CONTEXT', 'Work with accounting objects', 'Objects give operational information a home and let transactions identify the business context they relate to.', [
block('Create and identify', 'Open Accounting Objects in the Technical menu or choose a type in a module. Use the add control, choose Object type and Owner division, and enter Code, Name and validity dates. Complete the type-specific tabs and save.'),
block('Use a parent deliberately', 'The Parent object selector links an object into a hierarchy. The parent must be in the same organisation. An object cannot be its own parent and the hierarchy cannot contain a cycle. A parent link does not itself define a financial roll-up calculation.'),
block('Add useful detail', 'A property may have market-value observations, measurements and features. A contract may have parties, fixed charges and milestones. These are fields and grids supplied by the type schema.'),
block('Assign responsibility and evidence', 'Use Resources and Documents where available. Resource-role mappings on the type determine the intended assignments; some assignments may be required. Versions provide read-only snapshots of successful record saves.'),
block('Use the object on transactions', 'Transaction line definitions decide which object types are mandatory or optional. Choose the actual record on the line. Saving an object, changing its operational stage or adding a grid row does not post a transaction.')],
'Template object types: ' + ', '.join(x[1] for x in SEED['accountingObjectTypeSeeds']) + '.'),
page('04 / CLASSIFICATIONS', 'Work with dimensions', 'Dimensions provide shared vocabulary. Consistent selections are easier to compare than differently spelled free text.', [
block('Create a reusable choice', 'Open Accounting Dimensions, select the type and add a record with its owner division, code, name and any custom details. For example, define a measurement unit once and select it on multiple property records.'),
block('Financial classifications', 'Revenue Type and Expense Type help distinguish the nature of activity. The template also includes MSCOA Fund, Project, Item, Region, Function, Costing and Outcome types. Their presence does not establish regulatory compliance or a complete reporting model.'),
block('Operational reference vocabularies', 'Service and Charge Component support service-related scenarios. Measurement Type, Measurement Unit, Property Feature Type and Valuation Method support property data. Insurance cover type and Insurance claim cause support policies and claims.'),
block('Choose a dimension or an object?', 'Use a dimension for a reusable category or reference choice. Use an accounting object for a business entity with its own operational details and relationships. The template includes Region as an object and MSCOA Region as a dimension; choose by purpose rather than a similar name.'),
block('Make it available where needed', 'A dimension type must be configured and mapped appropriately. Transaction line definitions can require it. Custom reference fields can restrict selectable types. Users also need access to the relevant records.')],
'Keep codes stable and names readable. Do not create a new reference record merely to work around a missing permission or a restricted selector.'),
page('05 / DAILY USE', 'A reliable capture routine', 'Use this sequence for subledgers, objects and dimensions. The displayed form varies by type.', [
block('1. Confirm your context', 'Check Organisation and division context before adding or editing data. Menu visibility depends on module mappings and access; a different organisation may have different types and forms.'),
block('2. Find before you create', 'Search existing records by code or name. Select the right type first. Reuse the existing record when it represents the same business entity or classification.'),
block('3. Complete identification and details', 'Enter the built-in fields, then work through the custom tabs. Required custom fields and required grid columns are configured separately. A row can be incomplete even when the header is complete.'),
block('4. Select related records', 'Reference fields select actual ERP records. Save a referenced parent before using its saved grid as the source for another selector. A familiar display name is not a substitute for the correct record.'),
block('5. Review and save', 'Check dates, decimal precision, resource assignments and required fields. Save the record. Resolve validation messages at the named field or row rather than deleting valid information just to make the form pass.'),
block('6. Follow the configured workflow', 'Use the workflow actions available to your role and record state. Saving data, completing approval and posting a financial transaction are separate activities. Use Versions to inspect earlier saved data where supported.')],
'Good record codes are an organisation convention. Agree a reusable naming policy with your administrator; the template examples do not mandate one.'),
page('06 / RICH RECORDS', 'Grids, references and history', 'A custom form can hold one value, a related-record selection or a collection of rows.', [
block('Grids save with the record', 'Add or remove rows in the appropriate tab. All grids and custom fields save together. Row-count, required-column and uniqueness rules apply only where configured. Separate grids represent separate collections.'),
block('Dated observations versus effective periods', 'A valuation or meter reading records an observation date. A period-controlled measurement or charge has a start and optional end date. A blank end means indefinitely. Both ends are inclusive: end the old period the day before the new one begins when overlap is prohibited.'),
block('Groups and overlaps', 'Period rules can group rows by a classification or other columns. Different groups may overlap. Gaps are permitted and previous periods are not closed automatically. Dates alone do not activate period validation.'),
block('References must be eligible', 'Selectors list accessible records allowed by the field definition. Some selectors also use a saved parent grid: a claim affected item, for example, must be listed on its selected saved policy. Changing the parent can make a previous selection unavailable.'),
block('Versions record successful saves', 'Subledger, object and dimension saves capture complete record snapshots with their saved schemas and assignments. Even an unchanged save creates a version. Versions are read-only; there is no restore action. Document uploads and workflow actions have separate histories.'),
block('Historical limits', 'Older unversioned records receive a baseline when first edited. That baseline cannot reconstruct changes made before versioning. Copied organisations do not inherit source version history.')],
'Capture is not calculation: market observations do not automatically determine the latest value, meter readings do not calculate consumption, and contract charge rows do not generate invoices.'),
page('07 / ADMINISTRATOR ROADMAP', 'Set up in a sensible order', 'This is a recommended review sequence. Adapt it to your organisation rather than treating the template as policy.', [
block('1. Organisation foundations', 'Under Setup > Organisation, review Organisations, Divisions, Fiscal Year, Countries, Currencies and Tax Types. Agree organisation scope, division ownership and the fiscal calendar before capturing business records.'),
block('2. Accounting structure', 'Under Setup > Accounting Model, review GL Account Types, Subledger Account Types, Accounting Object Types and Accounting Dimension Types. Create or review the actual GL Accounts through the operational menu.'),
block('3. Business forms and responsibility', 'Review schemas, module mappings, workflow paths and resource-role mappings on the relevant types. Under Setup > Organisation, review Resource Roles. Test forms with realistic examples before wider use.'),
block('4. Transaction definitions', 'Under Setup > Transactions, review Transaction Groups, Transaction Types and Workflows. Confirm line definitions, GL accounts, subledger requirements and object/dimension classifications.'),
block('5. Access and outputs', 'Under Setup > Security, review Permissions. Confirm role/module access and division/type/workflow permissions. Review Financial Statement Formats under Setup > Organisation and test reports with authorised users.'),
block('6. Prove one complete scenario', 'Create reference data, capture one representative record and run the intended transaction workflow in a suitable test organisation. Check the resulting report and permissions before repeating the pattern.')],
'Copy Data can reuse selected organisation configuration and records. Include referenced master records where needed: custom references without a matching destination record are cleared and must be reselected.'),
page('08 / TYPE DESIGN', 'Configure types and forms', 'A type is a reusable definition. Design it once and let its records use the same form and validation.', [
block('Keep the three layers separate', 'The class supplies the core role. The type supplies its code, name, description and configuration. The schema supplies additional data and presentation; it does not redefine the object class or replace built-in code/name/division fields.'),
block('Use one schema definition', 'Edit Schema JSON on the relevant type. Use the existing preview and Setup > Accounting Model > Schema UI Tester to inspect rendering. The tester is a runtime sandbox, not a saved type configuration. There is no separate editable UI schema.'),
block('Start with supported field types', 'Supported controls include text, whole numbers, decimals, currency, booleans, dates, email, URL, selections, references and grids. Raw object/array fields use JSON textareas rather than generated nested forms. This is a custom convention, not full JSON Schema support.'),
block('Separate appearance from constraints', 'Titles, tabs, field order, widths and textarea rows affect presentation. Required fields, text lengths, numeric bounds, allowed choices and configured grid/reference rules affect server validation. A placeholder is an example; a default is an initial form convenience.'),
block('Handle decimal values carefully', 'Decimal and currency fields have precision and scale. Excess fractional digits are rejected rather than rounded. Enter ungrouped text such as 12345.60 without symbols or commas. A currency-code label does not convert amounts or store a currency automatically.'),
block('Treat a schema change as a data change', 'Renaming a field changes its storage key. New required fields, shorter limits or removed choices can invalidate existing records. Plan compatibility and migration before applying these changes. Use the schema guide for supported attributes and limitations.')],
'Recommended design habit: test one valid record, one invalid record and one existing record with each changed type. Previewing a control alone does not prove the full save behaviour.'),
page('09 / FINANCIAL CAPTURE', 'Configure and use transactions', 'A transaction type defines a repeatable capture pattern. Its lines connect financial accounts with business classifications.', [
block('Set the capture pattern', 'Use Transaction Groups to organise types. In Transaction Types, review the definition, line definitions and scope. Set the intended GL accounts, debit/credit sides, subledger requirements and required object/dimension types.'),
block('Check each line', 'Select the correct division, account, subledger and required classifications. Configured lines must use their configured GL account and debit/credit side. A subledger may be mandatory, optional or not used; a mandatory type restriction must match.'),
block('Balance and period controls', 'Journals need at least two lines and matching debit and credit totals at cent precision. The period validator accepts open and soft_closed periods and rejects closed or locked periods. Workflow and access controls still apply.'),
block('Related objects must agree', 'When a line captures related objects, their configured root references can be checked for consistency. For example, a selected claim must refer to the policy selected on that line. Choose the correct pair rather than altering the claim to bypass the check.'),
block('Keep master data and postings distinct', 'Contract values, insurance schedules and claim stages record business information. They do not generate journal amounts. Capture financial transactions through the relevant type and follow the organisation\'s authorised accounting process.'),
block('Review the result', 'Use Reports > Ledger Balances, Trial Balance or Financial Statement as appropriate. Financial Statement Formats define the intended presentation. A report needs correctly captured and classified transactions; adding a schema field does not automatically add a report column.')],
'Before reusing a transaction type, confirm its lines suit the actual scenario. A template example is a starting configuration, not approval for a particular accounting treatment.'),
page('10 / ACCESS & MAINTENANCE', 'Make setup usable and controlled', 'A correct definition still needs the right module mappings, permissions and reference data.', [
block('Modules organise available functions', 'Types are mapped to modules. Operational menus reflect active types, mappings and access. Insurance-specific template types belong to Insurance Management; shared supplier, asset and property types retain their own mappings.'),
block('Security roles control access', 'Review module membership and the resource permissions relevant to each division, type and workflow state. Test with a representative user. Administrator visibility is not evidence that everyday users can see or change the same record.'),
block('Resource roles describe responsibility', 'Resource Roles are used for assignments such as handler or responsible person. They are separate from security roles. A type can require assignments; maintain the necessary resources before capturing records that depend on them.'),
block('Use recovery tools for their stated purpose', 'Initialise Schema maintains database structures and applies supported additive template upgrades. Existing non-template organisations do not automatically receive new template grids or type permissions. Follow the deployment procedure when using it.'),
block('Understand template initialisation', 'Initialise Template Org performs full template seeding and can overwrite template configuration. ERP Reset is a destructive recovery function. Neither should be treated as an ordinary way to fix one missing field or permission.'),
block('Review copies after creation', 'Copy selected configuration and records deliberately. Inspect custom references, role access, fiscal setup and report formats in the destination. Copied grid projections are rebuilt, but object version history starts with normal destination saves.')],
'Troubleshoot in this order: organisation context, active type, module mapping, permissions, then record/reference eligibility. These controls solve different problems.'),
page('11 / WALKTHROUGH', 'A property, with useful evidence', 'Recommended template scenario: capture a property and its operational detail without confusing valuation, measurements and accounting.', [
block('1. Prepare shared references', 'Create or review Measurement Type, Measurement Unit, Property Feature Type and Valuation Method dimension records. Select choices that match your organisation\'s vocabulary.'),
block('2. Create the property', 'Choose Property under Accounting Objects. Enter identification, owner division and validity dates. Complete the property kind, ownership, usage and address fields relevant to your organisation.'),
block('3. Capture market observations', 'In Market Values, capture the valuation date, amount, currency code, method, valuer and notes. Multiple rows are observations; the system does not automatically choose one as the current value or revalue a financial account.'),
block('4. Capture effective measurements', 'In Measurements, select a measurement type and unit, quantity and effective dates. The template groups periods by measurement type and prohibits overlaps within that group. Leave the end blank only when the row should continue indefinitely.'),
block('5. Record features', 'In Features, select a feature type and whole-number value. These rows have no period control. Duplicate feature types are permitted unless a uniqueness rule is configured.'),
block('6. Save and use the record', 'Save the complete property, inspect Versions after a later correction, and attach evidence where appropriate. Select the property on transaction lines when the transaction definition calls for it. Capture financial amounts separately.')],
'Illustrative period change: floor area 250.0000 ends on 30 September 2026; floor area 275.0000 begins on 1 October 2026. Ending and starting both rows on 1 October would overlap because endpoints are inclusive.'),
page('12 / WALKTHROUGH', 'From policy to claim', 'Recommended template scenario for an organisation buying insurance. It is not an insurer accounting model.', [
block('1. Prepare the parties and items', 'Review vendor subledgers for insurer/broker, the legal policyholder, relevant resources and insurance dimensions. Insured items can reference supported asset subledgers or property objects.'),
block('2. Save the policy first', 'Create an Insurance policy with its policy number, parties, dates, currency and responsibility. Review Coverage, Insured Items, Premium Schedule and Endorsements. Save the policy and its insured-items grid before creating the claim.'),
block('3. Link a claim to that policy', 'Create an Insurance claim. Select the saved policy, enter incident details and cause, then select affected items from that policy\'s saved insured-items list. The server checks the same membership rule.'),
block('4. Track operational progress', 'Record the claim stage, assessment, approved amount, excess, events and settlement components. These fields describe the case. Stage changes do not generate transactions or calculate remaining limits and coverage eligibility.'),
block('5. Capture finance separately', 'The template offers premium invoice, credit, payment, allocation, accrual/reversal, recovery recognition, settlement receipt and premium refund types. Insurance lines require a policy; recovery/settlement lines also require a consistent claim. Amounts are entered manually.'),
block('6. Apply the agreed accounting policy', 'Reporting or approving a claim is not by itself a reason to recognise a recovery. Capture loss, repair and asset-disposal transactions separately through the appropriate configuration. Review tax only when applicable; it is not inferred from the policy.')],
'Template illustration: an annual property premium of 60000 can be demonstrated with monthly allocations of 5000. This is an example amount and schedule, not an automated allocation or a mandatory policy.'),
page('13 / QUICK ANSWERS', 'When something does not work', 'Start with the visible symptom and check the rule that actually controls it.', [
block('I cannot see a type or menu', 'Confirm organisation context, active status, module mapping and your role\'s module/resource access. Ask the administrator to verify your division and type permissions using your user context.'),
block('A referenced record is missing', 'Check the permitted class/type, access and any saved-parent-grid restriction. Save the source record first. After copying an organisation, reselect references that could not be matched in the destination.'),
block('Save says additional data is invalid', 'Review the named fields and grid rows. Check required values, allowed choices, text limits, decimal scale, row limits, uniqueness and period overlaps. A field that was valid before a schema change may now fail.'),
block('My period rows overlap', 'Check the configured grouping columns and inclusive endpoints. Close the old period the day before the next begins. The system does not close periods automatically; date-only observation grids behave differently.'),
block('The transaction will not validate', 'Check balancing, fiscal period, configured account/side, required subledger type, mandatory classifications and related-object consistency. Resolve the underlying data or configuration before repeating the workflow action.'),
block('I expected a calculation or a restore button', 'Recorded readings, valuations, premiums and charges are not automatic calculations. Versions are read-only snapshots. Reports of current grid rows are distinct from historical snapshots; discuss a specific reporting or calculation requirement with your administrator.')],
'For useful support, provide the organisation, division, record/type code, action, exact validation message and expected result. Avoid including passwords or unrelated confidential record data.'),
page('REFERENCE', 'Keep the guide trustworthy', 'This first edition explains the current model and common tasks. Organisation-specific policy should be documented alongside it.', [
block('What was verified for this edition', 'The guide was checked against current frontend navigation/forms, record-save validators, transaction validation, the schema convention and canonical template seeds. Live browser workflows and database operations were not executed for this PDF.'),
block('Application rules versus template examples', 'Application rules govern required built-in identifiers, schema validation, reference eligibility, hierarchy cycles, transaction balancing and access. Template examples supply recommended types, fields, vocabularies and transaction definitions. Organisations can use different configuration.'),
block('Authoritative project references', 'docs/erp/schema-json.md documents the implemented custom schema convention and limitations. docs/erp/insurance-management.md documents the insurance scenario. Volumes/Core-ERP/seeds/template-defaults.json contains the recommended template and business examples.'),
block('Implementation references', 'Volumes/Core-ERP/public/app.js and public/index.html define the menus and forms. The subledger-accounts, accounting-objects and accounting-dimensions save endpoints enforce record capture rules. api/_shared/erp/journals.js checks transaction lines, balancing and periods.'),
block('A reusable publishing approach', 'This guide is stored as structured sections in docs/erp/user-guide.json. Tools/ERP/build-user-guide.py generates the PDF and reads template inventories from the canonical seed. The same sections can later be adapted into contextual help without copying the template lists.'),
block('What to customise next', 'Agree your first-time setup policy, naming conventions, permission examples and priority workflows. Add verified screenshots from the deployed organisation, then publish task-specific help beside the relevant screens.')],
'Maintenance trigger: update the guide whenever menus, class behaviour, setup procedures or template scenarios change. Rebuild and visually inspect the PDF before distribution.')
]

def build():
    global PAGES
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if SOURCE.exists():
        PAGES = json.loads(SOURCE.read_text(encoding='utf-8'))['sections']
        # Refresh canonical inventories without overwriting editorial changes.
        PAGES[2]['callout'] = 'Template account families: ' + ', '.join(x[1] for x in SEED['ledgerFamilies']) + '. These are starting options, not compulsory account structures.'
        PAGES[3]['callout'] = 'Template object types: ' + ', '.join(x[1] for x in SEED['accountingObjectTypeSeeds']) + '.'
    SOURCE.write_text(json.dumps({'edition': '01', 'date': '2026-10-05', 'sections': PAGES}, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    for name, file in [('Body','72-Regular.ttf'), ('Bold','72-Bold.ttf'), ('Light','72-Light.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(Path('C:/Windows/Fonts')/file)))
    pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Body', boldItalic='Bold')
    styles = {
        'body': ParagraphStyle('body', fontName='Body', fontSize=10.3, leading=14.6, textColor=INK),
        'intro': ParagraphStyle('intro', fontName='Light', fontSize=13, leading=18, textColor=MUTED),
        'head': ParagraphStyle('head', fontName='Bold', fontSize=11.8, leading=16, textColor=TEAL),
        'note': ParagraphStyle('note', fontName='Body', fontSize=9.6, leading=14, textColor=INK),
    }
    c = canvas.Canvas(str(OUT), pagesize=(W,H))
    c.setTitle('ERP | A practical user guide')
    c.setAuthor('ERP project documentation')
    def para(text,x,y,width,style):
        p=Paragraph(text, styles[style]); _,height=p.wrap(width, H)
        p.drawOn(c,x,y-height); return y-height
    def footer(n):
        c.setStrokeColor(colors.HexColor('#DCE5E8')); c.line(46,49,W-46,49)
        c.setFont('Body',8); c.setFillColor(MUTED)
        c.drawString(46,33,'ERP / USER GUIDE / EDITION 01')
        c.drawRightString(W-46,33,f'{n:02d}')
    c.setFillColor(NAVY); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(TEAL); c.rect(W-180,0,180,H,fill=1,stroke=0)
    c.setFillColor(GOLD); c.rect(46,H-97,54,5,fill=1,stroke=0)
    c.setFillColor(colors.white); c.setFont('Bold',13); c.drawString(46,H-132,'ERP / PRACTICAL FIELD GUIDE')
    c.setFont('Light',47)
    for i,line in enumerate(['Know your','objects.','Build your','workflow.']): c.drawString(43,H-230-i*58,line)
    c.setFont('Body',14); c.drawString(46,285,'Object classes, setup and everyday use')
    c.setFont('Body',11); c.drawString(46,248,'For users and organisation administrators')
    c.setStrokeColor(colors.HexColor('#65B7AF')); c.line(46,204,W-46,204)
    c.setFont('Bold',10); c.drawString(46,168,'STARTER EDITION 01')
    c.setFont('Body',10); c.drawString(46,147,'5 October 2026')
    c.setFont('Body',9); c.drawString(46,75,'Built from the ERP implementation and recommended template.')
    c.showPage()
    for idx,p in enumerate(PAGES):
        number=idx+2
        c.bookmarkPage(f'section-{idx}'); c.addOutlineEntry(p['title'],f'section-{idx}',level=0)
        c.setFillColor(TEAL); c.rect(0,H-12,W,12,fill=1,stroke=0)
        c.setFillColor(TEAL); c.setFont('Bold',9); c.drawString(46,H-55,p['section'])
        c.setFillColor(NAVY); c.setFont('Light',28); c.drawString(46,H-96,p['title'])
        y=para(escape(p['intro']),46,H-116,W-92,'intro')-24
        if idx==0:
            rows=[]
            for target,q in enumerate(PAGES[1:],start=1):
                rows.append([Paragraph(f'<link href="#section-{target}" color="#007F80">{escape(q["title"])}</link>',styles['body']),str(target+2)])
            t=Table(rows,colWidths=[W-133,41],rowHeights=23)
            t.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'Body'),('FONTSIZE',(0,0),(-1,-1),10),('TEXTCOLOR',(0,0),(-1,-1),INK),('ALIGN',(1,0),(1,-1),'RIGHT'),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#E1EAEC')),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
            _,th=t.wrap(W-92,H); t.drawOn(c,46,y-th); y-=th+22
            # On the contents page, keep route guidance compact.
            for b in p['blocks'][:2]:
                y=para(escape(b['title']),46,y,W-92,'head')-3
                y=para(escape(b['text']),46,y,W-92,'body')-12
        else:
            for b in p['blocks']:
                y=para(escape(b['title']),46,y,W-92,'head')-4
                y=para(escape(b['text']),46,y,W-92,'body')-17
        if p['callout']:
            note=Paragraph(escape(p['callout']),styles['note']); _,nh=note.wrap(W-116,H)
            boxh=nh+24
            if y-boxh<66: raise RuntimeError(f'Page {number} overflow: {y-boxh}')
            c.setFillColor(PALE); c.roundRect(46,y-boxh,W-92,boxh,7,fill=1,stroke=0)
            c.setFillColor(TEAL); c.rect(46,y-boxh,3,boxh,fill=1,stroke=0)
            note.drawOn(c,58,y-12-nh)
        footer(number); c.showPage()
    c.save()
    print(OUT)

if __name__=='__main__': build()
