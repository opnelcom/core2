from pathlib import Path
p=Path('tmp/pdfs/rounded-workflows.py');s=p.read_text();s=s.replace("('active','deleted'):('e','w',[(870,470),(870,520)])","('active','deleted'):('e15','w15',[(870,485),(870,535)])").replace("('deleted','active'):('s','e',[(1030,410),(860,410),(860,470)])","('deleted','active'):('s','e-15',[(1030,410),(860,410),(860,455)])").replace("('active','blocked'):('e','w',[(850,470),(850,270)])","('active','blocked'):('e-25','w',[(850,445),(850,270)])")
s=s.replace("x,y=pos[k];ww,hh=sizes[k];return {'e':(x+ww/2,y),'w':(x-ww/2,y),'n':(x,y+hh/2),'s':(x,y-hh/2)}[port]","x,y=pos[k];ww,hh=sizes[k];off=float(port[1:] or 0);side=port[0];return {'e':(x+ww/2,y+off),'w':(x-ww/2,y+off),'n':(x+off,y+hh/2),'s':(x+off,y-hh/2)}[side]")
s=s.replace("if v[0]==z[0]:lx+=48", "if v[0]==z[0]:lx+=48\n   if i==4 and key==('cancelled','in_progress'):lx,ly=1220,310\n   if i==4 and key==('in_progress','resolved'):lx,ly=1120,540")
p.write_text(s)
