import json,math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3,landscape
from pypdf import PdfReader
D=json.load(open('seeds/template-defaults.json',encoding='utf-8')); labels={s['status_code']:s['status_label'] for s in D['workflowStatuses']}
W,H=landscape(A3);out='output/pdf/template-organisation-workflows.pdf';c=canvas.Canvas(out,pagesize=(W,H));c.setTitle('Template Organisation - Workflow Paths')
# Positions, in a shared diagram coordinate system. Routing is explicit so feedback paths cannot reshape the main sequence.
layouts=[
 {'active':(100,430),'deleted':(600,470),'archived':(600,280)},
 {'draft':(100,520),'archived':(390,300),'active':(690,470),'deleted':(1030,520),'blocked':(1030,270)},
 {'draft':(100,520),'submitted':(360,520),'active':(620,520),'requesting_archive':(900,520),'archived':(1190,520),'deleted':(100,260),'blocked':(360,260),'requesting_reactivation':(900,260)},
 {'draft':(100,520),'submitted':(510,520),'posted':(950,520),'deleted':(510,290),'archived':(950,290)},
 {'draft':(100,520),'submitted':(350,520),'team_allocation_pending':(650,520),'in_progress':(970,520),'resolved':(1270,520),'closed':(1540,520),'deleted':(350,250),'cancelled':(970,250)}]
# (source,target): ports and intermediate corners. All paths consist of straight segments with rounded corners.
routes=[
 {('active','deleted'):('e','w',[(360,430),(360,470)]),('active','archived'):('s','w',[(100,280)])},
 {('draft','active'):('e','w',[(240,520),(240,470)]),('draft','deleted'):('n','n',[(100,650),(1030,650)]),('draft','archived'):('s','w',[(100,300)]),('active','deleted'):('e15','w15',[(870,485),(870,535)]),('active','blocked'):('e-25','w',[(850,445),(850,270)]),('archived','active'):('e','w',[(550,300),(550,470)]),('deleted','active'):('s','e-15',[(1030,410),(860,410),(860,455)]),('blocked','active'):('s','s',[(1030,170),(690,170)])},
 {('draft','submitted'):('e','w',[]),('draft','deleted'):('s','n',[]),('submitted','active'):('e','w',[]),('submitted','draft'):('n','n',[(360,630),(100,630)]),('submitted','blocked'):('s','n',[]),('active','requesting_archive'):('e','w',[]),('requesting_archive','archived'):('e','w',[]),('requesting_archive','active'):('n','n',[(900,630),(620,630)]),('blocked','requesting_reactivation'):('e','w',[]),('blocked','requesting_archive'):('s','s',[(360,100),(770,100),(770,410),(900,410)]),('archived','requesting_reactivation'):('s','e',[(1190,260)]),('requesting_reactivation','active'):('n','s',[(900,360),(620,360)]),('requesting_reactivation','blocked'):('s','s',[(900,160),(360,160)])},
 {('draft','submitted'):('e','w',[]),('draft','deleted'):('s','w',[(100,290)]),('draft','archived'):('s','s',[(100,170),(950,170)]),('submitted','draft'):('n','n',[(510,640),(100,640)]),('submitted','posted'):('e','w',[])},
 {('draft','submitted'):('e','w',[]),('draft','deleted'):('s','w',[(100,250)]),('submitted','team_allocation_pending'):('e','w',[]),('team_allocation_pending','in_progress'):('e','w',[]),('in_progress','resolved'):('e','w',[]),('in_progress','team_allocation_pending'):('n','n',[(970,650),(650,650)]),('in_progress','cancelled'):('s','n',[]),('cancelled','in_progress'):('e','e-15',[(1120,250),(1120,505)]),('resolved','in_progress'):('s','s',[(1270,400),(970,400)]),('resolved','closed'):('e','w',[]),('closed','resolved'):('n','n',[(1540,650),(1270,650)])}]

