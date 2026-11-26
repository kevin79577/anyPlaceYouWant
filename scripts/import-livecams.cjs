// 把 refs/<國家>_livecams.xlsx 轉成 scripts/data/livecams-<country>.json（build-catalog.cjs 讀這些檔）。
//   - 「熱門景點」工作表的影片為 tier:'hot'，只在「全部」的為 tier:'general'；「待確認」只收其中的 YouTube 影片（general），「目前不能看」不收
//   - 影片檢查：oEmbed（不存在、禁止嵌入就排除）；設定 PLAYWRIGHT_MODULE 時再實際播放（需先 node preview/serve.cjs）。
//     結果快取在 tmp/video-checks.json，7 天內不重查
//   - 行政區：用座標比對界線（台灣：內政部縣市；日韓：Natural Earth 1:10m），落在海上的取最近的行政區；不採用 Excel 的行政區欄
//   - 提供者：oEmbed 回報的頻道名稱
//   - 座標完全相同的列合併成一個地點、多個來源（日本例外：只有市町村中心座標的疊點各自保留，見 scripts/geocode-japan.cjs）
// 用法：node scripts/import-livecams.cjs <taiwan|korea|japan>
//       PLAYWRIGHT_MODULE=<playwright-core 路徑> [CHROME_PATH=...] node scripts/import-livecams.cjs japan
const fs=require('node:fs'),path=require('node:path');
const {readSheets}=require('./lib/xlsx.cjs');
const ROOT=path.join(__dirname,'..'),DATA=path.join(__dirname,'data');
const D=require(path.join(ROOT,'preview/vendor/d3.min.js'));
const CHECKS=path.join(ROOT,'tmp/video-checks.json'),CHECK_DAYS=7;
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';

const COUNTRIES={
  taiwan:{xlsx:'refs/台灣_livecams.xlsx',name:'名稱（原文）',regions:'atlas',entry:{video:'SqMD1zqQm-E'},foreign:/日本|Japan|韓國|韓国|Korea/i,
    extra:'refs/任意門_前端/taiwan/assets/cams.json'},// 組員前端的 324 支清單（含座標 ll）；只補 Excel 沒有的影片，同樣經過檢查
  korea:{xlsx:'refs/韓國_livecams.xlsx',name:'名稱（韓文原文）',regions:'KOR',entry:{name:'釜山 廣安里'},foreign:/台灣|臺灣|台湾|Taiwan|日本|Japan/i},
  japan:{xlsx:'refs/日本_livecams.xlsx',name:'名稱（日文原文）',regions:'JPN',entry:{video:'J3xHBUgWRqc'},foreign:/台湾|台灣|臺灣|Taiwan|韓国|韓國|Korea|ソウル|Seoul|釜山/i,
    geocode:'japan-geocode.json',cleanName:true,keepStacked:true}};
const key=process.argv[2],C=COUNTRIES[key];
if(!C){console.error('用法：node scripts/import-livecams.cjs <'+Object.keys(COUNTRIES).join('|')+'>');process.exit(1);}

