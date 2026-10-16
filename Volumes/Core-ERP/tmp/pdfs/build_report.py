import json, re, html
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4, landscape
D=json.loads(Path('seeds/template-defaults.json').read_text(encoding='utf-8-sig'))
out=Path('output/pdf/template-erp-definitions.pdf')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='CellSmall',fontName='Helvetica',fontSize=7,leading=9,spaceAfter=0))
styles.add(ParagraphStyle(name='SmallNote',fontSize=8,leading=11,spaceAfter=7))
story=[]
def p(t,style='CellSmall'): return Paragraph(html.escape(str(t)).replace('\n','<br/>'),styles[style])
def table(headers,rows,widths):
    data=[[p(x) for x in headers]]+[[p(x) for x in r] for r in rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dce8f2')),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.3,colors.HexColor('#ccd3db')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story.extend([t,Spacer(1,10)])
story.append(p('Core-ERP template definitions','Title'))
story.append(p('Transaction types, posting lines, object types and custom schemas','Heading2'))
story.append(p('14 October 2026 | Source-defined inventory','Normal'))
story.append(Spacer(1,15))
story.append(p('110 transaction types and 305 lines; 48 object types comprising 11 sub-ledgers, 20 accounting objects and 17 accounting dimensions.','Normal'))
story.append(Spacer(1,10))
story.append(p('Source: seeds/template-defaults.json, interpreted using the existing seeding services. The live template organisation database has not been checked. This report does not change application configuration or database records.','Normal'))
story.append(Spacer(1,10))
story.append(p('The opening guide explains setup and operation. Part 1 contains every transaction type and line, including classifications and optional example bindings. Part 2 contains every object type definition and its complete schema configuration. Standard database record columns are outside the custom schemas.','Normal'))
story.append(PageBreak())
# Practical operating guide precedes the existing reference catalogue.
guide=json.loads(Path('tmp/pdfs/usage-guide.json').read_text(encoding='utf-8-sig'))
for section in guide:
    story.append(p(section['title'],'Heading1'))
    story.append(p(section['intro'],'Normal'))
    story.append(Spacer(1,14))
    for number,step in enumerate(section['steps'],1):
        story.append(p(str(number)+'. '+step,'Normal'))
        story.append(Spacer(1,10))
    story.append(Spacer(1,8))
    story.append(p('Readiness check','Heading2'))
    story.append(p(section['check'],'Normal'))
    story.append(PageBreak())
md=Path('C:/Users/JoeO/.codex/visualizations/2026/10/14/01a13bf6-7fb2-7643-88e1-f9dd8c8ff3e5/template-transaction-types.md').read_text(encoding='utf-8-sig').splitlines()
story.append(p('Part 1 - Transaction definitions','Heading1'))
i=0
while i<len(md):
    line=md[i]
    if line.startswith('## '): story.append(p(line[3:],'Heading1'))
    elif line.startswith('### '): story.append(p(line[4:].replace('—','-'),'Heading2'))
    elif line.startswith('| Order'):
        headers=[x.strip() for x in line.strip('|').split('|')];i+=2;rows=[]
        while i<len(md) and md[i].startswith('|'):
            rows.append([x.strip().replace('—','-') for x in md[i].strip('|').split('|')]);i+=1
        table(headers,rows,[100,110,32,85,55,45,65,140,138]);continue
    elif line and not line.startswith('#') and not line.startswith('110 transaction'):
        story.append(p(line,'SmallNote'))
    i+=1
story.append(PageBreak());story.append(p('Part 2 - Object type definitions and schemas','Heading1'))
def schema_rows(s,prefix=''):
    rows=[]
    for key,v in s.get('properties',{}).items():
        required=key in s.get('required',[])
        details={k:x for k,x in v.items() if k not in ['type','title','rowSchema','properties','items']}
        rows.append([prefix+key,v.get('title',''),v.get('type',''), 'Yes' if required else 'No',json.dumps(details,ensure_ascii=False,sort_keys=True) if details else '-'])
        if 'rowSchema' in v: rows+=schema_rows(v['rowSchema'],prefix+key+'.')
        if 'properties' in v: rows+=schema_rows(v,prefix+key+'.')
        if isinstance(v.get('items'),dict): rows+=schema_rows(v['items'],prefix+key+'[].')
    return rows
for group,seeds,metadata in [('Sub-ledger',D['ledgerFamilies'],D['ledgerFamilySchemas']),('Accounting Object',D['accountingObjectTypeSeeds'],D['accountingObjectTypeMetadata']),('Accounting Dimension',D['accountingDimensionTypeSeeds'],D['accountingDimensionTypeMetadata'])]:
    for t in seeds:
        story.append(PageBreak());story.append(p(group+' / '+t[1],'Heading1'));story.append(p('Type code: '+t[0],'SmallNote'))
        desc=t[4] if group=='Sub-ledger' else t[2]
        story.append(p(desc,'Normal'));story.append(Spacer(1,8))
        m=metadata.get(t[0],{})
        s=m if group=='Sub-ledger' else m.get('schema_json',{'type':'object','properties':{},'required':[],'additionalProperties':False})
        rows=schema_rows(s)
        if rows: table(['Field / grid column','Caption','Type','Required','Configuration / validation'],rows,[135,110,60,45,420])
        else: story.append(p('No custom schema fields.','Normal'))
        story.append(p('Complete schema configuration','Heading2'))
        # Preserve every schema setting, including tabs, grid row constraints and presentation metadata.
        for ln in json.dumps(s,ensure_ascii=False,indent=2).splitlines():
            story.append(p(ln,'CellSmall'))
        if group!='Sub-ledger' and m.get('ui_schema_json'):
            story.append(p('UI schema configuration','Heading2'))
            for ln in json.dumps(m['ui_schema_json'],ensure_ascii=False,indent=2).splitlines(): story.append(p(ln,'CellSmall'))
def footer(c,doc):
    c.saveState();c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#536577'));c.drawString(36,20,'Core-ERP | Template seed definitions');c.drawRightString(806,20,str(doc.page));c.restoreState()
SimpleDocTemplate(str(out),pagesize=landscape(A4),rightMargin=36,leftMargin=36,topMargin=32,bottomMargin=36,title='Core-ERP template definitions',author='Core-ERP').build(story,onFirstPage=footer,onLaterPages=footer)
from pypdf import PdfReader
r=PdfReader(out);text='\n'.join(page.extract_text() for page in r.pages)
assert all(t[0] in text for t in D['transactionTypes'])
assert all(t[0] in text for key in ['ledgerFamilies','accountingObjectTypeSeeds','accountingDimensionTypeSeeds'] for t in D[key])
print(f'{out.resolve()} | {len(r.pages)} pages | all 110 transaction and 48 object type codes verified')


