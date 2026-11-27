// 上線版回歸檢查：先 node scripts/build-site.cjs，再
//   PLAYWRIGHT_MODULE=<playwright-core 路徑> CHROME_PATH=<Chrome 路徑> node preview/verify-site.cjs
// 直接服務 dist/，並送出 dist/vercel.json 的安全標頭（含 CSP），所以測到的是實際部署的檔案；任何 CSP 違規都算失敗。
const assert=require('node:assert'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const dist=path.join(__dirname,'../dist'),PORT=4175,ORIGIN=`http://127.0.0.1:${PORT}`;
const headers=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dist,'vercel.json'),'utf8')).headers[0].headers.map(h=>[h.key,h.value]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.json':'application/json','.txt':'text/plain'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,ORIGIN).pathname);if(p==='/')p='/index.html';const f=path.join(dist,p);
  if(!f.startsWith(dist)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return}
  res.writeHead(200,{...headers,'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
const C=require(path.join(dist,'catalog.js'));
const hot=k=>C.places.filter(p=>(p.countryKey||p.id)===k&&p.tier==='hot').length;
(async()=>{await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
 const problems=[];
 const open=async(url,opts={})=>{const page=await browser.newPage({viewport:{width:1440,height:900},...opts});
   page.on('pageerror',e=>problems.push(url+' → '+e.message));
   page.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))problems.push(url+' → CSP: '+m.text())});
   page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(ORIGIN))problems.push(url+' → HTTP '+r.status()+' '+r.url())});
   await page.goto(ORIGIN+url);return page};
 try{
  // 首頁：4 國、開門後的入口連到國家頁
  let page=await open('/');
  await page.waitForFunction(()=>document.querySelectorAll('#seg button').length===4);
  assert.match(await page.textContent('#seg'),/日本\s*716|日本/);
  await page.click('#seg button:has-text("韓國")');await page.click('#open');
  await page.waitForFunction(()=>document.body.classList.contains('through'),null,{timeout:15000});
  assert.equal(await page.getAttribute('#enter','href'),'country.html#korea');
  await page.click('#enter');await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/','先在門裡放大，不能直接換頁');
  await page.waitForURL(/country.html#korea$/,{timeout:5000});
  console.log('通過：首頁 4 國、開門、地球放大後才進國家頁。');await page.close();

  // 四國的國家頁：清單預設熱門、標點出現
  for(const k of ['japan','korea','taiwan','thailand']){page=await open('/country.html#'+k);
    await page.waitForFunction(()=>document.querySelector('#list .count'));
    assert.match(await page.textContent('#list .count'),new RegExp('^'+hot(k)+' 扇窗'),k+' 熱門數量');
    await page.waitForFunction(()=>document.querySelectorAll('#pins .pin').length>0,null,{timeout:15000});
    assert.equal(await page.getAttribute('#dock [aria-current]','href'),'country.html#'+k);await page.close()}
  console.log('通過：日本、韓國、台灣、泰國國家頁的清單、標點與國家切換。');

  // 點地圖上的縣市：降落完成後點畫面中央（台灣中部），要選到地區並飛過去
  page=await open('/country.html#taiwan');await page.waitForTimeout(3600);
  {const box=await page.locator('#gl').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2)}
  await page.waitForFunction(()=>document.getElementById('reg').value!=='');console.log('通過：點地圖上的縣市會選到地區（'+await page.inputValue('#reg')+'）。');await page.close();

  // 深連結打開墾丁：播放器、天氣、夜之門
  const kenting=C.places.find(p=>(C.sources[p.id]||[]).some(s=>s.videoId==='jUnFuJSj0OU')).id;
  page=await open('/country.html#taiwan/'+kenting);
  await page.waitForFunction(()=>document.getElementById('destination-dialog')?.classList.contains('open'),null,{timeout:15000});
  assert.equal(await page.evaluate(()=>SomewhereMedia.getState().destination),kenting);
  assert.notEqual(await page.evaluate(()=>SomewhereWeather.getState().status),'idle');
  assert.equal(await page.locator('.signs button').count(),12);
  await page.click('[data-nt="legend"]');assert(await page.locator('.lg').count()>0,'都市傳說');
  await page.click('[data-nt="story"]');assert.equal(await page.locator('.story').count(),4,'墾丁 4 則景點故事');
  await page.click('.story summary');await page.waitForFunction(()=>{const i=document.querySelector('.story[open] figure img');return i&&i.complete&&i.naturalWidth>0});
  assert.match(await page.textContent('.story[open] figcaption'),/照片：.+／.+／Wikimedia Commons/);
  assert.equal(await page.locator('#cMsg').isDisabled(),true,'留言尚未接後端，必須停用');
  // 收藏 → 重新整理後仍在
  await page.click('#dSave');assert.equal(await page.textContent('#saved-n'),'1');
  await page.reload();await page.waitForFunction(()=>document.getElementById('saved-n').textContent==='1');
  await page.click('#nav-saved');assert.equal(await page.locator('.sheet .hit').count(),1);await page.keyboard.press('Escape');
  // Esc 關閉景點，網址回到國家
  await page.waitForFunction(()=>document.getElementById('destination-dialog')?.classList.contains('open'));
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>location.hash),'#taiwan');
  console.log('通過：深連結、播放器與天氣接上、夜之門（運勢 12 星座、傳說、景點故事與照片授權）、留言停用、收藏保存、Esc 關閉。');
  // 地區標點：點了會篩選清單並出現「回到全國」
  await page.$eval('#pins .pin',b=>b.click());// 鏡頭還在飛回全國，標點可能暫時在畫面外
  await page.waitForFunction(()=>!document.getElementById('back').hidden);
  assert.notEqual(await page.inputValue('#reg'),'');console.log('通過：點地區標點會飛過去並篩選。');await page.close();

  // 非夜之門地點顯示即將開放；全站搜尋跨國跳轉
  page=await open('/country.html#japan');await page.click('#open-search');await page.fill('.sheet .q','高美');
  const href=await page.getAttribute('.sheet .hit','href');assert.match(href,/^country\.html#taiwan\//);
  await page.click('.sheet .hit');await page.waitForFunction(()=>document.getElementById('destination-dialog')?.classList.contains('open'),null,{timeout:15000});
  assert.equal(await page.evaluate(()=>location.hash.split('/')[0]),'#taiwan');assert.equal(await page.locator('#nightBox .soon').count(),1);
  console.log('通過：全站搜尋跨國打開景點；非夜之門地點顯示即將開放。');await page.close();

  // 小遊戲：收藏旁的入口、5 題作答、挑戰連結
  page=await open('/country.html#japan');await page.click('#nav-game');await page.waitForURL(/game\.html$/);
  for(let i=0;i<5;i++){await page.waitForFunction(()=>document.getElementById('gImg').complete&&document.getElementById('gImg').naturalWidth>0);
    const b=await page.locator('#map').boundingBox();await page.mouse.click(b.x+b.width*(.3+i*.1),b.y+b.height*.5);
    await page.click('#gGo');assert.match(await page.textContent('#gResult'),/差了 [\d,]+ 公里/);await page.click('#gGo')}
  await page.waitForFunction(()=>!document.getElementById('final').hidden);
  const link=await page.textContent('#fLink'),total=+(await page.textContent('#gTotal')).replace(/,/g,'');
  assert.match(link,/#c-(\d{1,2}-){5}s\d+$/);assert(total>=0&&total<=25000);
  await page.goto(link);await page.waitForFunction(()=>/朋友出的挑戰/.test(document.getElementById('gSub').textContent));
  console.log('通過：小遊戲入口、5 題作答與計分（'+total+' 分）、挑戰連結。');await page.close();

  // 手機版
  page=await open('/country.html#korea',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.waitForFunction(()=>document.querySelectorAll('#list .card').length>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'手機不能橫向捲動');
  await page.locator('#list .card').first().click();await page.waitForFunction(()=>document.getElementById('destination-dialog')?.classList.contains('open'));
  console.log('通過：手機版清單、景點面板、無橫向捲動。');await page.close();

  assert.deepEqual(problems,[],'頁面錯誤或 CSP 違規：\n'+problems.join('\n'));
  console.log('完成：上線版（dist）實際瀏覽器檢查，無 JavaScript 錯誤、無 CSP 違規、無 404。');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