// ── 行政區界線（point-in-polygon 用原始精度，不用簡化後的網站資料）──
function regionList(){
  if(C.regions==='atlas'){const t=JSON.parse(fs.readFileSync(path.join(ROOT,'tmp/tw-county/counties-2021.9.20.json'),'utf8')),[sx,sy]=t.transform.scale,[tx,ty]=t.transform.translate;
    const arcs=t.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>[(x+=dx)*sx+tx,(y+=dy)*sy+ty]);}),arc=i=>i<0?arcs[~i].slice().reverse():arcs[i],ring=ids=>ids.flatMap((i,k)=>{const a=arc(i);return k?a.slice(1):a;});
    return t.objects.counties.geometries.map(g=>({name:g.properties.COUNTYNAME,polys:(g.type==='Polygon'?[g.arcs]:g.arcs).map(p=>p.map(ring))}));}
  const ne=JSON.parse(fs.readFileSync(path.join(ROOT,'tmp/ne10/admin1-v5.1.2.geojson'),'utf8'));
  return ne.features.filter(f=>f.properties.adm0_a3===C.regions).map(f=>({name:f.properties.name_zht||f.properties.name,polys:f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates}));
}
function inRing(pt,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
function regionOf(list,pt){
  const hit=list.find(c=>c.polys.some(p=>inRing(pt,p[0])&&!p.slice(1).some(h=>inRing(pt,h))));if(hit)return {name:hit.name,km:0};
  let best=null,dist=Infinity;for(const c of list)for(const p of c.polys)for(const q of p[0]){const d=D.geoDistance(pt,q);if(d<dist){dist=d;best=c.name;}}
  return {name:best,km:Math.round(dist*6371)};
}

// ── 日本：YouTube 標題 → 可讀的名稱（熱門另有中文名覆蓋，scripts/data/names-zh-japan.json）──
const EMOJI=/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}️]/gu;
function cleanTitle(t){
  let s=String(t).normalize('NFKC').replace(EMOJI,' ').replace(/^\s*\d+月\d+日\s*(?:\([^)]*\))?/,' ');
  s=s.replace(/[【〔\[(（「『]([^】〕\])）」』]*)[】〕\])）」』]/g,(m,inner)=>/^(?:\s*(?:live|LIVE|Live|ライブ|生中継|生配信|配信中|ライブ配信|4K|HD|24\/7|公式|テスト配信|LIVE 24\/7|Live Now|LIVE CAMERA|LIVECAMERA|ライブカメラ|.*公式.*)\s*)*$/i.test(inner)?' ':' '+inner+' ');
  const parts=s.split(/[｜|／/]|\s[-–—]\s/).map(x=>x.trim()).filter(Boolean),ja=x=>(x.match(/[぀-ヿ一-鿿]/g)||[]).length;
  if(parts.length)s=parts.sort((a,b)=>ja(b)-ja(a))[0];
  s=s.replace(/ライブ中継カメラ|ライブカメラ|ライブ配信|ライブ映像|ライブ|生中継|生配信|配信中|LIVE\s*CAMERA|Live\s*Camera|Live\s*Cam|LIVE|Live|live/g,' ');
  if(ja(s)>=2)s=s.replace(/\b[A-Za-z][A-Za-z.'&-]*(?:\s+[A-Za-z][A-Za-z.'&-]*)*\b/g,w=>w.length<=4?w:' ');// 有日文時去掉長的英文重複說明
  s=s.replace(/[【】〔〕\[\]（）()「」『』◤◢~〜!！#＃*]+/g,' ').replace(/\s+/g,' ').trim().replace(/^[・:：,、\-–—\s]+|[・:：,、\-–—\s]+$/g,'');
  return (s.length>28?s.slice(0,27)+'…':s)||String(t).slice(0,28);
}

// ── 影片檢查（快取）──
async function pool(items,size,fn){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const it=items[i++];await fn(it);}}));}
async function oembed(v){
  for(let n=0;n<3;n++){try{const res=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+v.videoId),{signal:AbortSignal.timeout(15000)});
    if(res.ok){const j=await res.json();return {oembed:'ok',provider:j.author_name,channel:j.author_url,ytTitle:j.title};}
    if(res.status===401||res.status===403)return {oembed:'embed-disabled'};if(res.status===404||res.status===400)return {oembed:'missing'};}catch{}}
  return {oembed:'network-error'};
}
async function playback(list){
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});let n=0;
  try{await pool(list,4,async v=>{const page=await browser.newPage();
    try{await page.goto(origin+'/privacy.html');
      v.play=await page.evaluate(id=>new Promise(done=>{const finish=x=>{clearTimeout(timer);done(x);};const timer=setTimeout(()=>finish('timeout'),25000);
        const boot=()=>{const host=document.createElement('div');document.body.append(host);new YT.Player(host,{host:'https://www.youtube-nocookie.com',videoId:id,playerVars:{autoplay:1,mute:1,playsinline:1},events:{onError:e=>finish('error-'+e.data),onStateChange:e=>{if(e.data===1)finish('playing');}}});};
        if(window.YT&&YT.Player)boot();else{window.onYouTubeIframeAPIReady=boot;const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.append(s);}}),v.videoId);
    }catch{v.play='check-failed';}
    await page.close();if(++n%50===0)console.log(`  播放檢查 ${n}/${list.length}`);});}
  finally{await browser.close();}
}

