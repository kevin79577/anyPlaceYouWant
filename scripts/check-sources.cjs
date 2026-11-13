// Automated check of the catalog's YouTube sources. Writes docs/來源自動檢查報告.md; never edits the catalog
// (a source is only "verified" after a human confirms it on the real site).
//   A. oEmbed: does the video still exist, and is embedding allowed at all?
//   B. Real playback (optional, needs PLAYWRIGHT_MODULE and the preview server): plays each video with the same
//      youtube-nocookie IFrame player the site uses. oEmbed can say "embeddable" while the owner still blocks some sites.
// Usage: node scripts/check-sources.cjs            (A only)
//        PLAYWRIGHT_MODULE=... [CHROME_PATH=...] node scripts/check-sources.cjs   (A + B; run node preview/serve.cjs first)
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scope={};vm.createContext(scope);scope.window=scope;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../preview/catalog.js'),'utf8'),scope);
const C=scope.SomewhereCatalog,placeById=new Map(C.places.map(p=>[p.id,p]));
const rows=Object.entries(C.sources).flatMap(([placeId,list])=>list.map(s=>({...s,placeId,place:placeById.get(placeId)})));
const videos=rows.filter(r=>r.videoId),externalOnly=rows.filter(r=>!r.videoId);
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';

async function pool(items,size,fn){let i=0;await Promise.all(Array.from({length:size},async()=>{while(i<items.length){const item=items[i++];await fn(item);}}));}

async function oembed(r){
  const url='https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+r.videoId);
  try{const res=await fetch(url,{signal:AbortSignal.timeout(15000)});
    r.oembed=res.ok?'ok':res.status===401||res.status===403?'embed-disabled':res.status===404||res.status===400?'missing':'http-'+res.status;}
  catch{r.oembed='network-error';}
}

// YouTube IFrame API error codes: 2 bad id, 5 HTML5 player, 100 removed/private, 101/150 owner blocks embedding, 153 player config.
const ytError={2:'影片代號無效',5:'播放器錯誤',100:'影片已移除或設為私人',101:'擁有者禁止嵌入',150:'擁有者禁止嵌入',153:'播放器設定錯誤'};
async function playback(list){
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try{
    await pool(list,3,async r=>{
      const page=await browser.newPage();
      try{
        await page.goto(origin+'/privacy.html');// any same-origin page; the player is created exactly like media-player.js
        r.play=await page.evaluate(id=>new Promise(done=>{
          const finish=v=>{clearTimeout(timer);done(v);};const timer=setTimeout(()=>finish({state:'timeout'}),25000);
          const boot=()=>{const host=document.createElement('div');document.body.append(host);
            new YT.Player(host,{host:'https://www.youtube-nocookie.com',videoId:id,playerVars:{autoplay:1,mute:1,playsinline:1},events:{
              onError:e=>finish({state:'error',code:e.data}),
              onStateChange:e=>{if(e.data===1){const d=e.target.getVideoData?e.target.getVideoData():{};finish({state:'playing',live:d.isLive===true});}}}});};
          if(window.YT&&YT.Player)boot();else{window.onYouTubeIframeAPIReady=boot;const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.head.append(s);}
        }),r.videoId);
      }catch(e){r.play={state:'check-failed',detail:e.message.slice(0,60)};}
      await page.close();
    });
  }finally{await browser.close();}
}

function verdict(r){
  if(r.oembed==='missing')return '❌ 影片不存在';
  if(r.oembed==='embed-disabled')return '❌ 禁止嵌入';
  if(!r.play)return r.oembed==='ok'?'⚪ oEmbed 正常（未實測播放）':'⚠️ 無法檢查（'+r.oembed+'）';
  if(r.play.state==='playing')return r.play.live?'✅ 可播放・播放器回報直播':'🟡 可播放・非直播（錄影或已結束）';
  if(r.play.state==='error')return '❌ 播放失敗：'+(ytError[r.play.code]||'代碼 '+r.play.code);
  return '⚠️ '+(r.play.state==='timeout'?'25 秒內未開始播放':'檢查失敗');
}

(async()=>{
  await pool(videos,4,oembed);
  const doPlay=!!process.env.PLAYWRIGHT_MODULE;
  if(doPlay)await playback(videos.filter(r=>r.oembed==='ok'));
  for(const r of videos)r.verdict=verdict(r);
  const date=new Date().toISOString().slice(0,10);
  const count=(list,pred)=>list.filter(pred).length;
  const lines=[`# 來源自動檢查報告`,``,`檢查日期：${date}。由 \`scripts/check-sources.cjs\` 產生，請勿手動編輯；重新執行即可更新。`,``,
    `> 這是自動檢查，**不等於已驗證**。「可播放」只代表在本機測試環境（${origin}）用無頭 Chrome 能開始播放；正式網域、真實瀏覽器與「是否為即時畫面」仍須人工確認後，才可在網站上標示為已驗證。`,``,
    `## 總覽`,``,`| 國家 | YouTube 來源 | ✅ 可播・直播 | 🟡 可播・非直播 | ❌ 失效或禁止 | ⚠️／⚪ 未確定 | 僅原站連結 |`,`| --- | --- | --- | --- | --- | --- | --- |`];
  for(const k of Object.keys(C.countries)){const v=videos.filter(r=>(r.place?.countryKey||r.placeId)===k),e=externalOnly.filter(r=>(r.place?.countryKey||r.placeId)===k);
    lines.push(`| ${C.countries[k].name} | ${v.length} | ${count(v,r=>r.verdict.startsWith('✅'))} | ${count(v,r=>r.verdict.startsWith('🟡'))} | ${count(v,r=>r.verdict.startsWith('❌'))} | ${count(v,r=>/^[⚠️⚪]/u.test(r.verdict))} | ${e.length} |`);}
  lines.push('',`檢查方式：${doPlay?'oEmbed + 實際播放（youtube-nocookie IFrame 播放器、靜音自動播放、25 秒逾時）':'只有 oEmbed（沒有設定 PLAYWRIGHT_MODULE，未實測播放）'}。`,'');
  const problems=videos.filter(r=>!r.verdict.startsWith('✅')&&!r.verdict.startsWith('🟡'));
  lines.push(`## 需要處理（${problems.length}）`,'');
  if(problems.length){lines.push('| 地點 | 來源 | 影片 | 結果 |','| --- | --- | --- | --- |');for(const r of problems)lines.push(`| ${r.place?.name||r.placeId} | ${r.provider||''} | [${r.videoId}](https://www.youtube.com/watch?v=${r.videoId}) | ${r.verdict} |`);}else lines.push('沒有。');
  lines.push('',`## 全部 YouTube 來源（${videos.length}）`,'','| 地點 | 來源 | 影片 | 結果 |','| --- | --- | --- | --- |');
  for(const r of videos)lines.push(`| ${r.place?.name||r.placeId} | ${r.provider||''} | [${r.videoId}](https://www.youtube.com/watch?v=${r.videoId}) | ${r.verdict} |`);
  lines.push('',`## 僅原站連結（${externalOnly.length}，無法自動檢查）`,'','| 地點 | 原站 |','| --- | --- |');
  for(const r of externalOnly)lines.push(`| ${r.place?.name||r.placeId} | ${r.url||r.fallback||''} |`);
  const out=path.join(__dirname,'../docs/來源自動檢查報告.md');fs.writeFileSync(out,lines.join('\n')+'\n');
  console.log(`Checked ${videos.length} videos (${doPlay?'oEmbed + playback':'oEmbed only'}). Problems: ${problems.length}. Report: ${path.relative(process.cwd(),out)}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
