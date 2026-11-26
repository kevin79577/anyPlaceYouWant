// Loopback-only static preview server. No upload, proxy, account or API keys.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end('Bad request');return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/home.html':pathname));
  if(!file.startsWith(root+path.sep)||path.extname(file)==='.cjs'){res.writeHead(403).end('Forbidden');return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','Referrer-Policy':'strict-origin-when-cross-origin','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);});
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 4173 is in use. Reuse the existing preview or stop its process first.':error.message);process.exitCode=1;});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173/ (home.html)'));