(async()=>{
  const vid=u=>(String(u).match(/[?&]v=([\w-]{11})/)||[])[1];
  const sheets=readSheets(path.join(ROOT,C.xlsx)),hot=sheets['熱門景點'];
  if(!sheets['全部']||!hot)throw new Error('找不到「全部」或「熱門景點」工作表：'+Object.keys(sheets));
  // 「待確認」大多是彙整網站（沒有影片），但其中的 YouTube 網址是可以檢查的影片，一併收（日本：二世古 Grand Hirafu 3 支）
  const all=[...sheets['全部'],...(sheets['待確認']||[]).filter(r=>vid(r['網址']))];
  const hotIds=new Set(hot.map(r=>vid(r['網址'])));
  const geo=C.geocode&&fs.existsSync(path.join(DATA,C.geocode))?JSON.parse(fs.readFileSync(path.join(DATA,C.geocode),'utf8')):{};
  const namesZh=fs.existsSync(path.join(DATA,`names-zh-${key}.json`))?JSON.parse(fs.readFileSync(path.join(DATA,`names-zh-${key}.json`),'utf8')):{};
  const excluded=[];const drop=(r,reason)=>excluded.push({videoId:r.videoId,name:r.rawName.slice(0,60),tier:r.tier,reason});

  let rows=all.map(r=>({videoId:vid(r['網址']),rawName:String(r[C.name]).trim(),category:r['類別']||'',lat:+r['緯度']||null,lng:+r['經度']||null,estimated:/位置為推估/.test(r['備註']),tier:hotIds.has(vid(r['網址']))?'hot':'general'}));
  if(C.extra){const have=new Set(rows.map(r=>r.videoId));
    for(const c of JSON.parse(fs.readFileSync(path.join(ROOT,C.extra),'utf8'))){const v=vid(c.url);if(!v||have.has(v))continue;have.add(v);
      const r={videoId:v,rawName:String(c.name).trim(),category:c.cat||'',lat:c.ll?+c.ll[1]:null,lng:c.ll?+c.ll[0]:null,estimated:false,tier:c.hot?'hot':'general'};
      if(r.lat&&r.lng)rows.push(r);else drop(r,'補充清單沒有座標');}}
  rows=rows.filter(r=>r.videoId||(drop(r,'沒有 YouTube 影片網址'),false));
  rows=rows.filter(r=>!C.foreign.test(r.rawName)||(drop(r,'不是這個國家的鏡頭'),false));

  // 座標（只有設定了 geocode 的國家，即日本）：依影片標題查到的位置（geocode-japan.cjs）
  //   Excel 沒有座標 → 用查到的；查不到就排除
  //   好幾支疊在同一點（只到市町村中心）→ 用查到的；查不到就保留，標成「市町村中心」
  //   座標唯一但和查到的位置差 80 km 以上 → Excel 的都道府縣和座標一起填錯了（原宿在栃木縣），用查到的
  //   差距較小時保留 Excel 座標：通常比依名稱查到的更接近鏡頭（例如拍富士山的飯店，查到的會是山頂）
  //   查到的位置要可信才用：對到的地名本身包含查詢詞（或反過來）、查詢詞至少 3 字且不是通用詞；人工檢查後仍錯的列在 japan-geocode-reject.json
  const GENERIC=new Set(['ターミナル','交通','山頂','入口','道の駅','店内','流星群','天の川','西の空','駐車場','田んぼ','緊急','窓際','東京方面','西武線','日曜日','右海面','10月','地震','陸海空','秋本番','解像度','癒しの空間','中央道','首都高','東北新幹線','東名高速道路','中央自動車道','日本三景','広告無','キャン','山陽電鉄','河川水位','富山市内','大分市水害','星空','富士山','温泉','海岸','空港']);
  const reject=new Set(C.geocode&&fs.existsSync(path.join(DATA,'japan-geocode-reject.json'))?Object.keys(JSON.parse(fs.readFileSync(path.join(DATA,'japan-geocode-reject.json'),'utf8'))):[]);
  const trusted=(id,g)=>{if(!g||g.miss||reject.has(id))return false;const q=g.query,first=g.match.split(',')[0].trim();return q.length>=3&&!GENERIC.has(q)&&(first.includes(q)||q.includes(first));};
  const spot=r=>r.lat&&r.lng?r.lat+','+r.lng:'',count=new Map();for(const r of rows)if(spot(r))count.set(spot(r),(count.get(spot(r))||0)+1);
  if(C.geocode)for(const r of rows){const g=geo[r.videoId],found=trusted(r.videoId,g),use=()=>Object.assign(r,{lat:g.lat,lng:g.lng,located:'name'});
    if(!spot(r)){if(found)use();else r.gone=true;}
    else if(count.get(spot(r))>1){if(found)use();else r.located='city';}
    else if(found&&D.geoDistance([r.lng,r.lat],[g.lng,g.lat])*6371>80){r.moved=Math.round(D.geoDistance([r.lng,r.lat],[g.lng,g.lat])*6371);use();}}
  // 人工校正（日本熱門的知名地標，見 japan-coords-manual.json）最優先：Excel 錯誤、名稱也查不到可信位置的
  const manual=C.geocode&&fs.existsSync(path.join(DATA,'japan-coords-manual.json'))?JSON.parse(fs.readFileSync(path.join(DATA,'japan-coords-manual.json'),'utf8')):{};
  for(const r of rows){const m=manual[r.videoId];if(Array.isArray(m)){Object.assign(r,{lat:m[0],lng:m[1],located:'manual'});delete r.gone;r.moved=0;}}
  rows=rows.filter(r=>!r.gone||(drop(r,'沒有座標，依名稱也查不到地點'),false));// 人工校正之後才排除，救回的不會留在排除清單

  // 影片檢查（快取）
  const cache=fs.existsSync(CHECKS)?JSON.parse(fs.readFileSync(CHECKS,'utf8')):{},fresh=c=>c&&Date.now()-c.at<CHECK_DAYS*864e5&&c.oembed!=='network-error';
  const stale=rows.filter(r=>!fresh(cache[r.videoId]));
  console.log(`${key}：${rows.length} 支影片待用（熱門 ${rows.filter(r=>r.tier==='hot').length}），oEmbed 檢查 ${stale.length} 支（其餘用快取）…`);
  await pool(stale,6,async r=>{cache[r.videoId]={...await oembed(r),at:Date.now()};});
  if(process.env.PLAYWRIGHT_MODULE){const need=rows.filter(r=>cache[r.videoId].oembed==='ok'&&!cache[r.videoId].play);console.log(`實際播放檢查 ${need.length} 支…`);await playback(need);for(const r of need)cache[r.videoId].play=r.play;}
  fs.mkdirSync(path.dirname(CHECKS),{recursive:true});fs.writeFileSync(CHECKS,JSON.stringify(cache));
  const reason=c=>c.oembed!=='ok'?({'embed-disabled':'擁有者禁止嵌入',missing:'影片不存在或已下架'}[c.oembed]||'oEmbed 檢查失敗（'+c.oembed+'）'):c.play&&c.play!=='playing'?'實際播放失敗（'+c.play+'）':'';
  rows=rows.filter(r=>{const why=reason(cache[r.videoId]);if(why)drop(r,why);return !why;});
  for(const r of rows)Object.assign(r,{provider:cache[r.videoId].provider,channel:cache[r.videoId].channel});

  const list=regionList();
  for(const r of rows){const g=regionOf(list,[r.lng,r.lat]);r.region=g.name;if(g.km)r.offshore=g.km;}
  for(const r of rows)r.name=namesZh[r.videoId]||(C.cleanName?cleanTitle(r.rawName):r.rawName);

  // 地點：座標相同的合併（日本只有市町村中心座標的疊點不合併：它們是不同的鏡頭，只是位置不精確）
  const groups=new Map();for(const r of rows){const k=C.keepStacked&&r.located==='city'?'v:'+r.videoId:r.lat+','+r.lng;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  const entryId=C.entry.video||(rows.find(r=>r.tier==='hot'&&r.rawName===C.entry.name)||{}).videoId;
  const precision=g=>g.some(r=>r.located==='manual')?'人工校正的地標位置（非鏡頭位置）':g.some(r=>r.located==='city')?'市町村中心（非鏡頭位置）':g.some(r=>r.located==='name')?'依名稱查詢的約略位置':g.some(r=>r.estimated)?'推估位置（非鏡頭精確座標）':'鏡頭約略座標';
  const prefix={taiwan:'tw',korea:'kr',japan:'jp'}[key];
  const places=[...groups.values()].map(g=>{g.sort((a,b)=>(a.tier==='hot'?0:1)-(b.tier==='hot'?0:1));const f=g[0];
    return {id:g.some(r=>r.videoId===entryId)?key:prefix+'-yt-'+f.videoId,name:f.name,region:f.region,lat:+f.lat.toFixed(5),lng:+f.lng.toFixed(5),tier:g.some(r=>r.tier==='hot')?'hot':'general',category:f.category,
      coordinatePrecision:precision(g),sources:g.map(r=>({videoId:r.videoId,title:r.name,provider:r.provider,channel:r.channel}))};});
  if(!places.some(p=>p.id===key)){const alt=places.find(p=>p.tier==='hot');alt.id=key;console.warn('⚠️ 指定的國家入口沒有通過檢查，改用',alt.name);}
  places.sort((a,b)=>(b.id===key)-(a.id===key)||(a.tier==='hot'?0:1)-(b.tier==='hot'?0:1));

  const out=path.join(DATA,`livecams-${key}.json`);
  fs.writeFileSync(out,JSON.stringify({source:C.xlsx,checkedAt:new Date().toISOString().slice(0,10),playbackChecked:rows.every(r=>cache[r.videoId].play==='playing'),places,excluded},null,1)+'\n');
  const n=t=>places.filter(p=>p.tier===t).length,byReason={};for(const e of excluded)byReason[e.reason]=(byReason[e.reason]||0)+1;
  console.log(`完成：${places.length} 個地點（熱門 ${n('hot')}、一般 ${n('general')}），${rows.length} 支影片；排除 ${excluded.length} 支 ${JSON.stringify(byReason)}`);
  console.log(`位置：${JSON.stringify(places.reduce((m,p)=>(m[p.coordinatePrecision]=(m[p.coordinatePrecision]||0)+1,m),{}))}`);
  const moved=rows.filter(r=>r.moved);if(moved.length)console.log(`Excel 座標差 80 km 以上、改用依名稱查到的位置：${moved.length} 支，例如 ${moved.slice(0,5).map(r=>r.name+'（'+r.moved+' km）').join('、')}`);
  const off=rows.filter(r=>r.offshore);if(off.length)console.log(`落在行政區界線外、取最近的：${off.length} 支，最遠 ${Math.max(...off.map(r=>r.offshore))} km`);
  console.log(`輸出 ${path.relative(ROOT,out)}`);
})().catch(e=>{console.error(e);process.exit(1);});
