// 比對台灣每支影片「目前的 YouTube 標題」和 Excel 名稱，找出頻道已經換成別的地點的直播。
// 判斷方式：把 Excel 名稱拆成中文兩字詞（去掉「台北」「360」這類通用字），看有幾個出現在標題裡；一個都沒有就列為「疑似換內容」。
// 只讀不寫：不會改資料，結果印在終端機。用法：node scripts/check-taiwan-titles.cjs
const data=require('./taiwan-livecams.json');

const norm=s=>String(s).replace(/臺/g,'台').replace(/[\s\-_|｜・·#【】\[\]()（）「」:：,，.。!！?？/\\]/g,'').toLowerCase();
// 只出現在名稱、不代表地點的字詞
const GENERIC=['即時','影像','直播','監視','鏡頭','全景','觀景','景台','台灣','風景'];
function tokens(name){const s=norm(name).replace(/[a-z0-9]+/g,' ');const out=new Set();for(const part of s.split(' '))for(let i=0;i+1<part.length;i++){const t=part.slice(i,i+2);if(!GENERIC.includes(t))out.add(t);}return [...out];}

async function title(id){
  for(let n=0;n<3;n++){try{const r=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),{signal:AbortSignal.timeout(15000)});if(r.ok)return (await r.json()).title;if(r.status===401||r.status===403||r.status===404)return null;}catch{}}
  return undefined;
}
async function pool(items,size,fn){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const it=items[i++];await fn(it);}}));}

(async()=>{
  const rows=data.places.flatMap(p=>p.sources.map(s=>({name:s.title||p.name,tier:p.tier,region:p.region,videoId:s.videoId})));
  await pool(rows,6,async r=>{r.ytTitle=await title(r.videoId);});
  for(const r of rows){if(typeof r.ytTitle!=='string')continue;const t=norm(r.ytTitle),k=tokens(r.name);r.hit=k.filter(x=>t.includes(x));r.total=k.length;}
  const failed=rows.filter(r=>typeof r.ytTitle!=='string');
  const suspect=rows.filter(r=>r.total>0&&r.hit.length===0);
  const weak=rows.filter(r=>r.total>=3&&r.hit.length>0&&r.hit.length/r.total<.34);
  const line=r=>`  [${r.tier==='hot'?'熱門':'一般'}] ${r.name}（${r.region}）\n      YouTube：${r.ytTitle}\n      https://www.youtube.com/watch?v=${r.videoId}`;
  console.log(`檢查 ${rows.length} 支影片`);
  console.log(`\n❌ 疑似換內容（名稱關鍵字完全不在標題裡）：${suspect.length} 支`);for(const r of suspect)console.log(line(r));
  console.log(`\n🟡 只對到少數關鍵字，建議人工看一下：${weak.length} 支`);for(const r of weak)console.log(line(r)+`\n      對到：${r.hit.join('、')}`);
  if(failed.length){console.log(`\n⚠️ 取不到標題（已下架、禁止嵌入或網路錯誤）：${failed.length} 支`);for(const r of failed)console.log(`  ${r.name}（${r.videoId}）`);}
})().catch(e=>{console.error(e);process.exit(1);});
