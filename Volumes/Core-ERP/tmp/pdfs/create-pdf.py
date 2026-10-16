import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3,landscape
from pypdf import PdfReader
items=json.load(open('tmp/pdfs/workflows.json'))
out='output/pdf/template-organisation-workflows.pdf'
W,H=landscape(A3); c=canvas.Canvas(out,pagesize=(W,H)); c.setTitle('Template Organisation - Workflow Paths')
notes=[
'Deleted and Archived have no outgoing actions.',
'Check: Active has no Archive action. Deleted can be reactivated.',
'Check: Requesting Archive disables use. Blocked can return to Active via Requesting Archive.',
'Posted, Deleted and Archived have no outgoing actions. Posting validations apply separately.',
'Check: Allocate Team leads to Team Allocation Pending. Closed can return to Resolved.'
]
def draw_ops(ops):
 color='#283747'; fill='#283747'; size=12
 for op in ops:
  t=op['op']
  if t in ('c','C'):
   v=op['color']; v='#283747' if v in ('black','#000000') else v
   if v=='transparent': v='#FFFFFF'
   if t=='c': c.setStrokeColor(HexColor(v)); color=v
   else: c.setFillColor(HexColor(v)); fill=v
  elif t=='S':
   if op['style'].startswith('setlinewidth('): c.setLineWidth(float(op['style'][13:-1]))
  elif t in ('b','B'):
   pts=op['points']; p=c.beginPath();p.moveTo(*pts[0])
   for i in range(1,len(pts),3):p.curveTo(*(pts[i]+pts[i+1]+pts[i+2]))
   c.drawPath(p,stroke=1,fill=t=='B')
  elif t in ('p','P'):
   pts=op['points'];p=c.beginPath();p.moveTo(*pts[0])
   for pt in pts[1:]:p.lineTo(*pt)
   p.close();c.drawPath(p,stroke=1,fill=t=='P')
  elif t=='F':size=op['size'];c.setFont('Helvetica',size)
  elif t=='T':
   x,y=op['pt']; text=op['text'];c.setFillColor(HexColor('#283747'))
   {'c':c.drawCentredString,'l':c.drawString,'r':c.drawRightString}[op['align']](x,y,text)
for i,item in enumerate(items):
 c.setFillColor(HexColor('#16324F'));c.setFont('Helvetica-Bold',22);c.drawString(42,H-49,item['name'])
 c.setFont('Helvetica',11);c.drawString(42,H-72,'Template organisation seed | Left-to-right action paths | 14 October 2026')
 g=item['graph'];bb=list(map(float,g['bb'].split(',')));gw,gh=bb[2],bb[3]
 scale=min((W-84)/gw,(H-210)/gh,1.5)
 c.saveState();c.translate((W-gw*scale)/2,135+(H-210-gh*scale)/2);c.scale(scale,scale);c.setLineWidth(0.8)
 for e in g.get('edges',[]):
  for k in ('_draw_','_hdraw_','_ldraw_'):draw_ops(e.get(k,[]))
 for node in g['objects']:
  for k in ('_draw_','_ldraw_'):draw_ops(node.get(k,[]))
 c.restoreState();c.setFillColor(HexColor('#283747'));c.setFont('Helvetica',11)
 c.drawString(42,95,notes[i]);c.drawString(42,72,'Green status boxes are enabled for use. Initial identifies the starting status.')
 c.setFont('Helvetica',9);c.drawString(42,49,'Source: seeds/template-defaults.json. Seed definitions only; current database configuration was not verified.')
 c.drawRightString(W-42,49,f'{i+1} / {len(items)}');c.showPage()
c.save();reader=PdfReader(out);assert len(reader.pages)==5
for page,item in zip(reader.pages,items):
 text=page.extract_text(); assert item['name'] in text
print(out, 'verified: 5 pages')
