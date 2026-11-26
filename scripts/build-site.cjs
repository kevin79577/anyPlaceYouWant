// Build the public site into dist/ for static hosting (e.g. Cloudflare Pages: build output directory = dist).
// Only the door site (home.html → index.html, country.html) and its runtime files ship; the old explorer (experience.html),
// design proposals, verify scripts and original PNGs stay out.
// Usage: node scripts/build-site.cjs            private preview: search engines are told not to index it (default)
//        node scripts/build-site.cjs --public   public launch: indexable; refuses while privacy.html still has 待填 placeholders
const fs=require('node:fs'),path=require('node:path');
const isPublic=process.argv.includes('--public');
const src=path.join(__dirname,'../preview'),out=path.join(__dirname,'../dist');
const files=[
  'home.html','country.html','game.html','game.css','game.js','privacy.html','privacy.css','site.css','home.css','country.css',
  'home.js','country.js','shell.js','mystic.js','catalog.js','weather.js','media-player.js',
  'vendor/three.module.min.js','vendor/THREE-LICENSE.txt','assets/region-map-data.js','assets/source-inventory.json','assets/door/borders.json',
  ...fs.readdirSync(path.join(src,'assets')).filter(f=>f.endsWith('.webp')).map(f=>'assets/'+f),// catalog.js still names these scene images
  ...['earth','door','game'].flatMap(d=>fs.readdirSync(path.join(src,'assets',d)).filter(f=>/.(webp|jpg)$/.test(f)).map(f=>`assets/${d}/${f}`))
];
// Keep dist/.vercel (the Vercel project link) so redeploys go to the same project instead of creating a new one named dist.
for(const e of fs.existsSync(out)?fs.readdirSync(out):[])if(e!=='.vercel')fs.rmSync(path.join(out,e),{recursive:true,force:true});
for(const f of files){fs.mkdirSync(path.dirname(path.join(out,f)),{recursive:true});fs.copyFileSync(path.join(src,f),path.join(out,f));}
// The door is the home page.
fs.renameSync(path.join(out,'home.html'),path.join(out,'index.html'));
// Response headers, defined once and written in both host formats: vercel.json (Vercel) and _headers (Cloudflare Pages / Netlify).
// YouTube loads only after "play"; weather calls go straight to Open-Meteo.
const siteHeaders={
  'Content-Security-Policy':"default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self' https://api.open-meteo.com; img-src 'self' data: https://i.ytimg.com; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()',
  ...(isPublic?{}:{'X-Robots-Tag':'noindex, nofollow'})
};
const assetHeaders={'Cache-Control':'public, max-age=86400'};
const lines=h=>Object.entries(h).map(([k,v])=>`  ${k}: ${v}`).join('\n'),pairs=h=>Object.entries(h).map(([key,value])=>({key,value}));
fs.writeFileSync(path.join(out,'_headers'),`/*\n${lines(siteHeaders)}\n/assets/*\n${lines(assetHeaders)}\n`);
fs.writeFileSync(path.join(out,'vercel.json'),JSON.stringify({headers:[{source:'/(.*)',headers:pairs(siteHeaders)},{source:'/assets/(.*)',headers:pairs(assetHeaders)}]},null,2)+'\n');

// Self-check: every local file referenced by the shipped HTML/CSS/JS must exist in dist (a missed file = a broken page).
const missing=[];
for(const f of fs.readdirSync(out,{recursive:true}).filter(f=>/\.(html|css|js)$/.test(f))){
  const text=fs.readFileSync(path.join(out,f),'utf8'),dir=path.dirname(f);
  // Local refs only: skip absolute URLs (https:, mailto:), JS template holes (${...}) and fragments.
  const refs=[...text.matchAll(/(?:src|href)="(?![a-z]+:|\$\{|#)([^"#?]+)[^"]*"/g)].map(m=>path.join(dir,m[1]));
  if(f.endsWith('.js'))refs.push(...[...text.matchAll(/['"`](assets\/[\w.-]+\.(?:webp|png|json))/g)].map(m=>m[1]));
  for(const r of refs)if(!fs.existsSync(path.join(out,r)))missing.push(`${f} → ${r}`);
}
const size=fs.readdirSync(out,{recursive:true}).reduce((n,f)=>{const s=fs.statSync(path.join(out,f));return n+(s.isFile()?s.size:0);},0);
// A public site must name its operator and contact (docs/上線檢查清單.md).
const unfilled=isPublic&&fs.readFileSync(path.join(out,'privacy.html'),'utf8').includes('待填');
if(missing.length){console.error('Missing files in dist:\n  '+[...new Set(missing)].join('\n  '));process.exitCode=1;}
else if(unfilled){fs.rmSync(out,{recursive:true,force:true});console.error('Public build refused: preview/privacy.html still has 待填 placeholders (operator, contact, host). dist/ removed.');process.exitCode=1;}
else console.log(`dist/ ready (${isPublic?'PUBLIC, indexable':'private preview, noindex'}): ${files.length+2} files, ${(size/1048576).toFixed(1)} MB, all local references resolve.`);
