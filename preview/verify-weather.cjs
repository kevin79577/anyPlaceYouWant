const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const catalog=require('./catalog.js');
const {parse,buildUrl}=require('./weather.js');
for(const p of catalog.places){assert(Array.isArray(p.point)&&p.point.length===2&&p.point.every(Number.isFinite));assert(p.point[0]>=-180&&p.point[0]<=180&&p.point[1]>=-90&&p.point[1]<=90);assert(catalog.sources[p.id].length>0);assert.equal(new URL(buildUrl(p)).hostname,'api.open-meteo.com');for(const s of catalog.sources[p.id]){assert.equal(new URL(s.url).protocol,'https:');assert.equal(new URL(s.reference).protocol,'https:');if(s.videoId)assert(/^[\w-]{11}$/.test(s.videoId));}}
assert.equal(new Set(catalog.places.map(p=>p.id)).size,catalog.places.length);
assert.throws(()=>parse({current:{temperature_2m:null,time:1000}}));
const payload=t=>({current:{temperature_2m:t,apparent_temperature:0,relative_humidity_2m:0,wind_speed_10m:0,precipitation:0,weather_code:0,is_day:1,time:1794437100}});
const nodes=new Map(),requests=[];
class E{constructor(){this.children=[];this.events={};}append(...a){this.children.push(...a)}replaceChildren(){this.children=[]}addEventListener(type,fn){this.events[type]=fn}}
const scope={document:{querySelector(key){if(!nodes.has(key))nodes.set(key,new E());return nodes.get(key)},createElement(){return new E()}},URL,AbortController,Intl,console,setTimeout(){return 1},clearTimeout(){},addEventListener(){},fetch(url,options){return new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));}};scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'weather.js'),'utf8'),scope);
(async()=>{
 const first=scope.SomewhereWeather.selectPlace(catalog.places.find(p=>p.id==='japan'));const second=scope.SomewhereWeather.selectPlace(catalog.places.find(p=>p.id==='taiwan'));assert(requests[0].options.signal.aborted);
 requests[1].resolve({ok:true,json:async()=>payload(20)});await second;requests[0].resolve({ok:true,json:async()=>payload(9.4)});await first;assert.equal(scope.SomewhereWeather.getState().place,'taiwan');assert(nodes.get('#weather-island').children[0].textContent.includes('20°C'));assert(nodes.get('#weather-detail').children[1].textContent.includes('0%'));
 await scope.SomewhereWeather.selectPlace(catalog.places.find(p=>p.id==='taiwan'));assert.equal(requests.length,2);assert.equal(scope.SomewhereWeather.getState().status,'cached');
 const retry=scope.SomewhereWeather.selectPlace(catalog.places.find(p=>p.id==='taiwan'),true);requests[2].resolve({ok:false,status:500});await retry;assert.equal(scope.SomewhereWeather.getState().status,'error');assert(!nodes.get('#weather-island').children[0].textContent.includes('20°C'));
 console.log('PASS: '+catalog.places.length+' place coordinates and source links; per-place weather, request cancellation, stale-response protection, zero readings, cache and error reset.');
})().catch(error=>{console.error(error);process.exitCode=1});
