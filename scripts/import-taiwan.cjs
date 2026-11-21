// 把 refs/台灣_livecams.xlsx 轉成 scripts/taiwan-livecams.json（build-catalog.cjs 讀這個檔）。
//   - 「熱門景點」工作表的影片標為 tier:'hot'，其餘（只在「全部」）標為 tier:'general'
//   - oEmbed 檢查：影片不存在或禁止嵌入就排除；設定 PLAYWRIGHT_MODULE 時再實際播放一次（需先 node preview/serve.cjs）
//   - 縣市：座標比對 taiwan-atlas 縣市界線（下載到 tmp/，只下載一次）；落在海上的點取最近的縣市
//   - 提供者：oEmbed 回報的頻道名稱
//   - 座標完全相同的列合併成一個地點、多個來源
// 用法：node scripts/import-taiwan.cjs
//       PLAYWRIGHT_MODULE=<playwright-core 路徑> [CHROME_PATH=...] node scripts/import-taiwan.cjs
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const ROOT=path.join(__dirname,'..');
const XLSX=path.join(ROOT,'refs/台灣_livecams.xlsx'),OUT=path.join(__dirname,'taiwan-livecams.json');
const ATLAS_URL='https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/counties-10t.json',ATLAS=path.join(ROOT,'tmp/tw-county/counties-2021.9.20.json');
const ENTRY_VIDEO='SqMD1zqQm-E';// 新北 淡水渡船頭：國家入口（id 'taiwan'）
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';

// ── xlsx：zip 中央目錄 → 檔案內容；只處理本檔用到的 stored / deflate ──
function unzip(buf){
  let eocd=buf.length-22;while(eocd>=0&&buf.readUInt32LE(eocd)!==0x06054b50)eocd--;
  const files={};let p=buf.readUInt32LE(eocd+16);
  for(let n=buf.readUInt16LE(eocd+10);n--;){
    const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
    const name=buf.toString('utf8',p+46,p+46+nameLen);
    const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
    files[name]=method===8?zlib.inflateRawSync(data):data;p+=46+nameLen+extra+comment;
  }
  return files;
}
const xmlText=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
function readSheets(file){
  const z=unzip(fs.readFileSync(file)),str=k=>z[k]&&z[k].toString('utf8');
  const shared=[...(str('xl/sharedStrings.xml')||'').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
  const rels=Object.fromEntries([...str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map(m=>[m[0].match(/Id="([^"]+)"/)[1],m[0].match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/,'xl/')]));
  const sheets={};
  for(const m of str('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)){
    const name=xmlText(m[0].match(/name="([^"]+)"/)[1]),xml=str(rels[m[0].match(/r:id="([^"]+)"/)[1]]),rows=[];
    for(const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
      const row={};
      for(const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const v=(c[3]||'').match(/<v>([\s\S]*?)<\/v>/),t=(c[2].match(/t="([^"]+)"/)||[])[1];
        row[c[1]]=t==='s'&&v?shared[+v[1]]:t==='inlineStr'?xmlText(c[3]||''):v?xmlText(v[1]):'';
      }
      rows.push(row);
    }
    const head=rows.shift()||{};
    sheets[name]=rows.map(r=>Object.fromEntries(Object.entries(head).map(([col,h])=>[h,r[col]??''])));
  }
  return sheets;
}

// ── 縣市：TopoJSON 解碼 + 射線法 ──
async function counties(){
  if(!fs.existsSync(ATLAS)){fs.mkdirSync(path.dirname(ATLAS),{recursive:true});const res=await fetch(ATLAS_URL);if(!res.ok)throw new Error('縣市界線下載失敗 '+res.status);fs.writeFileSync(ATLAS,await res.text());}
  const topo=JSON.parse(fs.readFileSync(ATLAS,'utf8')),[sx,sy]=topo.transform.scale,[tx,ty]=topo.transform.translate;
  const arcs=topo.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>[(x+=dx)*sx+tx,(y+=dy)*sy+ty]);});
  const arc=i=>i<0?arcs[~i].slice().reverse():arcs[i];
  const ring=ids=>ids.flatMap((i,k)=>{const a=arc(i);return k?a.slice(1):a;});
  return topo.objects.counties.geometries.map(g=>({name:g.properties.COUNTYNAME,polys:(g.type==='Polygon'?[g.arcs]:g.arcs).map(p=>p.map(ring))}));
}
function inRing(pt,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
function countyOf(list,pt){
  const hit=list.find(c=>c.polys.some(p=>inRing(pt,p[0])&&!p.slice(1).some(h=>inRing(pt,h))));
  if(hit)return {name:hit.name,inside:true};
  let best=null,dist=Infinity;// 港口、外海的點：取最近的縣市邊界頂點
  for(const c of list)for(const p of c.polys)for(const [x,y] of p[0]){const d=Math.hypot((x-pt[0])*Math.cos(pt[1]*Math.PI/180),y-pt[1]);if(d<dist){dist=d;best=c.name;}}
  return {name:best,inside:false,km:Math.round(dist*111)};
}

// ── 影片檢查 ──
async function pool(items,size,fn){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const item=items[i++];await fn(item);}}));}
async function oembed(v){
  for(let attempt=0;attempt<3;attempt++){
    try{const res=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+v.videoId),{signal:AbortSignal.timeout(15000)});
      if(res.ok){const j=await res.json();v.provider=j.author_name;v.channel=j.author_url;v.ytTitle=j.title;return v.oembed='ok';}
      if(res.status===401||res.status===403)return v.oembed='embed-disabled';
      if(res.status===404||res.status===400)return v.oembed='missing';
      v.oembed='http-'+res.status;
    }catch{v.oembed='network-error';}
  }
}
async function playback(list){
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try{await pool(list,3,async v=>{const page=await browser.newPage();
    try{await page.goto(origin+'/privacy.html');
      v.play=await page.evaluate(id=>new Promise(done=>{const finish=x=>{clearTimeout(timer);done(x);};const timer=setTimeout(()=>finish('timeout'),25000);
        const boot=()=>{const host=document.createElement('div');document.body.append(host);new YT.Player(host,{host:'https://www.youtube-nocookie.com',videoId:id,playerVars:{autoplay:1,mute:1,playsinline:1},events:{onError:e=>finish('error-'+e.data),onStateChange:e=>{if(e.data===1)finish('playing');}}});};
        if(window.YT&&YT.Player)boot();else{window.onYouTubeIframeAPIReady=boot;const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.append(s);}}),v.videoId);
    }catch(e){v.play='check-failed';}
    await page.close();});
  }finally{await browser.close();}
}

