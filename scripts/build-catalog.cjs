const fs=require('node:fs');
const countries={japan:{name:'日本',iso:'JPN',zone:'Asia/Tokyo',image:'assets/cinema.webp'},korea:{name:'韓國',iso:'KOR',zone:'Asia/Seoul',image:'assets/atlas.webp'},taiwan:{name:'台灣',iso:'TWN',zone:'Asia/Taipei',image:'assets/taipei-scene-v1.webp'},thailand:{name:'泰國',iso:'THA',zone:'Asia/Bangkok',image:'assets/play.webp'}};
const places=[],sources={};
function add(countryKey,id,name,point,region,source,precision='景點參考點'){
 const c=countries[countryKey];let p=places.find(x=>x.id===id);
 if(!p){p={id,countryKey,iso:c.iso,country:c.name,name,point,region,zone:c.zone,image:c.image,alt:c.name+'風格示意圖，非所選地點現場',en:region+' / '+c.name,title:name,subtitle:'探索當地影像與天氣',description:'此處收錄可追溯的公開影像入口；風格圖片不是所選地點的現場。地圖與天氣採'+precision+'，不代表攝影機精確位置。',aliases:[name,region,c.name,id],label:[18,-25],coordinatePrecision:precision};places.push(p);sources[id]=[];}
 if(source){source.id=source.id||id+'-'+sources[id].length;source.title=source.title||name;source.provider=String(source.provider||'來源提供者請見原站').split(/\b(?:var|let|const)\s|\bfunction\s|\$\s*\(|<script/i)[0].trim().slice(0,120)||'來源提供者請見原站';source.reference=source.reference||source.url;source.fallback=source.fallback||source.url;source.checkedAt=source.checkedAt||'2026-11-12';source.status='candidate';if(!sources[id].some(s=>s.url===source.url&&s.videoId===source.videoId))sources[id].push(source);}
 return p;
}
const yt=(videoId,title,provider,reference)=>({videoId,title,provider,url:'https://www.youtube.com/watch?v='+videoId,reference});
add('thailand','thailand','蘇梅島・水晶灣',[100.067,9.53],'蘇梅島',Object.assign(yt('Fw9hgttWzIg','Crystal Bay Beach Resort','The Real Samui Webcam（待核實）','https://phuketdreamcompany.asia/phuket-live-webcams/'),{id:'samui-beach'}));
add('thailand','thailand','蘇梅島・水晶灣',[100.067,9.53],'蘇梅島',Object.assign(yt('3N3ZwIB_X4Y','Crystal Bay Yacht Club','The Real Samui Webcam（待核實）','https://phuketdreamcompany.asia/phuket-live-webcams/'),{id:'samui-yacht'}));
// 台灣、日本、韓國只收 refs/<國家>_livecams.xlsx 的來源，由 scripts/import-livecams.cjs 產生（含播放檢查、行政區、頻道名稱）。tier：hot＝熱門景點工作表，general＝只在「全部」。
for(const key of ['japan','korea','taiwan']){const data=JSON.parse(fs.readFileSync(__dirname+'/data/livecams-'+key+'.json','utf8')); for(const row of data.places)for(const s of row.sources){const p=add(key,row.id,row.name,[row.lng,row.lat],row.region,{videoId:s.videoId,title:s.title,url:'https://www.youtube.com/watch?v='+s.videoId,reference:s.channel,fallback:s.channel,provider:s.provider, discovery:data.playbackChecked?'匯入時實際播放成功':'匯入時 oEmbed 可嵌入，實際播放待驗證',checkedAt:data.checkedAt},row.coordinatePrecision);p.tier=row.tier;p.category=row.category;}}
const thPoints={Phuket:[98.3,7.89],'Khao Lak':[98.25,8.65],'Koh Samui':[100.067,9.53],'Koh Phangan':[100.03,9.72],Bangkok:[100.56,13.74]};
const thNames=['普吉・芭東灣','普吉・卡隆海灘','芭東・Sainamyen 路','芭東・Nanai 路','考拉・海灘','蘇梅島・水晶灣度假村','蘇梅島・水晶灣遊艇俱樂部','蘇梅島・拉邁海灘','蘇梅島・漁人村','蘇梅島・Banyan Tree','帕岸島・海灘','曼谷・素坤逸 11 巷','曼谷・素坤逸 19 巷'];
const thRegions={Phuket:'普吉','Khao Lak':'考拉','Koh Samui':'蘇梅島','Koh Phangan':'帕岸島',Bangkok:'曼谷'};
JSON.parse(fs.readFileSync('tmp/source-discovery/thailand-inventory.json','utf8')).forEach((row,i)=>{if(i===5||i===6)return;const id='th-'+i;add('thailand',id,thNames[i]||row.name,thPoints[row.region],thRegions[row.region],{videoId:row.videoId==='live_stream'?undefined:row.videoId,url:row.url,reference:'https://phuketdreamcompany.asia/phuket-live-webcams/',provider:row.provider+'（本輪未核實）'},'地區參考點（非鏡頭精確位置）');});
const legacyAliases={japan:['japan','kyoto'],korea:['korea','busan','gwangalli'],taiwan:['taiwan','臺灣'],thailand:['thailand','samui','koh samui']};
for(const p of places){p.tier=p.tier||'hot';// 沒有熱門／一般之分的國家，全部當熱門
 p.sourceCount=sources[p.id].length;p.embeddableCount=sources[p.id].filter(x=>x.videoId).length;p.aliases.push(p.region,p.name.replace(/[・\s]/g,''),...(legacyAliases[p.id]||[]));}
const counts=Object.fromEntries(Object.keys(countries).map(key=>[key,{places:places.filter(p=>p.countryKey===key).length,hot:places.filter(p=>p.countryKey===key&&p.tier==='hot').length,sources:places.filter(p=>p.countryKey===key).reduce((n,p)=>n+sources[p.id].length,0)}]));
const catalog={version:1,collectedAt:'2026-11-12',scope:'本輪公開目錄盤點，非全網完整覆蓋；所有來源均待播放驗證',countries,places,sources,counts};
fs.writeFileSync('preview/catalog.js','/* Public source metadata only; playback is not verified. */\n(function(root){const catalog='+JSON.stringify(catalog)+';root.SomewhereCatalog=catalog;if(typeof module!=="undefined"&&module.exports)module.exports=catalog;})(typeof window!=="undefined"?window:globalThis);\n');
fs.writeFileSync('preview/assets/source-inventory.json',JSON.stringify({collectedAt:catalog.collectedAt,scope:catalog.scope,counts,locations:places.map(p=>({id:p.id,country:p.country,name:p.name,region:p.region,point:p.point,coordinatePrecision:p.coordinatePrecision,sources:sources[p.id]}))},null,2));
console.log(JSON.stringify(counts));
