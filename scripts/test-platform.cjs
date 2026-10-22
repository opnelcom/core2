'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const directories=['Applications/Core-Runtime/test','Packages/identity-client/test','Packages/service-client/test','test',
  'Volumes/Core-SaaS/test','Volumes/Core-Broker/test','Volumes/Core-DBManager/test'];
if(process.argv.includes('--all-app-tests'))directories.push('Volumes/Core-ERP/test','Volumes/Core-ObjectSphere/test');
const tests=directories.flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(file=>file.endsWith('.test.js')).map(file=>path.join(dir,file)));
if(!process.argv.includes('--all-app-tests')){
  for(const name of ['exchange-rates','menu-favourites','object-statement','template-initialisation','financial-reports','trial-balance'])
    tests.push(path.join('Volumes/Core-ERP/test',name+'.test.js'));
}
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
