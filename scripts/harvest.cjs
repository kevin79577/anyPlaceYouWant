const fs=require('node:fs');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').trim();
const plain=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' '));
async function retrieve(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text();}
(async()=>{
 const twLinks=JSON.parse(fs.readFileSync('tmp/source-discovery/taiwan-links.json','utf8'));
 const unique=[...new Map(twLinks.map(x=>[x.url,x])).values()];
 const rows=[];let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<unique.length){const item=unique[cursor++];try{const html=await retrieve(item.url);const iframe=html.match(/<iframe\b[^>]*src=["']([^"']+)["']/i);const youtube=iframe&&decode(iframe[1]).match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})(?:\?|$)/);const note=html.match(/本影像[\s\S]{0,350}?(?:<\/p>|<\/div>)/);rows.push({...item,videoId:youtube?.[1],provider:note?plain(note[0]):'我的 E 政府收錄；來源提供者請見原站',discovery:'原站頁面已讀取，播放待驗證'});}catch(error){rows.push({...item,provider:'我的 E 政府收錄',discovery:'原站讀取失敗：'+error.message});}}}));
 rows.sort((a,b)=>unique.findIndex(x=>x.url===a.url)-unique.findIndex(x=>x.url===b.url));
 fs.writeFileSync('tmp/source-discovery/taiwan-inventory.json',JSON.stringify(rows,null,2));
 const th=fs.readFileSync('tmp/source-discovery/thailand.html','utf8');
 const thailand=[...th.matchAll(/<article class="cam"[\s\S]*?<\/article>/g)].map(m=>{const card=m[0],embed=decode(card.match(/data-src="([^"]+)/)?.[1]||'');return {name:plain(card.match(/<h3>([^<]+)/)?.[1]||''),region:card.match(/data-region="([^"]+)/)?.[1],videoId:embed.match(/\/embed\/([\w-]{11})\?/)?.[1],url:decode(card.match(/class="credit" href="([^"]+)/)?.[1]||''),provider:plain(card.match(/class="credit"[^>]*>([\s\S]*?)<\/a>/)?.[1]||'來源提供者待確認')};});
 fs.writeFileSync('tmp/source-discovery/thailand-inventory.json',JSON.stringify(thailand,null,2));
 for(const [name,url] of [['korea-places','https://korivu.codetfind.com/places.js'],['korea-official','https://korivu.codetfind.com/official-catalog.js']]){try{fs.writeFileSync('tmp/source-discovery/'+name+'.js',await retrieve(url));}catch{}}
 console.log(JSON.stringify({taiwan:rows.length,taiwanVideoIds:rows.filter(x=>x.videoId).length,thailand:thailand.length}));
})();