layouts[0]={'active':(150,480),'deleted':(600,480),'archived':(600,320)}
routes[0]={('active','deleted'):('e','w',[]),('active','archived'):('e-15','w',[(280,465),(280,320)])}
layouts[2]={'submitted':(100,510),'draft':(400,510),'deleted':(700,510),'blocked':(400,350),'requesting_archive':(700,190),'archived':(1050,270),'requesting_reactivation':(1400,400),'active':(1800,550)}
routes[2]={
 ('draft','submitted'):('w-15','e-15',[(270,495),(270,440),(200,440),(200,495)]),
 ('draft','deleted'):('e','w',[]),
 ('submitted','draft'):('e','w',[]),
 ('submitted','active'):('e15','w15',[(200,525),(200,620),(1670,620),(1670,565)]),
 ('submitted','blocked'):('e-25','w',[(230,485),(230,350)]),
 ('active','requesting_archive'):('w-25','e-15',[(1740,525),(1740,110),(860,110),(860,175)]),
 ('requesting_archive','archived'):('e','w',[(870,190),(870,270)]),
 ('requesting_archive','active'):('e15','w-15',[(900,205),(900,150),(1710,150),(1710,535)]),
 ('blocked','requesting_reactivation'):('e15','w15',[(570,365),(570,460),(1220,460),(1220,415)]),
 ('blocked','requesting_archive'):('e-15','w',[(550,335),(550,190)]),
 ('archived','requesting_reactivation'):('e','w-15',[(1230,270),(1230,385)]),
 ('requesting_reactivation','active'):('e','w',[(1650,400),(1650,550)]),
 ('requesting_reactivation','blocked'):('w','e-5',[(1180,400),(1180,345)])}
layouts[3]={'submitted':(130,500),'draft':(600,500),'deleted':(1050,500),'posted':(600,270),'archived':(1050,270)}
routes[3]={('submitted','draft'):('e15','w15',[]),('draft','submitted'):('w-15','e-15',[(440,485),(440,410),(320,410),(320,485)]),('draft','deleted'):('e','w',[]),('draft','archived'):('e-15','w',[(760,485),(760,270)]),('submitted','posted'):('e-25','w',[(290,475),(290,270)])}
layouts[4]['deleted']=(350,360);layouts[4]['cancelled']=(1270,360)
routes[4][('draft','deleted')]=('e-15','w',[(220,505),(220,360)])
routes[4][('in_progress','team_allocation_pending')]=('w-15','e-15',[(820,505),(820,450),(790,450),(790,505)])
routes[4][('in_progress','cancelled')]=('e-15','w15',[(1090,505),(1090,375)])
routes[4][('cancelled','in_progress')]=('w-15','e-25',[(1110,345),(1110,300),(1080,300),(1080,495)])
routes[4][('resolved','in_progress')]=('w-15','e15',[(1130,505),(1130,450),(1070,450),(1070,535)])
routes[4][('closed','resolved')]=('w-15','e-15',[(1430,505),(1430,450),(1400,450),(1400,505)])

def rounded(points,r=10):
 p=c.beginPath();p.moveTo(*points[0])
 for i in range(1,len(points)-1):
  a,b,z=points[i-1],points[i],points[i+1]; l1=math.dist(a,b);l2=math.dist(b,z)
  if not l1 or not l2:continue
  rr=min(r,l1/2,l2/2); q=(b[0]+(a[0]-b[0])*rr/l1,b[1]+(a[1]-b[1])*rr/l1);t=(b[0]+(z[0]-b[0])*rr/l2,b[1]+(z[1]-b[1])*rr/l2)
  p.lineTo(*q);p.curveTo(q[0]+(b[0]-q[0])*.5523,q[1]+(b[1]-q[1])*.5523,t[0]+(b[0]-t[0])*.5523,t[1]+(b[1]-t[1])*.5523,*t)
 p.lineTo(*points[-1]);c.drawPath(p)
