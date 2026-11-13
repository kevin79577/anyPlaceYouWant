// Build the public site into dist/ for static hosting (e.g. Cloudflare Pages: build output directory = dist).
// Only the explorer and its runtime files ship; design proposals, verify scripts and original PNGs stay out.
// Usage: node scripts/build-site.cjs
const fs=require('node:fs'),path=require('node:path');
const src=path.join(__dirname,'../preview'),out=path.join(__dirname,'../dist');
const files=[
  'experience.html','privacy.html','privacy.css','globe.css','experience-ui.css',
  'vendor/d3.min.js','vendor/D3-LICENSE.txt','assets/world-data.js','assets/world-low-data.js',
  'globe-flight.js','catalog.js','weather.js','media-player.js','globe.js','experience-ui.js',
  'assets/source-inventory.json',
  ...fs.readdirSync(path.join(src,'assets')).filter(f=>f.endsWith('.webp')).map(f=>'assets/'+f)
];
fs.rmSync(out,{recursive:true,force:true});
for(const f of files){fs.mkdirSync(path.dirname(path.join(out,f)),{recursive:true});fs.copyFileSync(path.join(src,f),path.join(out,f));}
// The explorer is the home page.
fs.copyFileSync(path.join(out,'experience.html'),path.join(out,'index.html'));
// Cloudflare Pages / Netlify header rules. YouTube loads only after "play"; weather calls go straight to Open-Meteo.
fs.writeFileSync(path.join(out,'_headers'),`/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self' https://api.open-meteo.com; img-src 'self' data: https://i.ytimg.com; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
/assets/*
  Cache-Control: public, max-age=86400
`);

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
if(missing.length){console.error('Missing files in dist:\n  '+[...new Set(missing)].join('\n  '));process.exitCode=1;}
else console.log(`dist/ ready: ${files.length+2} files, ${(size/1048576).toFixed(1)} MB, all local references resolve.`);
