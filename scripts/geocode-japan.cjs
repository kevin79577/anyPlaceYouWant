// 日本 Excel 的座標不可靠：約 190 筆沒有座標、約 450 筆只到市町村中心（好幾個鏡頭疊在同一點），還有都道府縣和座標一起填錯的（原宿在栃木縣）。
// 這支腳本替每一筆從影片標題取出地名，用 OpenStreetMap Nominatim 在全日本查座標（前 5 筆中優先取落在 Excel 所填縣內的），
// 結果存到 scripts/data/japan-geocode.json；要不要採用由 import-livecams.cjs 決定。已查過的不會重查（結果檔就是快取）；import-livecams.cjs 只讀結果檔，不連網。
// Nominatim 使用規範：每秒最多 1 次、要有可識別的 User-Agent、結果要快取。
// 用法：node scripts/geocode-japan.cjs            查還沒查過的
//       node scripts/geocode-japan.cjs --dry      只印出每筆要查的地名，不連網
const fs=require('node:fs'),path=require('node:path');
const {readSheets}=require('./lib/xlsx.cjs');
const ROOT=path.join(__dirname,'..'),OUT=path.join(__dirname,'data/japan-geocode.json');
const ADMIN1=path.join(ROOT,'tmp/ne10/admin1-v5.1.2.geojson'),ADMIN1_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson';
const UA='anyplace-livecam-import/1.0 (one-off geocoding of public webcam place names)';
const dry=process.argv.includes('--dry');
const vid=u=>(String(u).match(/[?&]v=([\w-]{11})/)||[])[1];

