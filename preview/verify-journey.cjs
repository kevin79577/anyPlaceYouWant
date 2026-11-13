/* Bounded UI behavior checks; not a substitute for browser visual acceptance. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
function environment(hash=''){
  const elements=new Map(),events={};
  function element(selector){
    if(elements.has(selector))return elements.get(selector);
    const e={selector,dataset:{},style:{},attrs:{},listeners:{},classList:{add(){},remove(){}},hidden:false,open:false,
      setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},focus(){document.activeElement=this;},
      showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},
      closest(s){if(s==='[data-screen]'&&this.dataset.screen)return this;if(s==='[data-view]'&&this.dataset.view)return this;return null;},
      getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100,height:1100};}
    };elements.set(selector,e);return e;
  }
  const tabs=['detail','overview','flow'].map(v=>{const e=element('tab-'+v);e.dataset.view=v;return e;});
  const document={title:'',body:element('body'),activeElement:element('#zoom'),querySelector:element,
    querySelectorAll(s){return s==='[data-view]'?tabs:[];},addEventListener(k,fn){events[k]=fn;}};
  const location={hash,origin:'http://127.0.0.1:4173'};
  const window={addEventListener(k,fn){events['window-'+k]=fn;}};window.parent=window;
  const context=vm.createContext({document,window,location,history:{replaceState(a,b,h){location.hash=h;}},console});
  const run=code=>vm.runInContext(code,context);
  run(read('journey.js'));
  return {run,element,events,document,location};
}
const test=(name,fn)=>{fn();console.log('通過：'+name);};
test('十組畫面與本機 PNG 圖檔完整',()=>{
  const h=environment();const screens=h.run('screens');assert.equal(screens.length,10);
  assert.equal(new Set(screens.map(s=>s.id)).size,10);
  for(const s of screens){const b=fs.readFileSync(path.join(__dirname,'assets',`journey-${s.id}.png`));assert.equal(b.subarray(1,4).toString(),'PNG');assert.ok(b.readUInt32BE(16)>=1500);for(const next of s.next)assert.ok(screens.some(x=>x.id===next));}
  assert.match(h.element('#hero').src,/journey-world\.png$/);assert.equal(h.element('#previous').disabled,true);
});
test('逐頁前進、返回、第一張及最後一張的界線',()=>{
  const h=environment();for(let i=0;i<9;i++)h.element('#next').listeners.click();
  assert.match(h.element('#hero').src,/journey-mobile\.png$/);assert.equal(h.element('#next').disabled,true);
  h.element('#next').listeners.click();assert.equal(h.run('selected'),9);
  for(let i=0;i<9;i++)h.element('#previous').listeners.click();assert.equal(h.run('selected'),0);
  h.element('#previous').listeners.click();assert.equal(h.run('selected'),0);
});
test('總覽、流程圖與景點捷徑切換後維持正確畫面',()=>{
  const h=environment();h.run("setView('overview')");assert.equal(h.element('#detail-view').hidden,true);assert.equal(h.element('#overview-view').hidden,false);
  const link=h.element('flow-place');link.dataset.screen='place';h.events.click({target:link});
  assert.equal(h.run('view'),'detail');assert.equal(h.element('#detail-view').hidden,false);assert.equal(h.element('#overview-view').hidden,true);
  assert.equal(h.element('#screen-title').textContent,'景點詳情');assert.match(h.element('#next-links').innerHTML,/data-screen="watch"/);
  h.run("setView('flow')");assert.equal(h.element('#flow-view').hidden,false);
});
test('方向鍵、大圖關閉與焦點恢復',()=>{
  const h=environment();let prevented=false;const key=key=>h.events.keydown({key,target:h.element('root'),preventDefault(){prevented=true;}});
  key('ArrowRight');assert.equal(h.run('selected'),1);assert.ok(prevented);
  h.document.activeElement=h.element('#zoom');h.element('#zoom').listeners.click();assert.equal(h.element('#lightbox').open,true);assert.match(h.element('#zoom-image').src,/journey-country\.png$/);
  key('ArrowRight');assert.equal(h.run('selected'),1);
  h.element('#close-zoom').listeners.click();assert.equal(h.element('#lightbox').open,false);assert.equal(h.document.activeElement,h.element('#zoom'));
});
test('深層連結與不合法頁面處理',()=>{
  const h=environment('#watch');assert.equal(h.run('selected'),5);
  h.location.hash='#saved';h.events['window-hashchange']();assert.equal(h.element('#screen-title').textContent,'我的收藏');
  h.run("select('unknown')");assert.equal(h.run('selected'),7);
  assert.equal(environment('#unknown').run('selected'),0);
});
test('主網站整合路由、保留舊版與三種提案模式',()=>{
  new vm.Script(read('app.js'));new vm.Script(read('journey.js'));
  assert.match(read('index.html'),/data-design="journey"/);
  assert.match(read('app.js'),/glasspages,experience,journey/);
  assert.match(read('app.js'),/journey\.html\?v=journey-08/);
  assert.match(read('journey.html'),/data-view="flow"/);
  assert.match(read('journey.html'),/data-screen="watch"/);
  assert.match(read('journey.html'),/影像、天氣、貼文皆為示意/);
  assert.match(read('journey.css'),/body\.embedded\{min-height:0\}/);
  assert.match(read('app.js'),/e\.origin===location\.origin&&e\.source===frame\.contentWindow/);
});
console.log('完成：6 組設計預覽回歸檢查。');
