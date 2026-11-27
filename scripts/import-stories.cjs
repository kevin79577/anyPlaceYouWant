// 把 refs/任意門_景點故事_第一批.xlsx（組員整理的夜之門景點故事）轉成 preview/stories.js，照片下載到 preview/assets/stories/。
// 照片自己存一份：網站 CSP 不允許外連圖片，也不讓訪客的 IP 傳給 Wikimedia。作者與授權向 Commons API 查，網站上逐張標示。
// 用法：node scripts/import-stories.cjs        （需要網路與 ImageMagick 的 magick 指令）
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {readSheets}=require('./lib/xlsx.cjs');
const ROOT=path.join(__dirname,'..'),XLSX='refs/任意門_景點故事_第一批.xlsx',IMG=path.join(ROOT,'preview/assets/stories');
const KEY={東京:'tokyo',大阪:'osaka',首爾:'seoul',釜山:'busan',墾丁:'kenting'};// 對應 mystic.js 的夜之門地點
const UA='anyPlaceYouWant-story-import/1.0 (static site build script)';// Wikimedia 要求自訂 User-Agent
const dec=s=>String(s??'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
const strip=h=>dec(String(h??'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
// Commons 會擋太密集的請求：每次間隔 1.5 秒，被擋就等久一點再試
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(u,as){for(let i=0;i<5;i++){await sleep(1500*(i+1)**2);const res=await fetch(u,{headers:{'User-Agent':UA}});if(res.ok&&!/text\/html|text\/plain/.test(res.headers.get('content-type')||''))return as==='json'?res.json():Buffer.from(await res.arrayBuffer());console.warn(`  Commons 回應 ${res.status}，重試…`)}throw new Error('Commons 一直拒絕：'+u)}
const once=s=>{const h=s.length/2;return s.length%2===0&&s.slice(0,h)===s.slice(h)?s.slice(0,h):s};// 「Unknown authorUnknown author」
const https=u=>/^https:\/\//.test(u)?u:null;

(async()=>{
  const rows=readSheets(path.join(ROOT,XLSX))['故事總表'].map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[dec(k),dec(v)])));
  fs.mkdirSync(IMG,{recursive:true});
  const out={};
  for(const r of rows){
    const key=KEY[r['景點']];if(!key)throw new Error(`不認得的景點：${r['景點']}（${r['編號']}）`);
    if(r['審稿狀態']!=='已完成'){console.warn(`跳過未完成：${r['編號']}`);continue}
    const id=r['編號'].toLowerCase(),file=r['選定圖片頁（Commons）'].replace(/^File:/,'');
    // 作者與授權
    const api=`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url|user&iiurlwidth=1000&titles=${encodeURIComponent('File:'+file)}`;
    const page=Object.values((await get(api,'json')).query.pages)[0],info=page.imageinfo?.[0];
    if(!info)throw new Error(`Commons 找不到圖片：${file}（${r['編號']}）`);
    const m=info.extmetadata||{},photo={author:once(strip(m.Artist?.value)||strip(m.Attribution?.value)||strip(m.Credit?.value)||(info.user?'上傳者 '+info.user:'佚名')),license:strip(m.LicenseShortName?.value)||'見圖片頁',page:`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g,'_'))}`};
    // 下載縮圖 → 寬 800 的 webp
    const dest=path.join(IMG,id+'.webp');
    if(!fs.existsSync(dest)){const buf=await get(info.thumburl);
      const tmp=dest+'.src';fs.writeFileSync(tmp,buf);execFileSync('magick',[tmp,'-resize','800x>','-quality','78',dest]);fs.rmSync(tmp)}
    const note=r['圖片備註']&&r['圖片備註']!=='—'?r['圖片備註'].split('｜')[0]:'';
    (out[key]||=[]).push({id,title:r['故事標題'],tags:r['分類標籤'].split(/[、,，]/).map(s=>s.trim()).filter(Boolean),lead:r['開場（卡片用）'],body:r['故事內文'].split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),
      tip:r['前端小提醒'],sources:[1,2,3,4].map(i=>https(r['故事來源 '+i])).concat(https(r['維基百科／延伸閱讀'])).filter(Boolean),
      img:`assets/stories/${id}.webp`,photo,...(/替代|先用/.test(note)?{stand_in:true}:{})});// 備註是內部用語，訪客只看到「示意照片」
    console.log(`${r['編號']} ${r['故事標題'].slice(0,20)}… 圖：${photo.author.slice(0,30)}／${photo.license}`);
  }
  const n=Object.values(out).flat().length;
  if(Object.keys(out).length!==5||n!==rows.length)throw new Error(`預期 5 個地點、${rows.length} 則，實際 ${Object.keys(out).length} 個地點、${n} 則`);
  fs.writeFileSync(path.join(ROOT,'preview/stories.js'),`// 夜之門・景點故事（由 scripts/import-stories.cjs 從 ${XLSX} 產生，請勿手改）\n// 照片：Wikimedia Commons，作者與授權逐張列在 photo。\nexport const STORIES=${JSON.stringify(out,null,1)};\n`);
  console.log(`完成：${n} 則故事 → preview/stories.js`);
})().catch(e=>{console.error(e);process.exit(1)});
