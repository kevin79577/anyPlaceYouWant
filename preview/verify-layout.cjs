/* Layout overlap check: the scene window (#island) must not cover markers, headings or other floating UI,
   and the map controls must not sit on the place panel.
   Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core package; optional CHROME_PATH uses an installed Chrome/Edge.
   Needs the preview server: node preview/serve.cjs */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.PREVIEW_ORIGIN||'http://127.0.0.1:4173';
// [route, width, height]. Mobile (≤700) hides the country scene window and uses its own stacked layout, so it is not listed.
const cases=[
  ['home',1440,900],['home',1280,800],['home',1280,720],['home',1024,768],['home',1920,1080],
  ['country/taiwan',800,700],['country/taiwan',1024,768],['country/taiwan',1100,720],['country/taiwan',1440,900],
  ['country/japan',1024,768],['country/japan',1100,720],['country/japan',1280,720],['country/japan',1440,800],['country/japan',1440,900],
  ['country/korea',900,760],['country/thailand',1024,768]
];
// Elements the scene window must stay clear of; markers are checked separately (dot always, label only while visible).
const guarded={hint:'#map-hint',footer:'.map-footer',heading:'#country-heading',summary:'#country-summary',dock:'.country-dock',library:'#place-library',intro:'.intro'};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  const failures=[];
  try{
    for(const [route,width,height] of cases){
      const page=await browser.newPage({viewport:{width,height}});
      await page.goto(`${origin}/experience.html?v=flow-10#${route}`);
      await page.waitForFunction(()=>window.SomewhereExperience&&!SomewhereGlobe.getState().flying);
      await page.waitForTimeout(800);// let marker positions and panel transitions settle
      const hits=await page.evaluate(guarded=>{
        const box=el=>{if(!el||el.hidden)return null;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden')return null;const r=el.getBoundingClientRect();return r.width&&r.height?r:null;};
        const hit=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
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
