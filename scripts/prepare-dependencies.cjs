'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const components=require('../deployment/components.json');
const args=process.argv.slice(2);
const rootIndex=args.indexOf('--root');
const root=rootIndex<0?path.resolve(__dirname,'..'):path.resolve(args[rootIndex+1]);
const cliIndex=args.indexOf('--npm-cli');
const npmCli=cliIndex<0?null:path.resolve(args[cliIndex+1]);
function npm(cwd,...commands){
  // npm_execpath allows invocation via npm; explicit --npm-cli supports standalone Node installations.
  const cli=npmCli||process.env.npm_execpath;
  const command=cli?process.execPath:(process.platform==='win32'?'npm.cmd':'npm');
  const result=spawnSync(command,cli?[cli,...commands]:commands,{cwd,stdio:'inherit',shell:!cli&&process.platform==='win32'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('npm failed in '+path.basename(cwd));
}
if(args.includes('--pack')){
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'core-packages-'));
  for(const name of ['identity-client','service-client']){
    const dir=path.join(root,'Packages',name);
    const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
    npm(dir,'pack','--ignore-scripts','--pack-destination',output);
    const archive=pkg.name.replace('@','').replace('/','-')+'-'+pkg.version+'.tgz';
    for(const component of components.filter(c=>c.dependencies.includes(pkg.name))){
      const vendor=path.join(root,'Volumes',component.folder,'vendor');
      fs.mkdirSync(vendor,{recursive:true});
      fs.copyFileSync(path.join(output,archive),path.join(vendor,archive));
    }
  }
}
for(const component of components){
  const dir=path.join(root,'Volumes',component.folder);
  // The mount point must exist before Docker overlays the writable logs mount.
  fs.mkdirSync(path.join(dir,'logs'),{recursive:true});
  if(!component.dependencies.length)continue;
  if(args.includes('--update-locks')){
    // Resolve local release archives afresh, rather than reusing an older installed copy.
    const release=fs.mkdtempSync(path.join(os.tmpdir(),'core-lockfile-'));
    fs.copyFileSync(path.join(dir,'package.json'),path.join(release,'package.json'));
    if(fs.existsSync(path.join(dir,'vendor')))fs.cpSync(path.join(dir,'vendor'),path.join(release,'vendor'),{recursive:true});
    npm(release,'install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund');
    fs.copyFileSync(path.join(release,'package-lock.json'),path.join(dir,'package-lock.json'));
  }
  if(!args.includes('--lockfiles-only'))npm(dir,'ci',args.includes('--include-dev')?'--include=dev':'--omit=dev','--ignore-scripts','--no-audit','--no-fund');
}
console.log('Component dependencies prepared. No containers were restarted.');
