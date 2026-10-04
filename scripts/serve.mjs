import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
const port=Number(process.env.PORT||'5174');
http.createServer(async(req,res)=>{
  const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
  try{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return;}
    if(route==='/config.js'){
      const body='window.DEBTOFF_API_ORIGIN = '+JSON.stringify(process.env.DEBTOFF_API_ORIGIN||'http://localhost:8000')+';';
      res.writeHead(200,{...headers,'Content-Type':'application/javascript; charset=utf-8'});res.end(req.method==='HEAD'?'':body);return;
    }
    const path=resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!path.startsWith(root+sep)||!types[extname(path)]||!(await stat(path)).isFile())throw new Error('not found');
    const body=await readFile(path);
    res.writeHead(200,{...headers,'Content-Type':types[extname(path)],'Content-Length':body.length});res.end(req.method==='HEAD'?'':body);
  }catch{res.writeHead(404,headers);res.end('Not found');}
}).listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Frontend listening on '+port));