(async()=>{
  const sheets=readSheets(XLSX),all=sheets['全部'],hot=sheets['熱門景點'];
  if(!all||!hot)throw new Error('找不到「全部」或「熱門景點」工作表：'+Object.keys(sheets));
  const vid=u=>(String(u).match(/[?&]v=([\w-]{11})/)||[])[1];
  const hotIds=new Set(hot.map(r=>vid(r['網址'])));
  const rows=all.map(r=>({videoId:vid(r['網址']),name:String(r['名稱（原文）']).trim(),category:r['類別']||'',lat:+(+r['緯度']).toFixed(5),lng:+(+r['經度']).toFixed(5),estimated:/位置為推估/.test(r['備註']),tier:hotIds.has(vid(r['網址']))?'hot':'general'}));
  const bad=rows.filter(r=>!r.videoId||!Number.isFinite(r.lat)||!Number.isFinite(r.lng));if(bad.length)throw new Error('資料不完整：'+bad.map(r=>r.name).join('、'));
  const missingHot=[...hotIds].filter(id=>!rows.some(r=>r.videoId===id));if(missingHot.length)throw new Error('熱門景點不在「全部」裡：'+missingHot);

  console.log(`讀到 ${rows.length} 筆（熱門 ${hotIds.size}），oEmbed 檢查中…`);
  await pool(rows,6,oembed);
  if(process.env.PLAYWRIGHT_MODULE){const ok=rows.filter(r=>r.oembed==='ok');console.log(`實際播放檢查 ${ok.length} 支…`);await playback(ok);}
  const reason=r=>r.oembed!=='ok'?({'embed-disabled':'擁有者禁止嵌入',missing:'影片不存在或已下架'}[r.oembed]||'oEmbed 檢查失敗（'+r.oembed+'）'):r.play&&r.play!=='playing'?'實際播放失敗（'+r.play+'）':'';
  const kept=rows.filter(r=>!reason(r)),excluded=rows.filter(r=>reason(r)).map(r=>({videoId:r.videoId,name:r.name,tier:r.tier,reason:reason(r)}));
  if(kept.some(r=>/^network-error|^http-/.test(r.oembed)))console.warn('⚠️ 有影片因網路問題未檢查成功，請重跑');

  const list=await counties();
  for(const r of kept){const c=countyOf(list,[r.lng,r.lat]);r.region=c.name;if(!c.inside)r.offshore=c.km;}

  // 座標完全相同 → 同一地點；熱門來源排前面，地點名稱取第一個來源
  const groups=new Map();for(const r of kept){const k=r.lat+','+r.lng;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  const places=[...groups.values()].map(g=>{g.sort((a,b)=>(a.tier==='hot'?0:1)-(b.tier==='hot'?0:1));const f=g[0];
    return {id:g.some(r=>r.videoId===ENTRY_VIDEO)?'taiwan':'tw-yt-'+f.videoId,name:f.name,region:f.region,lat:f.lat,lng:f.lng,tier:g.some(r=>r.tier==='hot')?'hot':'general',category:f.category,
      coordinatePrecision:g.some(r=>r.estimated)?'推估位置（非鏡頭精確座標）':'鏡頭約略座標',
      sources:g.map(r=>({videoId:r.videoId,title:r.name,provider:r.provider,channel:r.channel}))};});
  if(!places.some(p=>p.id==='taiwan')){// 淡水渡船頭失效：改用台北市第一個熱門景點
    const alt=places.find(p=>p.tier==='hot'&&p.region==='台北市')||places.find(p=>p.tier==='hot');alt.id='taiwan';console.warn('⚠️ 淡水渡船頭未通過檢查，國家入口改為',alt.name);}
  places.sort((a,b)=>(b.id==='taiwan')-(a.id==='taiwan')||(a.tier==='hot'?0:1)-(b.tier==='hot'?0:1));

  const today=new Date().toISOString().slice(0,10);
  fs.writeFileSync(OUT,JSON.stringify({source:'refs/台灣_livecams.xlsx',checkedAt:today,playbackChecked:!!process.env.PLAYWRIGHT_MODULE,places,excluded},null,1)+'\n');
  const n=t=>places.filter(p=>p.tier===t).length;
  console.log(`完成：${places.length} 個地點（熱門 ${n('hot')}、一般 ${n('general')}），${kept.length} 支影片；排除 ${excluded.length} 支`);
  for(const e of excluded)console.log(`  排除 [${e.tier==='hot'?'熱門':'一般'}] ${e.name}（${e.videoId}）：${e.reason}`);
  const off=kept.filter(r=>r.offshore!==undefined);if(off.length)console.log('落在縣市界線外、取最近縣市：'+off.map(r=>`${r.name}→${r.region}（${r.offshore} km）`).join('、'));
})().catch(e=>{console.error(e);process.exit(1);});
