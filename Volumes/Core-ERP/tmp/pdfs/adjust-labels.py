import json
p='tmp/pdfs/workflows.json'
d=json.load(open(p))
for index,source,target,dx,dy in [(1,'active','deleted',100,45),(1,'deleted','active',-65,-35),(4,'in_progress','cancelled',50,20),(4,'cancelled','in_progress',-70,-20)]:
 g=d[index]['graph']; names={o['_gvid']:o['name'] for o in g['objects']}
 for e in g['edges']:
  if names[e['tail']]==source and names[e['head']]==target:
   for op in e.get('_ldraw_',[]):
    if op['op']=='T':op['pt'][0]+=dx;op['pt'][1]+=dy
json.dump(d,open(p,'w'))
