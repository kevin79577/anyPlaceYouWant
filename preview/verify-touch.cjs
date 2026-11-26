// 實際 Chrome 觸控（CDP 送真的觸控點）：雙指張開放大、捏合縮小、雙指放開不誤觸點擊、快速甩有慣性且會停、停住再放手不轉。
// 用法：先 node preview/serve.cjs，再 PLAYWRIGHT_MODULE=<playwright-core 路徑> CHROME_PATH=<Chrome 路徑> node preview/verify-touch.cjs
const assert=require('node:assert');const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
 try{
  const page=await (await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173')+'/experience.html');await page.waitForFunction(()=>window.SomewhereGlobe&&window.SomewhereExperience);
  await page.click('#begin');await page.waitForFunction(()=>SomewhereGlobe.getState().flying);await page.click('#skip-entry');
  await page.waitForFunction(()=>SomewhereExperience.getState().view==='country');
  const box=await page.locator('#globe').boundingBox(),cx=box.x+box.width/2;
  // 手機版上有標題列、下有面板：找一條左右 ±90px 都直接落在地球 canvas 上的橫線
  const cy=await page.evaluate(x=>{for(let y=120;y<700;y+=10)if([-90,0,90].every(d=>document.elementFromPoint(x+d,y)?.id==='globe'))return y;return null},cx);assert(cy,'找不到沒被擋住的地球區域');
  const cdp=await page.context().newCDPSession(page);const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map(([x,y],id)=>({x,y,id}))});
  const st=()=>page.evaluate(()=>({zoom:SomewhereGlobe.getState().zoom,lon:SomewhereGlobe.getState().lon,view:SomewhereExperience.getState().view}));
  const pinch=async(from,to)=>{await touch('touchStart',[[cx-from,cy]]);await touch('touchStart',[[cx-from,cy],[cx+from,cy]]);
   for(let i=1;i<=10;i++){const h=from+(to-from)*i/10;await touch('touchMove',[[cx-h,cy],[cx+h,cy]]);}await touch('touchEnd',[[cx-to,cy]]);await touch('touchEnd',[]);await page.waitForTimeout(300);};
  const before=await st();
  await pinch(20,80);const opened=await st();
  assert(opened.zoom>before.zoom*2,'雙指張開沒有放大：'+before.zoom+' → '+opened.zoom);assert.equal(opened.view,before.view,'雙指放開後不能觸發點擊、切換畫面');
  await pinch(80,20);const closed=await st();assert(closed.zoom<opened.zoom/2,'雙指捏合沒有縮小：'+opened.zoom+' → '+closed.zoom);
  console.log('通過：雙指縮放 '+before.zoom.toFixed(2)+' → '+opened.zoom.toFixed(2)+' → '+closed.zoom.toFixed(2)+'，放開不誤觸。');
  // 快速甩：事件一次送完（不等回應），間隔才接近真的手指；headless 逐一等待時每個事件要 100ms 以上
  await touch('touchStart',[[cx-60,cy]]);await Promise.all([...[1,2,3,4,5,6].map(i=>touch('touchMove',[[cx-60+i*20,cy]])),touch('touchEnd',[])]);
  const released=await st();await page.waitForTimeout(600);const drift=Math.abs(((await st()).lon-released.lon+540)%360-180);
  assert(drift>.3,'放手後沒有慣性');assert(drift<45,'慣性太強：'+drift+' 度');
  await page.waitForTimeout(2500);const a=await st();await page.waitForTimeout(400);assert(Math.abs((await st()).lon-a.lon)<1e-6,'慣性沒有停下來');
  console.log('通過：快速甩動放手後再轉 '+drift.toFixed(1)+' 度，並會停下。');
  await touch('touchStart',[[cx,cy]]);await touch('touchMove',[[cx+30,cy]]);await page.waitForTimeout(300);await touch('touchEnd',[]);
  const s1=await st();await page.waitForTimeout(400);assert(Math.abs((await st()).lon-s1.lon)<1e-6,'停住後放手不該再轉');
  console.log('通過：拖曳停住再放手，不會繼續轉。');
  assert.equal(errors.length,0,errors.join('\n'));console.log('完成：觸控手勢驗證，無未處理 JavaScript 錯誤。');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
