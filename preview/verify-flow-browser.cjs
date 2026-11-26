/* Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core package.
   Optional CHROME_PATH uses an installed Chrome/Edge instead of Playwright's downloaded browser. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';
const output=path.join(__dirname,'../tmp/flow-qa');fs.mkdirSync(output,{recursive:true});
// QA screenshots wait for view transitions and dialog animations (max ~0.6s) to settle.
const shot=(p,name)=>p.waitForTimeout(700).then(()=>p.screenshot({path:path.join(output,name)}));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/experience.html?v=door-10');
  // Home is a door: the dock only changes what is behind it, 「開門」 walks through.
  await page.waitForFunction(()=>window.SomewhereExperience&&/^通往 日本・當地 \d\d:\d\d$/.test(document.querySelector('#door-plaque').textContent));
  assert.match(await page.getAttribute('#world','data-light'),/^(day|dusk|night)$/);
  await page.click('[data-destination="korea"]');
  assert.match(await page.textContent('#door-plaque'),/^通往 韓國/);
  assert.equal(await page.evaluate(()=>SomewhereExperience.getState().view),'home');
  // Windows with animations off reports prefers-reduced-motion; the door must still open with motion while the site's own switch is on.
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.map-surface')).transitionDuration),'0s');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await shot(page,'00-door.png');
  await page.click('#begin');
  await page.waitForFunction(()=>window.SomewhereGlobe?.getState().flying);
  assert.equal(await page.locator('#skip-entry').isVisible(),true);
  await page.click('#skip-entry');
  assert.equal(await page.evaluate(()=>SomewhereGlobe.getState().flying),false);
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='country');
  await shot(page,'01-country.png');
  assert.equal(await page.evaluate(()=>SomewhereExperience.getState().id),'korea');
  console.log('通過：首頁選目的地、開門、略過、進入國家探索。');
  await page.click('[data-destination="taiwan"]');
  await page.waitForFunction(()=>!SomewhereGlobe.getState().flying);
  // Wheel over a marker still zooms, and zooms about the cursor: the marker under the mouse stays under it.
  const spot=await page.evaluate(()=>{const m=[...document.querySelectorAll('.geo-marker:not(.cluster)')].map(m=>({m,r:m.querySelector('.marker-dot').getBoundingClientRect()})).find(({m,r})=>r.width&&getComputedStyle(m).visibility!=='hidden'&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.geo-marker')===m);
    return m&&{label:m.m.getAttribute('aria-label'),x:m.r.x+m.r.width/2,y:m.r.y+m.r.height/2,zoom:SomewhereGlobe.getState().zoom};});
  assert(spot,'no single marker to hover');
  await page.mouse.move(spot.x,spot.y);await page.mouse.wheel(0,-300);await page.waitForTimeout(400);
  const after=await page.evaluate(label=>{const m=[...document.querySelectorAll('.geo-marker')].find(m=>m.getAttribute('aria-label')===label),r=m.querySelector('.marker-dot').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,zoom:SomewhereGlobe.getState().zoom};},spot.label);
  assert(after.zoom>spot.zoom*1.2,`wheel over a marker did not zoom (${spot.zoom} → ${after.zoom})`);
  assert(Math.hypot(after.x-spot.x,after.y-spot.y)<4,`zoom is not about the cursor: marker moved ${Math.round(Math.hypot(after.x-spot.x,after.y-spot.y))}px`);
  console.log('通過：滑鼠在標記上滾輪可放大，且以滑鼠位置為中心。');
  // The place panel lists every place (no 查看全部 button) and scrolls.
  assert.equal(await page.locator('#place-list [data-place]').count(),121);
  await page.fill('#place-query','花蓮 七星潭');
  assert.equal(await page.locator('#place-list [data-place]').count(),1);
  await shot(page,'02-locations.png');
  await page.click('#place-list [data-place]');
  // A place in the list opens its stream directly; 返回景點資訊 then shows the detail page.
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='watch');
  // Desktop: the stream is a docked, non-modal panel; the place page it returns to is a modal again.
  assert.equal(await page.evaluate(()=>document.querySelector('#destination-dialog').matches(':modal')),false);
  await page.click('#watch-return');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='place');
  assert.equal(await page.evaluate(()=>document.querySelector('#destination-dialog').matches(':modal')),true);
  assert.equal(await page.locator('#destination-dialog').isVisible(),true);
  assert.match(await page.locator('#detail-title').textContent(),/七星潭/);
  await shot(page,'03-place.png');
  await page.click('#detail-save');
  await page.click('#detail-back');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='country');
  assert.equal(await page.locator('#place-query').inputValue(),'花蓮 七星潭');
  assert.equal(await page.locator('#place-list [data-place]').count(),1);
  console.log('通過：121 個台灣熱門地點、篩選、景點、收藏及返回保留篩選。');
  // 一般景點：預設不出現；搜尋到時提示，點提示打開後出現並帶「一般」標籤，地圖多出灰綠色標記
  await page.fill('#place-query','大溪橋');
  assert.equal(await page.locator('#place-list [data-place]').count(),0);
  assert.match(await page.locator('#place-list .general-hint').textContent(),/一般景點中有 1 筆符合/);
  await page.click('#place-list .general-hint');
  assert.equal(await page.locator('#place-list [data-place]').count(),1);
  assert.match(await page.locator('#place-list .tier-tag.general').textContent(),/一般/);
  assert.equal(await page.locator('#tier-switch [data-tier="all"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('[data-destination="taiwan"]').textContent(),/台灣 217/);
  await page.fill('#place-query','');
  assert.equal(await page.locator('#place-list [data-place]').count(),217);
  await page.click('#tier-switch [data-tier="hot"]');
  assert.equal(await page.locator('#place-list [data-place]').count(),121);
  assert.match(await page.locator('[data-destination="taiwan"]').textContent(),/台灣 121/);
  console.log('通過：一般景點預設隱藏、搜尋提示、開關切換與國家切換列數字。');
  await page.click('#nav-saved');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='saved');
  assert.equal(await page.locator('#saved-list .collection-card').count(),1);
  await page.click('[data-remove-save]');
  assert.equal(await page.locator('#undo-toast').isVisible(),true);
  await page.click('#undo-save');
  assert.equal(await page.locator('#saved-list .collection-card').count(),1);
  await shot(page,'04-saved.png');
  console.log('通過：收藏清單、移除與復原。');
  await page.click('#header-search');
  await page.fill('#global-query','海邊');
  assert.ok(await page.locator('#global-results [data-place]').count()>0);
  await page.click('[data-search-country="thailand"]');
  const matches=await page.evaluate(()=>SomewhereExperience.searchMatches('海邊').map(p=>p.countryKey));
  assert.ok(matches.every(k=>k==='thailand'));
  await page.fill('#global-query','找不到這個地方123');
  assert.equal(await page.locator('#clear-search').isVisible(),true);
  await page.click('#clear-search');
  assert.ok(await page.locator('#global-results [data-place]').count()>0);
  await page.fill('#global-query','廣安里');
  await shot(page,'05-search.png');
  await page.click('#global-results [data-place]');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='place');
  await page.waitForTimeout(700);// let the open morph finish before closing
  await page.click('#detail-back');
  // Reverse morph: the detail hero shrinks back into the card it was opened from.
  await page.waitForFunction(()=>document.getAnimations().some(a=>String(a.effect?.pseudoElement).includes('view-transition-group(place-photo)')));
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='search');
  assert.equal(await page.locator('#global-query').inputValue(),'廣安里');
  await page.click('#search-close');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='saved');
  console.log('通過：跨國情境搜尋、空結果、清除及搜尋返回記憶。');
  await page.click('#nav-stories');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='stories');
  await page.selectOption('#stories-country','taiwan');await page.click('[data-period="30"]');
  assert.match(await page.locator('#stories-empty-copy').textContent(),/台灣最近 30 天/);
  assert.equal(await page.locator('#stories-suggestions [data-place]').count(),3);
  await shot(page,'06-stories.png');
  console.log('通過：近期分享篩選與未串接的真實空狀態。');
  // Fail the provider request deliberately to verify the visible recovery flow.
  await page.route('**/www.youtube.com/iframe_api',route=>route.abort());
  // Earlier steps already loaded the real player API (it is cached inside media-player.js), so reload first: the blocked load is then the only one.
  await page.goto(origin+'/experience.html?v=door-10&blocked=1#stories');
  await page.waitForFunction(()=>window.SomewhereExperience?.getState().view==='stories');
  await page.evaluate(()=>SomewhereExperience.openPlace('korea'));
  await page.click('#watch-start');
  await page.waitForFunction(()=>SomewhereMedia.getState().status==='error');
  assert.equal(await page.locator('#destination-dialog.watching').isVisible(),true);
  assert.equal(await page.locator('#media-original').isVisible(),true);
  assert.equal(await page.locator('#media-source').isVisible(),true);
  await shot(page,'07-watch-error.png');
  await page.click('#watch-return');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='place');
  assert.equal(await page.locator('#destination-dialog.watching').count(),0);
  await page.click('#detail-back');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='stories');
  console.log('通過：觀看、播放器失敗恢復、原站入口與返回。');
  // Cluster clicks: a single-region cluster filters the list; a mixed cluster resets the filter and zooms in until it splits.
  const clusters=await browser.newPage({viewport:{width:1440,height:900}});
  clusters.on('pageerror',e=>errors.push(e.message));
  await clusters.goto(origin+'/experience.html?v=door-10#country/japan');
  await clusters.waitForFunction(()=>window.SomewhereExperience?.getState().view==='country'&&!SomewhereGlobe.getState().flying);
  await clusters.waitForTimeout(900);
  // Hidden markers keep their last cluster data, so only match visible ones.
  const single=clusters.locator('.geo-marker.cluster:not([hidden]):not([data-region=""])').first();
  const region=await single.getAttribute('data-region');
  await single.click();
  assert.equal(await clusters.locator('#place-region').inputValue(),region);
  const zoomBefore=await clusters.evaluate(()=>SomewhereGlobe.getState().zoom);
  await clusters.click('.geo-marker.cluster:not([hidden])[data-region=""]');
  await clusters.waitForFunction(z=>SomewhereGlobe.getState().zoom>z*2,zoomBefore);
  assert.equal(await clusters.locator('#place-region').inputValue(),'','mixed cluster must clear the region filter');
  assert.equal(await clusters.evaluate(()=>SomewhereExperience.getState().view),'country','zoom-in stays in the country view');
  console.log(`通過：同地區聚合點篩選「${region}」，跨地區聚合點清除篩選並放大到那一帶。`);
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(origin+'/experience.html?v=door-10#country/taiwan');
  await mobile.waitForFunction(()=>window.SomewhereExperience?.getState().view==='country');
  await mobile.click('#sheet-handle');
  assert.equal(await mobile.locator('#world.sheet-expanded').count(),1);
  await shot(mobile,'08-mobile-country.png');
  await mobile.click('#place-list [data-place] >> nth=0');
  await mobile.waitForFunction(()=>SomewhereExperience.getState().view==='watch');
  assert.equal(await mobile.locator('#destination-dialog').isVisible(),true);
  await shot(mobile,'09-mobile-place.png');
  await mobile.click('#detail-back');
  await mobile.waitForFunction(()=>SomewhereExperience.getState().view==='country');
  assert.equal(await mobile.locator('#sheet-handle').getAttribute('aria-expanded'),'true');
  await mobile.click('[data-mobile-nav="saved"]');
  await mobile.waitForFunction(()=>SomewhereExperience.getState().view==='saved');
  assert.equal(await mobile.locator('#saved-panel').isVisible(),true);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('通過：手機底部面板、景點、返回與收藏導覽。');
  assert.deepEqual(errors,[]);
  console.log('完成：8 組實際瀏覽器流程驗證，無未處理 JavaScript 錯誤。');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