// 標題 → 候選地名：NFKC 正規化，去掉直播用語、emoji、英文、組織名，在「から・を・より」等處斷開，去掉「側」「付近」字尾。
// 平假名超過 3 個的多半是句子（「満天の星をお届け」），不查；都道府縣、市町村本身太籠統，不查。3～10 字的詞先查，再查其他較長的。
const NOISE=/ライブカメラ|ライブ配信|ライブ映像|ライブ中継|ライブ|カメラ|配信中|生配信|テスト|配信|生中継|中継|定点観測|定点|映像|河川監視|監視|公式|チャンネル|高画質|高精細|リアルタイム|タクシーセンター|観光協会|臨時|絶景|ベータ版|お天気|天気|情報|様子|現在の|今日の|元祖|朝焼け|フェリー|ニュース|ストリーム|動画|ワイド|冬季休止中|フェリー|ニュース|ストリーム|動画|ワイド|冬季休止中|北向き|南向き|東向き|西向き/g;
const EMOJI=/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{25A0}-\u{25FF}️]/gu;
function candidates(title,pref,city){
  const s=String(title).normalize('NFKC').replace(EMOJI,' ')
    .replace(/\d+月\d+日|No\.?\s*\d+|\d+\s*(?:K|k|p|fps|ch|CH)\b|\d+\s*時間|24\/7/g,' ')
    .replace(/[【】〔〕[\]（）()「」『』〈〉《》｜|/・:：,、。!?~〜\-–—#@"“”'’+*]/g,' ')
    .replace(/[A-Za-z][A-Za-z.&']*/g,' ').replace(NOISE,' ').replace(/から|より|まで|を望む|を|へ/g,' ');
  const broad=new Set([pref,pref.replace(/[都道府県]$/,''),city,String(city).replace(/[市区町村郡]$/,''),'日本','東京','大阪','京都','北海道','沖縄','京都市','大阪市'].filter(Boolean));
  const hira=w=>(w.match(/[぀-ゟ]/g)||[]).length;
  const words=[...new Set(s.split(/\s+/)
    .map(w=>w.replace(/^[のをにでとへがはも]+|[のをにでとへがはも]+$/g,'').replace(/(?:前)?付近$|側$/,''))
    .filter(w=>w.length>=2&&/[゠-ヿ一-鿿]/.test(w)&&hira(w)<=3&&!broad.has(w)&&!/^\d+$/.test(w)))];
  const rank=w=>(w.length>=3&&w.length<=10?0:100)-w.length;
  return words.sort((a,b)=>rank(a)-rank(b)).slice(0,3);
}

(async()=>{
  if(!fs.existsSync(ADMIN1)){fs.mkdirSync(path.dirname(ADMIN1),{recursive:true});const r=await fetch(ADMIN1_URL);if(!r.ok)throw new Error('Natural Earth 下載失敗 '+r.status);fs.writeFileSync(ADMIN1,await r.text());}
  const prefs=new Map();
  for(const f of JSON.parse(fs.readFileSync(ADMIN1,'utf8')).features.filter(f=>f.properties.adm0_a3==='JPN')){let b=[180,90,-180,-90];const w=c=>{if(typeof c[0]==='number'){b=[Math.min(b[0],c[0]),Math.min(b[1],c[1]),Math.max(b[2],c[0]),Math.max(b[3],c[1])];}else c.forEach(w);};w(f.geometry.coordinates);prefs.set(f.properties.name_ja,b);}

  const rows=readSheets(path.join(ROOT,'refs/日本_livecams.xlsx'))['全部'].map(r=>({videoId:vid(r['網址']),title:r['名稱（日文原文）'],pref:r['都道府縣'],city:r['市町村'],lat:+r['緯度']||null,lng:+r['經度']||null}));
  const spot=r=>r.lat&&r.lng?r.lat+','+r.lng:'';const count=new Map();for(const r of rows)if(spot(r))count.set(spot(r),(count.get(spot(r))||0)+1);
  // 全部都查：Excel 的都道府縣和座標常一起填錯（原宿在栃木縣、松島在長野縣），座標沒重複也不代表是對的；import-livecams.cjs 決定採用哪個
  const need=rows.map(r=>({...r,reason:!spot(r)?'missing':count.get(spot(r))>1?'stacked':'check',queries:candidates(r.title,r.pref,r.city)}));
  const done=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{};
  const todo=need.filter(r=>!done[r.videoId]);
  console.log(`需要查座標 ${need.length} 筆（沒座標 ${need.filter(r=>r.reason==='missing').length}、疊在同一點 ${need.filter(r=>r.reason==='stacked').length}），已查過 ${need.length-todo.length}，這次查 ${todo.length}`);
  if(dry){for(const r of todo)console.log(`  ${r.pref} | ${r.title.slice(0,40)} → ${r.queries.join(' / ')||'（沒有可查的地名）'}`);return;}

  let last=0,n=0;
  const save=()=>{fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(Object.fromEntries(Object.entries(done).sort()),null,1)+'\n');};
  for(const r of todo){
    const box=prefs.get(r.pref);let hit=null;
    // 全日本查前 5 筆：有落在 Excel 所填都道府縣範圍內的就用它（同名地點時較可能對），否則用第一筆（Excel 的縣填錯時）
    const inBox=x=>box&&+x.lon>=box[0]&&+x.lon<=box[2]&&+x.lat>=box[1]&&+x.lat<=box[3];
    for(const q of r.queries){
      const wait=1100-(Date.now()-last);if(wait>0)await new Promise(ok=>setTimeout(ok,wait));last=Date.now();
      const url='https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q,format:'jsonv2',limit:'5',countrycodes:'jp','accept-language':'ja'});
      try{const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(20000)});
        if(res.status===429||res.status>=500){console.warn('Nominatim',res.status,'，先停下，重跑會從這裡接續');save();return;}
        const j=await res.json(),best=j.find(inBox)||j[0];
        if(best){hit={query:q,inPref:!!inBox(best),lat:+(+best.lat).toFixed(5),lng:+(+best.lon).toFixed(5),match:best.display_name.slice(0,120)};break;}}
      catch(e){console.warn('查詢失敗',q,e.message);}
    }
    done[r.videoId]={reason:r.reason,title:r.title.slice(0,80),pref:r.pref,tried:r.queries,...(hit||{miss:true})};
    if(++n%25===0){save();console.log(`  ${n}/${todo.length}`);}
  }
  save();const v=Object.values(done);
  console.log(`完成：找到 ${v.filter(x=>!x.miss).length}、找不到 ${v.filter(x=>x.miss).length}（結果：scripts/data/japan-geocode.json）`);
})().catch(e=>{console.error(e);process.exit(1);});
