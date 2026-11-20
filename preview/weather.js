(function(root){
 'use strict';
 const cache=new Map(),ttl=10*60*1000;
 function describe(code){if(code===0)return '晴朗';if([1,2].includes(code))return '晴時多雲';if(code===3)return '陰天';if([45,48].includes(code))return '霧';if([51,53,55,56,57].includes(code))return '毛毛雨';if([61,63,65,66,67].includes(code))return '下雨';if([71,73,75,77].includes(code))return '降雪';if([80,81,82].includes(code))return '陣雨';if([85,86].includes(code))return '陣雪';if([95,96,99].includes(code))return '雷雨';return '天氣狀況未提供';}
 function buildUrl(place){const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',place.point[1]);u.searchParams.set('longitude',place.point[0]);u.searchParams.set('current','temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day,cloud_cover,pressure_msl');u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max');u.searchParams.set('timezone',place.zone);u.searchParams.set('timeformat','unixtime');u.searchParams.set('forecast_days','1');return u.href;}
 function parse(data){const c=data.current,d=data.daily||{};if(!c||!Number.isFinite(c.temperature_2m)||!Number.isFinite(c.time))throw Error('invalid-weather-data');return {temperature:c.temperature_2m,feelsLike:c.apparent_temperature,humidity:c.relative_humidity_2m,wind:c.wind_speed_10m,precipitation:c.precipitation,code:c.weather_code,isDay:c.is_day,time:c.time,received:Date.now(),cloud:c.cloud_cover,pressure:c.pressure_msl,
  // today's range and sun times are extras: the card still works when the daily block is missing
  high:d.temperature_2m_max?.[0],low:d.temperature_2m_min?.[0],sunrise:d.sunrise?.[0],sunset:d.sunset?.[0],uv:d.uv_index_max?.[0]};}
 const format=(value,suffix)=>Number.isFinite(value)?Math.round(value*10)/10+suffix:'—';
 // Which drawn icon (an SVG symbol in experience.html, id wx-<name>) stands for a WMO weather code.
 function icon(code,isDay){const night=isDay===0;if(code===0)return night?'moon':'sun';if(code===1||code===2)return night?'cloud':'partly';if(code===45||code===48)return 'fog';if((code>=51&&code<=67)||(code>=80&&code<=82))return 'rain';if((code>=71&&code<=77)||code===85||code===86)return 'snow';if(code>=95&&code<=99)return 'storm';return 'cloud';}
 const uvLevel=v=>v<3?'低':v<6?'中':v<8?'高':v<11?'甚高':'極高';
 // The tiles of the detail card: [icon, label, value, optional 0-100 bar].
 function facts(data){return [['drop','濕度',format(data.humidity,'%'),data.humidity],['wind','風速',format(data.wind,' km/h')],['rain','降水',format(data.precipitation,' mm')],['cloud','雲量',format(data.cloud,'%')],['gauge','氣壓',Number.isFinite(data.pressure)?Math.round(data.pressure)+' hPa':'—'],['sun','紫外線最高',Number.isFinite(data.uv)?format(data.uv,'')+' '+uvLevel(data.uv):'—']];}
 if(!root.document){if(typeof module!=='undefined'&&module.exports)module.exports={describe,buildUrl,parse,icon,facts};return;}
 const $=s=>root.document.querySelector(s);let selected=null,token=0,controller=null,status='idle';
 const make=(tag,cls,text)=>{const e=root.document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const svg=(name,cls)=>{const s=make('span','wx-icon'+(cls?' '+cls:''));s.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#wx-'+name+'"/></svg>';return s;};// name is one of our own constants
 const clock=t=>new Intl.DateTimeFormat('zh-TW',{timeZone:selected.zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t*1000));
 // Detail card (place page and stream panel): big drawn icon and temperature, today's range and sun times, then one tile per reading.
 function paintDetail(el,data){
  const now=make('div','wx-now'),main=make('div','wx-main'),side=make('div','wx-side');
  main.append(make('p','weather-headline',format(data.temperature,'°C')),make('p','wx-sub',describe(data.code)+'・體感 '+format(data.feelsLike,'°C')));
  if(Number.isFinite(data.high)&&Number.isFinite(data.low)){const p=make('p');p.append(svg('up'),make('span','',Math.round(data.high)+'°'),svg('down'),make('span','',Math.round(data.low)+'°'));side.append(p);}
  if(Number.isFinite(data.sunrise)&&Number.isFinite(data.sunset)){const p=make('p');p.append(svg('sunrise'),make('span','',clock(data.sunrise)),svg('sunset'),make('span','',clock(data.sunset)));side.append(p);}
  now.append(svg(icon(data.code,data.isDay),'wx-big'),main,side);
  const grid=make('div','wx-grid');
  for(const [name,label,value,bar] of facts(data)){const tile=make('div','wx-tile'),head=make('span','wx-label');head.append(svg(name),make('span','',label));tile.append(head,make('b','',value));if(Number.isFinite(bar)){const m=make('meter');m.min=0;m.max=100;m.value=bar;tile.append(m);}grid.append(tile);}
  el.append(now,grid);
 }
 function paint(data,message){
  for(const target of ['#weather-island','#weather-detail']){const el=$(target);if(!el)continue;el.replaceChildren();
   if(data&&target==='#weather-detail'){paintDetail(el,data);el.append(make('p','weather-time','資料時間 '+new Intl.DateTimeFormat('zh-TW',{timeZone:selected.zone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.time*1000))+'（當地）'),make('p','weather-precision',selected.coordinatePrecision+' · 氣象模型估算，非攝影機現場量測'));continue;}
   const headline=root.document.createElement('p');headline.className='weather-headline';headline.textContent=data?`${data.isDay===0?'☾':'☀'} ${format(data.temperature,'°C')} · ${describe(data.code)}`:message;el.append(headline);if(data){const details=root.document.createElement('p');details.className='weather-facts';details.textContent=`體感 ${format(data.feelsLike,'°C')}　濕度 ${format(data.humidity,'%')}　風速 ${format(data.wind,' km/h')}　降水 ${format(data.precipitation,' mm')}`;el.append(details);const time=root.document.createElement('p');time.className='weather-time';time.textContent='資料時間 '+new Intl.DateTimeFormat('zh-TW',{timeZone:selected.zone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(data.time*1000))+'（當地）';el.append(time);}const note=root.document.createElement('p');note.className='weather-precision';note.textContent=selected?selected.coordinatePrecision+' · 氣象模型估算，非攝影機現場量測':'';el.append(note);}
  if($('#weather-state'))$('#weather-state').textContent=status==='loading'?'更新中…':status==='error'?'暫無資料':status==='cached'?'快取資料':'Open-Meteo';
 }
 async function selectPlace(place,force=false){if(!place)return;if(selected&&selected.id===place.id&&status==='loading'&&!force)return;selected=place;const request=++token;if(controller)controller.abort();controller=new AbortController();const key=place.point.join(',');const saved=cache.get(key);if(!force&&saved&&Date.now()-saved.received<ttl){status='cached';paint(saved);return;}status='loading';paint(null,'正在取得當地天氣…');const timeout=setTimeout(()=>controller&&request===token&&controller.abort(),12000);
  try{if(typeof root.fetch!=='function')throw Error('fetch-unavailable');const response=await root.fetch(buildUrl(place),{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const data=parse(await response.json());if(request!==token)return;cache.set(key,data);status='ready';paint(data);}catch(error){if(request!==token)return;status='error';paint(null,'天氣暫時無法取得，請稍後重試。');}finally{clearTimeout(timeout);}
 }
 if($('#weather-refresh'))$('#weather-refresh').addEventListener('click',()=>selected&&selectPlace(selected,true));
 root.addEventListener('pagehide',()=>{token++;if(controller)controller.abort();});
 root.SomewhereWeather={selectPlace,getState:()=>({place:selected&&selected.id,status})};
})(typeof window!=='undefined'?window:globalThis);
