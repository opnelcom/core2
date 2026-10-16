'use strict';
// Run manually for isolated browser checks: node test/fixtures/record-comments-server.js
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const files={'/':path.join(__dirname,'record-comments.html'),'/style.css':path.join(__dirname,'../../public/style.css'),'/record-comments.js':path.join(__dirname,'../../public/record-comments.js')};
http.createServer((req,res)=>{
  const file=files[req.url];if(!file){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(file));
}).listen(8765,'127.0.0.1',()=>console.log('Comments UI fixture: http://127.0.0.1:8765'));
