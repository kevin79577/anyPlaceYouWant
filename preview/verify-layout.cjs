/* Layout overlap check: the scene window (#island) must not cover markers, headings or other floating UI,
   and the map controls must not sit on the place panel.
   Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core package; optional CHROME_PATH uses an installed Chrome/Edge.
   Needs the preview server: node preview/serve.cjs */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';
// [route, width, height]. Mobile (≤700) hides the country scene window and uses its own stacked layout, so it is not listed.
const cases=[
  ['home',1440,900],['home',1280,800],['home',1280,720],['home',1024,768],['home',1920,1080],['home',390,844],['home',360,740],
  ['country/taiwan',800,700],['country/taiwan',1024,768],['country/taiwan',1100,720],['country/taiwan',1440,900],
  ['country/japan',1024,768],['country/japan',1100,720],['country/japan',1280,720],['country/japan',1440,800],['country/japan',1440,900],
  ['country/korea',900,760],['country/korea',1280,800],['country/korea',1440,900],['country/thailand',1024,768]
];
// Elements the scene window must stay clear of; markers are checked separately (dot always, label only while visible).
const guarded={hint:'#map-hint',footer:'.map-footer',heading:'#country-heading',summary:'#country-summary',dock:'.country-dock',library:'#place-library',intro:'.intro'};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  const failures=[];
  try{
    for(const [route,width,height] of cases){
      const page=await browser.newPage({viewport:{width,height}});
      await page.goto(`${origin}/experience.html?v=door-3#${route}`);
      await page.waitForFunction(()=>window.SomewhereExperience&&!SomewhereGlobe.getState().flying);
      await page.waitForTimeout(800);// let marker positions and panel transitions settle
      // A country deep link must focus the camera (#country/korea once stayed at the global view, which also hid an overlap).
      if(route.startsWith('country/')&&!(await page.evaluate(()=>SomewhereGlobe.getState().focused))){failures.push(`${route} ${width}x${height}`);console.error(`FAIL ${route} ${width}x${height}：鏡頭沒有對焦到國家`);await page.close();continue;}
      const hits=await page.evaluate(guarded=>{
        const box=el=>{if(!el||el.hidden)return null;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden')return null;const r=el.getBoundingClientRect();return r.width&&r.height?r:null;};
        const hit=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        // Home is the door: nothing in the room may sit on anything else (the scene window is hidden there).
        if(document.querySelector('#world').dataset.page==='home'){const parts={頁首:'.world-header',門牌:'.door-plaque span',門:'.door',標題:'.intro h1',提問:'.door-ask',國家選單:'.country-dock',開門:'#begin',頁尾:'.map-footer',手機導覽:'.mobile-nav'};const e=Object.entries(parts).map(([k,s])=>[k,box(document.querySelector(s))]),out=[];if(!e[2][1]||!e[6][1])out.push('門或開門按鈕不見了');for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++)if(hit(e[i][1],e[j][1]))out.push(e[i][0]+'／'+e[j][0]);return out;}
        const island=box(document.querySelector('#island'));if(!island)return [];
        const out=Object.entries(guarded).filter(([,s])=>hit(island,box(document.querySelector(s)))).map(([k])=>k);
        document.querySelectorAll('.geo-marker').forEach(m=>{const label=m.querySelector('.marker-label');const labelShown=label&&getComputedStyle(label).opacity!=='0';if(hit(island,box(m))||(labelShown&&hit(island,box(label))))out.push('marker「'+m.getAttribute('aria-label')+'」');});
        // The map controls column must not sit on the place panel (it once hid the panel's close button on tablets).
        if(hit(box(document.querySelector('#place-library')),box(document.querySelector('.map-controls'))))out.push('地圖控制鈕壓到地點清單');
        return out;},guarded);
      const name=`${route} ${width}x${height}`;
      if(hits.length){failures.push(name);console.error(`FAIL ${name}：重疊 ${hits.join('、')}`);}else console.log(`PASS ${name}`);
      await page.close();
    }
  }finally{await browser.close();}
  assert.deepEqual(failures,[],`${failures.length} 個版面有重疊`);
  console.log(`完成：${cases.length} 個版面情境，風景窗與控制鈕零重疊。`);
})().catch(e=>{console.error(e.message||e);process.exitCode=1;});