notes=['Deleted and Archived have no outgoing actions.','Check: Active has no Archive action. Deleted can be reactivated.','Check: Requesting Archive disables use. Blocked can return to Active via Requesting Archive.','Posted, Deleted and Archived have no outgoing actions. Posting validations apply separately.','Check: Allocate Team leads to Team Allocation Pending. Closed can return to Resolved.']
for i,w in enumerate(D['workflows']):
 c.setFillColor(HexColor('#16324F'));c.setFont('Helvetica-Bold',22);c.drawString(42,H-49,w['path_name']);c.setFont('Helvetica',11);c.drawString(42,H-72,'Template organisation seed | Left-to-right action paths | 14 October 2026')
 pos=layouts[i]; sizes={k:(max(145,min(245,len(labels[k])*7.5+32)),68) for k in pos}
 xmax=max(x+sizes[k][0]/2 for k,(x,y) in pos.items())+30; scale=min((W-84)/xmax,(H-220)/700,1.05)
 c.saveState();c.translate((W-xmax*scale)/2,130+(H-220-700*scale)/2);c.scale(scale,scale)
 def anchor(k,port):
  x,y=pos[k];ww,hh=sizes[k];off=float(port[1:] or 0);side=port[0];return {'e':(x+ww/2,y+off),'w':(x-ww/2,y+off),'n':(x+off,y+hh/2),'s':(x+off,y-hh/2)}[side]
 for s in w['steps']:
  for a in s['actions']:
   key=(s['step_code'],a['next_step_code']);p1,p2,mid=routes[i][key];pts=[anchor(key[0],p1)]+mid+[anchor(key[1],p2)]
   assert all(abs(v[0]-z[0])<.01 or abs(v[1]-z[1])<.01 for v,z in zip(pts,pts[1:])),key
   c.setStrokeColor(HexColor('#536578'));c.setLineWidth(1.2);rounded(pts)
   end=pts[-1];pre=pts[-2];dx,dy=end[0]-pre[0],end[1]-pre[1];ll=math.hypot(dx,dy);ux,uy=dx/ll,dy/ll
   ar=c.beginPath();ar.moveTo(*end);ar.lineTo(end[0]-8*ux+3*uy,end[1]-8*uy-3*ux);ar.lineTo(end[0]-8*ux-3*uy,end[1]-8*uy+3*ux);ar.close();c.setFillColor(HexColor('#536578'));c.drawPath(ar,fill=1,stroke=0)
   segs=list(zip(pts,pts[1:])); horizontal=[(v,z) for v,z in segs if v[1]==z[1]];v,z=max(horizontal or segs,key=lambda seg:math.dist(*seg));lx,ly=(v[0]+z[0])/2,(v[1]+z[1])/2
   if v[0]==z[0]:lx+=48
   if i==4:
    overrides={('in_progress','team_allocation_pending'):(805,450),('resolved','in_progress'):(1100,450),('closed','resolved'):(1415,450),('in_progress','cancelled'):(1150,375),('cancelled','in_progress'):(1130,300)}
    lx,ly=overrides.get(key,(lx,ly))

   c.setFont('Helvetica',11);tw=c.stringWidth(a['action_label'],'Helvetica',11);c.setFillColor(HexColor('#FFFFFF'));c.setStrokeColor(HexColor("#B7C5D7"));c.roundRect(lx-tw/2-7,ly-9,tw+14,19,8,fill=1,stroke=1);c.setFillColor(HexColor('#16324F'));c.drawCentredString(lx,ly-3,a['action_label'])
 for s in w['steps']:
  k=s['step_code'];x,y=pos[k];ww,hh=sizes[k];c.setFillColor(HexColor('#E3F2EA' if s['enabled_for_use'] else '#EDF2F8'));c.setStrokeColor(HexColor('#243D59'));c.roundRect(x-ww/2,y-hh/2,ww,hh,10,fill=1,stroke=1);c.setFillColor(HexColor('#16324F'));c.setFont('Helvetica-Bold',13);c.drawCentredString(x,y+4,labels[k]);sub='Initial' if s['is_initial'] else '';sub+=(' | ' if sub else '')+'Enabled for use' if s['enabled_for_use'] else '';c.setFont('Helvetica',10);c.drawCentredString(x,y-14,sub)
 c.restoreState();c.setFillColor(HexColor('#283747'));c.setFont('Helvetica',11);c.drawString(42,95,notes[i]);c.drawString(42,72,'Green status boxes are enabled for use. Initial identifies the starting status.');c.setFont('Helvetica',9);c.drawString(42,49,'Source: seeds/template-defaults.json. Seed definitions only; current database configuration was not verified.');c.drawRightString(W-42,49,f'{i+1} / 5');c.showPage()
c.save();r=PdfReader(out);assert len(r.pages)==5
for p,w in zip(r.pages,D['workflows']):
 text=p.extract_text();assert w['path_name'] in text
 for s in w['steps']:
  for a in s['actions']:assert a['action_label'] in text
print('Verified all 39 action labels across five pages')

