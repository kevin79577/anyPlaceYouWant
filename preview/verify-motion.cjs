// Regression harness: actual startup, country-button handlers and animation loop.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function boot(reducedMotion) {
  let now = 0, nextFrame;
  const nodes = new Map(), timers = [];
  const context2d = new Proxy({
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; }
  }, {get: (target, key) => key in target ? target[key] : () => {}, set(target, key, value) {target[key] = value; return true;}});
  class Element {
    constructor() {this.events={};this.style={};this.hidden=false;this.children=[];this.attrs={};this.dataset={};this.value='';this.classList={add(){},remove(){},toggle(){}};}
    addEventListener(type, fn) {(this.events[type] ??= []).push(fn);}
    fire(type, event={}) {for(const fn of this.events[type] || []) fn({preventDefault(){}, ...event});}
    setAttribute(key,value) {this.attrs[key]=value;}
    append(...items) {this.children.push(...items);}
    replaceChildren() {this.children=[];}
    getBoundingClientRect() {return {width:1440,height:900,left:0,top:0,right:1440,bottom:900};}
    getContext() {return context2d;}
    querySelector() {return this.label ??= new Element();}
    setPointerCapture() {}
    focus() {}
    showModal() {this.open=true;}
    close() {this.open=false;}
  }
  const nav=['japan','korea','taiwan','thailand'].map(id=>Object.assign(new Element(),{dataset:{destination:id}}));
  const doc={hidden:false,querySelector(key){if(!nodes.has(key)) nodes.set(key,new Element());return nodes.get(key);},querySelectorAll(key){return key==='[data-destination]'?nav:[];},createElement(){return new Element();},addEventListener(){}};
  const scope={document:doc,console,Intl,performance:{now:()=>now},localStorage:{getItem(){return null;},setItem(){}},matchMedia:()=>({matches:reducedMotion}),devicePixelRatio:1,ResizeObserver:class{observe(){}disconnect(){}},addEventListener(){},setTimeout(fn,delay){timers.push({fn,at:now+delay});return timers.length;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},requestAnimationFrame(fn){nextFrame=fn;return 1;},cancelAnimationFrame(){}};
  scope.window=scope;vm.createContext(scope);
  for(const file of ['vendor/d3.min.js','assets/world-data.js','assets/world-low-data.js','catalog.js','globe-flight.js','globe.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),scope,{filename:file});
  return {api:scope.SomewhereGlobe,nodes,nav,step(t){now=t;for(const timer of timers.splice(0)) {if(timer.at<=now)timer.fn();else timers.push(timer);}nextFrame(t);}};
}
const failures=[];
function test(name,fn){try{fn();console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}}
test('refresh starts a visible entry transition',()=>{const app=boot(false);app.step(600);assert(app.api.getState().flying,'page reload never starts the entry flight');app.step(3100);assert(app.api.getState().lon>200,'entry globe did not turn visibly');});
test('requested country transition is not silently skipped by OS preference',()=>{const app=boot(true);app.nav[0].fire('click');app.step(2500);assert(app.api.getState().flying,'country click jumped immediately because duration became zero');assert(app.api.getState().lon>200,'country click did not rotate');app.step(5200);assert(!app.api.getState().flying);const catalog=require('./catalog.js');assert(Math.abs(app.api.getState().lon-catalog.places.find(p=>p.id==='japan').point[0])<1e-8);});
test('motion can be disabled explicitly inside the prototype',()=>{const app=boot(false);const toggle=app.nodes.get('#motion-toggle');assert(toggle,'missing visible motion setting');toggle.fire('click');app.nav[1].fire('click');app.step(200);assert(!app.api.getState().flying);assert.equal(toggle.attrs['aria-pressed'],'false');});
test('actual country buttons choose direct mode after the entry flight',()=>{const app=boot(false);app.step(600);app.step(5800);const start=app.api.getState();app.nav[1].fire('click');app.step(6350);const middle=app.api.getState();assert(middle.flying);assert(Math.abs(middle.lon-start.lon)<10,'country handler added an extra revolution');assert(Math.abs(middle.zoom-start.zoom)<1e-8,'country handler pulled camera back');app.step(7000);assert(!app.api.getState().flying);assert(Math.abs(app.api.getState().lon-129.118)<1e-8);});
test('homepage makes two turns then aligns with destination',()=>{const {create}=require('./globe-flight.js');const from={lon:105,lat:25,zoom:1,focusMix:0,focused:false};const flight=create(from,[135.778,34.998],{mode:'intro'});let previous=flight.sample(0).lon,total=0;for(let t=25;t<=flight.duration;t+=25){const lon=flight.sample(t).lon;total+=((lon-previous+180)%360+360)%360-180;previous=lon;}assert(Math.abs(total-(720+30.778))<1e-7,'homepage must use two turns plus final alignment');});
test('country switches take the shortest route without pulling back',()=>{const {create}=require('./globe-flight.js');const points=[[135.778,34.998],[129.118,35.153],[121.571,25.027],[100.067,9.53],[179,10],[-179,10]];for(const fromPoint of points)for(const to of points){const from={lon:fromPoint[0],lat:fromPoint[1],zoom:2.6,focusMix:1,focused:true};const flight=create(from,to,{mode:'direct'});assert(flight.duration<=1200,'country switch should be direct and short');let previous=flight.sample(0).lon,total=0;for(let t=10;t<=flight.duration;t+=10){const sample=flight.sample(t);total+=Math.abs(((sample.lon-previous+180)%360+360)%360-180);previous=sample.lon;assert(Math.abs(sample.zoom-2.6)<1e-8,'direct switch must not pull back to globe overview');}assert(total<=180+1e-7,'country switch must follow shortest longitude arc');}});
test('intro is slower and direct flights follow the spherical shortest path',()=>{const {create}=require('./globe-flight.js');const d3scope={};vm.createContext(d3scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'vendor/d3.min.js'),'utf8'),d3scope);const {geoDistance}=d3scope.d3;assert.equal(create({lon:105,lat:25,zoom:1,focusMix:0},[135,35],{mode:'intro'}).duration,5000);for(const [a,b] of [[[0,80],[120,80]],[[179,10],[-179,10]],[[135.778,34.998],[100.067,9.53]],[[0,0],[180,0]],[[10,20],[10,20]]]){const f=create({lon:a[0],lat:a[1],zoom:2.6,focusMix:1},b,{mode:'direct'});let previous=a,total=0;for(let t=10;t<=f.duration;t+=10){const s=f.sample(t),point=[s.lon,s.lat];total+=geoDistance(previous,point);previous=point;}assert(Math.abs(total-geoDistance(a,b))<1e-7,'direct flight must have the same length as the great-circle shortest path');}});
test('country library lists all places and filters to a specific camera',()=>{const app=boot(false);app.nav[2].fire('click');assert.equal(app.nodes.get('#place-list').children.length,118);app.nodes.get('#place-query').value='高美濕地';app.nodes.get('#place-query').fire('input');assert.equal(app.nodes.get('#place-list').children.length,1);app.nodes.get('#place-list').children[0].fire('click');app.step(1300);assert.equal(app.api.getState().selected,'tw-531997');});
test('dense country markers fold into count clusters and keep the selected place visible',()=>{const app=boot(false);app.step(600);app.step(5800);app.nav[2].fire('click');app.step(7500);app.step(7520);const catalog=require('./catalog.js');const sel=catalog.places.find(p=>p.id===app.api.getState().selected);const shown=app.nodes.get('#markers').children.filter(b=>!b.hidden);const total=shown.reduce((n,b)=>n+(Number(b.dataset.count)||1),0);assert(shown.length>0&&shown.length<118,'taiwan markers were not clustered: '+shown.length);assert(shown.some(b=>Number(b.dataset.count)>1),'no cluster badge');assert(total<=118,'cluster counts exceed taiwan places');assert(shown.some(b=>String(b.attrs['aria-label']).includes(sel.name)),'selected place is not an anchor');});
if(failures.length) process.exitCode=1;
