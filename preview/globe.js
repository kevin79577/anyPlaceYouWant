/* Interactive globe prototype. D3 7.9.0 + Natural Earth 1:50m, bundled locally. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const root = $('#world'), canvas = $('#globe');
  if (!window.d3 || !window.SOMEWHERE_WORLD || !window.SomewhereFlight) {
    const message = document.createElement('p');
    message.className = 'error-banner';
    message.textContent = '地圖素材未能載入。請確認程式與 assets、vendor 資料夾完整，再重新整理。';
    root.append(message); return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) { $('#status').textContent = '此瀏覽器無法建立地圖畫布，請使用支援 Canvas 的瀏覽器。'; $('#status').classList.add('visible'); return; }
  const D = window.d3, geography = window.SOMEWHERE_WORLD;
  const interactionGeography = window.SOMEWHERE_WORLD_LOW || geography;
  const destinations = window.SomewhereCatalog ? window.SomewhereCatalog.places : [
    {id:'japan',iso:'JPN',country:'日本',name:'京都・東山',en:'KYOTO / JAPAN',point:[135.778,34.998],image:'assets/cinema.webp',alt:'京都東山暮色 AI 生成情境圖',title:'沿著暮色，走進京都。',subtitle:'東山・屋簷與街燈之間',description:'把步調留給石板路、屋簷與遠山。從東山的風景開始，想像一段不趕路的京都旅行。此圖片由 AI 生成，不代表該座標的實際鏡頭或當下景色。',zone:'Asia/Tokyo',aliases:['日本','京都','東山','japan','kyoto'],label:[20,-28]},
    {id:'korea',iso:'KOR',country:'韓國',name:'釜山・廣安里',en:'BUSAN / SOUTH KOREA',point:[129.118,35.153],image:'assets/atlas.webp',alt:'釜山海岸 AI 生成情境圖',title:'海與城市，相遇的地方。',subtitle:'廣安里・海岸的藍調時刻',description:'城市的燈火與海面的波光，替散步留下一個好理由。這是釜山廣安里的旅行氛圍提案；圖片由 AI 生成，直播來源尚未接入。',zone:'Asia/Seoul',aliases:['韓國','南韓','釜山','廣安里','korea','busan','gwangalli'],label:[-112,-45]},
    {id:'taiwan',iso:'TWN',country:'台灣',name:'台北・象山',en:'TAIPEI / TAIWAN',point:[121.571,25.027],image:'assets/taiwan.svg',alt:'台北城市天際線 SVG 概念插畫',title:'從山邊，望向日常。',subtitle:'象山・城市與天空的交界',description:'站在城市旁的一座山，重新看見熟悉的天際線。這幅畫面是 SVG 概念插畫，非現場照片；座標用於示範地圖定位，不代表已確認的攝影機位置。',zone:'Asia/Taipei',aliases:['台灣','臺灣','台北','臺北','象山','taiwan','taipei'],label:[20,14]},
    {id:'thailand',iso:'THA',country:'泰國',name:'蘇梅島・海灣',en:'KOH SAMUI / THAILAND',point:[100.067,9.53],image:'assets/play.webp',alt:'泰國熱帶海灣 AI 生成情境圖',title:'把今天，交給海風。',subtitle:'蘇梅島・一點遠方的藍',description:'椰影、海浪與慢下來的步調，讓熱帶海灣成為下一次出走的靈感。圖片由 AI 生成，並非這個座標的真實現場影像。',zone:'Asia/Bangkok',aliases:['泰國','蘇梅','蘇梅島','thailand','samui','koh samui'],label:[-115,2]}
  ];
  const ids = new Set(destinations.map(d => d.id));
  const countryRegions=[...new Map(destinations.map(d=>[d.iso,d])).values()];
  const countryKey=d=>d.countryKey||d.id;
  let libraryCountry='',libraryQuery='',libraryRegion='';
  const storageKey = 'somewhere-globe-saved-v1';
  let saved = [], storageWorks = true;
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(value)) saved = [...new Set(value.filter(x => ids.has(x)))]; } catch { storageWorks = false; }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // This is the explicitly requested motion preview. Keep its control local to
  // the page, instead of silently turning country transitions into zero ms.
  let motionEnabled=true;
  try { motionEnabled=localStorage.getItem('somewhere-globe-motion-v1')!=='off'; } catch {}
  const state = {lon:105,lat:25,zoom:1,selected:'japan',auto:!reducedMotion,dragging:false,flying:false,focused:false,focusMix:0};
  let width=0,height=0,dpr=1,radius=1,dirty=true,lastPaint=0,lastTick=0,frame=0,flight=null,pointer=null,toastTimer=0,settleTimer=0,fastUntil=0,entryTimer=0;
  const projection = D.geoOrthographic().clipAngle(90).precision(.45);
  const geoPath = D.geoPath(projection,ctx);
  const graticule = D.geoGraticule().step([20,20])();
  const sphere = {type:'Sphere'};
  const markerElements = new Map();
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const wrap=lon=>((lon+180)%360+360)%360-180;
  function selected(){return destinations.find(d=>d.id===state.selected);}
  function notify(text){$('#status').textContent=text;$('#status').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#status').classList.remove('visible'),2900);}
  function setAuto(value){state.auto=value && motionEnabled;$('#spin').setAttribute('aria-pressed',String(state.auto));$('#spin').setAttribute('aria-label',state.auto?'暫停自動旋轉':'開啟自動旋轉');dirty=true;}
  function stopMotion(){clearTimeout(entryTimer);entryTimer=0;setAuto(false);flight=null;state.flying=false;root.classList.remove('flying');}
  function syncMotionControl(){$('#motion-toggle').setAttribute('aria-pressed',String(motionEnabled));$('#motion-status').textContent=motionEnabled?'轉場動效：開':'轉場動效：關';}
  function toggleMotion(){motionEnabled=!motionEnabled;try{localStorage.setItem('somewhere-globe-motion-v1',motionEnabled?'on':'off');}catch{}syncMotionControl();if(!motionEnabled){const wasFlying=state.flying;stopMotion();if(wasFlying){const d=selected();state.lon=d.point[0];state.lat=d.point[1];state.zoom=width<700?2.3:2.6;state.focusMix=1;updateIsland();}dirty=true;}notify(motionEnabled?'轉場動效已開啟，點選國家或按「重播轉場」體驗。':'轉場動效已關閉，切換國家會直接定位。');}
  function updateTime(){const d=selected();$('#local-time').textContent='當地時間 '+new Intl.DateTimeFormat('zh-TW',{timeZone:d.zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}
  function updateSaved(){
    $('#saved-count').textContent=saved.length;
    const isSaved=saved.includes(state.selected);
    $('#island-save').textContent=isSaved?'♥':'♡';$('#island-save').setAttribute('aria-pressed',String(isSaved));$('#island-save').setAttribute('aria-label',isSaved?'取消收藏這個景點':'收藏這個景點');
    $('#detail-save').textContent=isSaved?'♥ 已收藏，點擊移除':'♡ 收藏這個地方';$('#detail-save').setAttribute('aria-pressed',String(isSaved));
    $('#saved-list').replaceChildren();
    if(!saved.length){const p=document.createElement('p');p.className='saved-empty';p.textContent='還沒有收藏。點選風景窗口的愛心，把心動留給下次出發。';$('#saved-list').append(p);}
    for(const id of saved){const d=destinations.find(x=>x.id===id);const item=document.createElement('div');item.className='saved-item';const go=document.createElement('button');go.className='saved-go';go.innerHTML=`<img src="${d.image}" alt=""><span><strong>${d.name}</strong><small>${d.en}</small></span>`;go.addEventListener('click',()=>{if(window.SomewhereExperience){window.SomewhereExperience.openPlace(id);return;}closeSaved();flyTo(id);});const remove=document.createElement('button');remove.className='saved-remove';remove.textContent='×';remove.setAttribute('aria-label','移除收藏'+d.name);remove.addEventListener('click',()=>toggleSave(id));item.append(go,remove);$('#saved-list').append(item);}
    window.SomewhereExperience?.savedRendered(saved);
  }
  function toggleSave(id=state.selected){if(!ids.has(id))return;const removed=saved.includes(id);saved=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id];try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{storageWorks=false;}updateSaved();window.SomewhereExperience?.savedChanged(id,removed);notify((saved.includes(id)?'已收藏這個風景。':'已移除收藏。')+(storageWorks?'':'目前僅暫存，瀏覽器無法持久保存。'));}
  function updateIsland(){const d=selected();$('#island-photo').src=d.image;$('#island-photo').alt=d.alt;
    // Places without their own image show the shared typographic tile instead of another place's photo.
    const typeTile=d.id!==countryKey(d)&&window.SomewhereExperience?.typeTile;$('#island-type').innerHTML=typeTile?typeTile(d):'';$('#island .image-label').textContent=typeTile?'此地點尚無風景圖':'風格示意圖 · 非所選地點現場';$('#island-country').textContent=d.en;$('#island-title').textContent=d.title;$('#island-desc').textContent=d.subtitle;$('#island-open').setAttribute('aria-label','展開'+d.name+'風景窗口');$('#island').hidden=false;$('#restore-island').hidden=true;document.querySelectorAll('[data-destination]').forEach(b=>{const active=state.focused && b.dataset.destination===countryKey(d);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});updateSaved();updateTime();if(window.SomewhereWeather)window.SomewhereWeather.selectPlace(d);renderPlaceLibrary();window.SomewhereExperience?.selectionChanged(d);}
  function renderPlaceLibrary(){const d=selected(),key=countryKey(d);if(libraryCountry!==key){libraryCountry=key;libraryQuery='';libraryRegion='';$('#place-query').value='';$('#place-region').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='全部地區';$('#place-region').append(all);for(const region of [...new Set(destinations.filter(p=>countryKey(p)===key).map(p=>p.region).filter(Boolean))]){const option=document.createElement('option');option.value=region;option.textContent=region;$('#place-region').append(option);}$('#place-region').value='';}const all=destinations.filter(p=>countryKey(p)===key);const filtered=all.filter(p=>(!libraryRegion||p.region===libraryRegion)&&(!libraryQuery||[p.name,p.region,...p.aliases].filter(Boolean).join(' ').toLowerCase().includes(libraryQuery)));$('#library-title').textContent=d.country+'・地點與來源';$('#library-count').textContent=`${all.length} 個地點 / ${all.reduce((n,p)=>n+(p.sourceCount||1),0)} 個來源入口 · 顯示 ${filtered.length} 個地點`;$('#place-list').replaceChildren();if(!filtered.length){const empty=document.createElement('p');empty.className='saved-empty';empty.textContent='沒有符合的地點，請更換關鍵字或地區。';$('#place-list').append(empty);}for(const p of filtered){const button=document.createElement('button');button.className='place-row'+(p.id===d.id?' selected':'');button.setAttribute('aria-pressed',String(p.id===d.id));const title=document.createElement('strong');title.textContent=p.name;const detail=document.createElement('small');detail.textContent=`${p.region||p.country} · ${p.sourceCount||1} 個來源 · ${p.embeddableCount?'可試播候選':'原站觀看'}`;button.append(title,detail);button.addEventListener('click',()=>{if(window.SomewhereExperience)window.SomewhereExperience.chooseMarker(p.id);else flyTo(p.id);if(width<700)toggleLibrary(false);});$('#place-list').append(button);}window.SomewhereExperience?.decorateLibrary(filtered);}
  function toggleLibrary(open){const visible=typeof open==='boolean'?open:$('#place-library').hidden;$('#place-library').hidden=!visible;$('#library-toggle').setAttribute('aria-expanded',String(visible));if(visible){setAuto(false);renderPlaceLibrary();}}
  function resize(){panelsAt=-1e9;const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;dpr=Math.min(window.devicePixelRatio||1,1.6);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);radius=width<700?Math.min(width*.68,height*.36):Math.min(width*.3,height*.44);dirty=true;}
  function setProjection(){const mobile=width<700;const x=mobile?width*.5:width*(.64-.16*state.focusMix);const y=mobile?height*.47:height*.49;const layout=window.SomewhereExperience?.mapLayout();projection.rotate([-state.lon,-state.lat,-5]).translate(layout?[width*layout.x,height*layout.y]:[x,y]).scale(radius*state.zoom).clipExtent([[-60,-60],[width+60,height+60]]);}// clip to the viewport: at 12x the globe is ~4000px wide and unclipped paths/shadows cost whole frames
  function visible(point){return D.geoDistance([state.lon,state.lat],point)<Math.PI/2-.015;}
  // Catalog text comes from harvested pages, so labels are built from text nodes, never innerHTML.
  const setLabel=(b,main,sub)=>b.querySelector('.marker-label').replaceChildren(main,Object.assign(document.createElement('small'),{textContent:sub}));
  function makeMarkers(){for(const d of destinations){const b=document.createElement('button');b.className='geo-marker';b.setAttribute('aria-label','飛往'+d.name);b.innerHTML='<span class="marker-dot"></span><span class="marker-label"></span>';setLabel(b,d.country,d.en.split(' / ')[0]);b.addEventListener('click',()=>{const X=window.SomewhereExperience,focused=state.focused,cluster=Number(b.dataset.count)>1,region=b.dataset.region;
      // A cluster click always resets the region filter: its own region if single-region, otherwise all regions.
      if(cluster&&focused){$('#place-region').value=region;$('#place-region').dispatchEvent(new Event('change'));}
      // Mixed cluster: zoom toward its members. At the cap only same-region markers merge, so every cluster there is single-region.
      if(cluster&&!region&&focused){const m=b.members;zoomTo([m.reduce((s,p)=>s+p.point[0],0)/m.length,m.reduce((s,p)=>s+p.point[1],0)/m.length],state.zoom*2.2);return;}
      if(cluster&&focused){flyTo(d.id);return;}// single-region cluster: filter the list and pan to it
      if(X)X.chooseMarker(d.id);else flyTo(d.id);});$('#markers').append(b);markerElements.set(d.id,b);}}
  // Greedy screen-space clustering: a marker within CLUSTER_PX of an earlier anchor folds into it as a count badge.
  // The selected place goes first, so it is always an anchor and keeps its selected styling.
  // At MAX_ZOOM only same-region markers merge: many places share one regional reference point, so mixed clusters there could never split.
  const CLUSTER_PX=36;let panels=[],panelsAt=-1e9;
  function positionMarkers(){const anchors=[];const order=[selected(),...destinations.filter(d=>d.id!==state.selected)];for(const d of order){const b=markerElements.get(d.id),p=projection(d.point);const onScreen=visible(d.point)&&p[0]>15&&p[0]<width-15&&p[1]>88&&p[1]<height-130;const show=onScreen&&(state.focused?countryKey(d)===countryKey(selected()):d.id===countryKey(d));if(!show)continue;const deepest=state.zoom>=MAX_ZOOM-.01;const near=anchors.find(a=>Math.hypot(a.x-p[0],a.y-p[1])<CLUSTER_PX&&(!deepest||a.d.region===d.region));if(near){near.members.push(d);continue;}
      // Deepest level keeps different regions apart, so nudge a dot off any neighbour closer than 16px (else its button covers the other).
      let x=p[0],y=p[1];for(let k=1;deepest&&k<=12&&anchors.some(a=>Math.hypot(a.x-x,a.y-y)<16);k++){x=p[0]+Math.cos(k*2.4)*(10+4*k);y=p[1]+Math.sin(k*2.4)*(10+4*k);}
      anchors.push({d,b,x,y,members:[d]});}
    const shown=new Set(anchors.map(a=>a.d.id));for(const [id,b] of markerElements){const hide=!shown.has(id);if(b.hidden!==hide)b.hidden=hide;}
    // Focused country: every marker shows its label when there is room. Labels are placed greedily (selected first, then bigger clusters),
    // to the right of the dot or else to the left; a label that would cover another label or dot stays hidden until hover/focus.
    const hit=(a,c)=>a.l<c.r&&a.r>c.l&&a.t<c.b&&a.b>c.t;
    // Labels also keep clear of the scene window and the place panel; their boxes are re-read at most every 400ms, not every frame.
    if(performance.now()-panelsAt>400){panelsAt=performance.now();panels=['#island','#place-library'].map(q=>$(q).getBoundingClientRect()).filter(r=>r&&r.width).map(r=>({l:r.left-6,r:r.right+6,t:r.top-6,b:r.bottom+6}));}
    const placed=[...panels];
    if(state.focused)anchors.sort((a,c)=>(c.d.id===state.selected)-(a.d.id===state.selected)||c.members.length-a.members.length);
    for(const a of anchors){const {d,b,x,y,members}=a;const n=members.length,region=n>1&&d.region&&members.every(m=>m.region===d.region)?d.region:'';b.style.left=x+'px';b.style.top=y+'px';b.classList.toggle('selected',d.id===state.selected);b.classList.toggle('cluster',n>1);b.dataset.count=n>1?n:'';b.dataset.region=region;b.members=members;
      const short=d.name.split(/・| - /).pop(),main=n>1?region||d.country:state.focused?short:d.country,sub=n>1?n+' 個地點':state.focused?d.region||d.country:d.en.split(' / ')[0];
      const labelKey=main+'|'+sub;if(b.dataset.labelKey!==labelKey){b.dataset.labelKey=labelKey;b.setAttribute('aria-label',n>1?(region?`${region}一帶 ${n} 個地點：選取${d.name}並篩選清單`:`${d.name}一帶 ${n} 個地點：放大這一帶`):(state.focused?'觀看':'飛往')+d.name);setLabel(b,main,sub);}
      const label=b.querySelector('.marker-label');let side='right',off=false;
      if(state.focused){const w=Math.max(main.length*12.5,sub.length*10.5)+22,box=l=>({l,r:l+w,t:y-14,b:y+26});// estimated label box (compact focus style in experience-ui.css)
        const free=r=>r.l>8&&r.r<width-8&&!placed.some(p=>hit(r,p))&&!anchors.some(o=>o!==a&&hit(r,{l:o.x-9,r:o.x+9,t:o.y-9,b:o.y+9}));
        const right=box(x+11),left=box(x-11-w);if(free(right))placed.push(right);else if(free(left)){placed.push(left);side='left';}else off=true;}
      b.classList.toggle('label-off',off);label.style.transform=state.focused?(side==='left'?'translate(calc(-100% - 12px),-12px)':'translate(12px,-12px)'):state.zoom<1.45?`translate(${d.label[0]}px,${d.label[1]}px)`:'translate(12px,-12px)';label.style.marginLeft='-12px';}
    const d=selected(),p=projection(d.point),card=$('#island');if(!visible(d.point)||card.hidden||state.dragging||state.flying){$('#connection-path').setAttribute('d','');return;}const box=card.getBoundingClientRect(),surface=root.getBoundingClientRect();const x=box.left-surface.left+18,y=box.top-surface.top+65;$('#connection-path').setAttribute('d',`M${p[0]},${p[1]} C${p[0]+60},${p[1]-50} ${x-70},${y-60} ${x},${y}`);
  }
  function draw(){
    if(!width||!height)return;const moving=state.dragging||state.flying||state.auto||performance.now()<fastUntil,dim=state.focused?state.focusMix:0;
    // Background land uses the coarse data at the global view, while moving, and always in a focused country (it is dimmed and blurred there).
    // The focused country itself is always drawn from the detailed data, so its outline no longer changes while dragging.
    const renderGeography=state.focused||moving||state.zoom<1.8?interactionGeography:geography;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);setProjection();const [cx,cy]=projection.translate(),r=projection.scale();
    ctx.save();ctx.shadowColor='#6a9e9322';ctx.shadowBlur=35;ctx.shadowOffsetY=18;ctx.beginPath();geoPath(sphere);const sea=ctx.createRadialGradient(cx-r*.35,cy-r*.5,r*.05,cx,cy,r);sea.addColorStop(0,'#d8efee');sea.addColorStop(.65,'#b9dbd9');sea.addColorStop(.94,'#c5e1dc');sea.addColorStop(1,'#eef5e8');ctx.fillStyle=sea;ctx.fill();ctx.restore();
    ctx.save();ctx.beginPath();geoPath(sphere);ctx.clip();ctx.strokeStyle='#ffffff42';ctx.lineWidth=.6;ctx.beginPath();geoPath(graticule);ctx.stroke();
    ctx.save();if(dim){ctx.globalAlpha=1-.55*dim;if(!moving&&'filter' in ctx)ctx.filter='blur('+(6*dim).toFixed(1)+'px)';}// focus mode: the rest of the world recedes (blur only when idle: it costs a third of a frame in software rendering)
    ctx.save();ctx.translate(1.8,4);ctx.beginPath();geoPath(renderGeography);ctx.fillStyle='#819f822a';ctx.shadowColor='#658d7929';ctx.shadowBlur=5;ctx.fill();ctx.restore();
    ctx.beginPath();geoPath(renderGeography);const land=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);land.addColorStop(0,'#fffdf2');land.addColorStop(.5,'#f6f5e8');land.addColorStop(1,'#e3e8d3');ctx.fillStyle=land;ctx.fill();ctx.strokeStyle='#c2cab486';ctx.lineWidth=.45;ctx.stroke();ctx.restore();
    if(dim){ctx.beginPath();geoPath(sphere);ctx.fillStyle='rgba(228,241,237,'+(.42*dim).toFixed(3)+')';ctx.fill();}// frosted veil over the background
    for(const d of countryRegions){const sel=state.focused&&d.iso===selected().iso,f=(sel?geography:renderGeography).features.find(f=>f.properties.iso===d.iso);if(!f)continue;ctx.save();if(sel){ctx.shadowColor='#4f7a6a52';ctx.shadowBlur=24;ctx.shadowOffsetY=9;}else ctx.globalAlpha=1-.8*dim;ctx.beginPath();geoPath(f);ctx.fillStyle=sel?'#ecf3bc':'#e8edda';ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle=sel?'#c6d571':'#c1d1b4';ctx.lineWidth=.75;ctx.stroke();ctx.restore();}
    ctx.restore();ctx.beginPath();geoPath(sphere);ctx.strokeStyle='#ffffffb0';ctx.lineWidth=1.4;ctx.stroke();
    positionMarkers();$('#camera-coords').textContent=`${Math.abs(state.lat).toFixed(1)}° ${state.lat>=0?'N':'S'} / ${Math.abs(wrap(state.lon)).toFixed(1)}° ${wrap(state.lon)>=0?'E':'W'}`;
    $('#camera-label').textContent=state.flying?'TRAVELLING TO '+selected().en.split(' / ')[0]:state.focused?'A LITTLE CLOSER / '+selected().en.split(' / ')[0]:'GLOBAL VIEW';
    dirty=false;
  }
  function flyTo(id,options={}){const d=destinations.find(x=>x.id===id);if(!d)return;const mode=options.mode||(state.focused?'direct':'intro');
    // Picking a place inside the same country keeps a deeper zoom, so a cluster drill-down is not thrown back to 2.6x.
    const local=state.focused&&countryKey(d)===countryKey(selected()),keepZoom=local&&state.zoom>(width<700?2.3:2.6)?state.zoom:undefined;
    stopMotion();clearTimeout(settleTimer);state.dragging=false;root.classList.remove('dragging');state.selected=id;state.focused=true;root.classList.add('exploring');updateIsland();const choreography=window.SomewhereFlight.create(state,d.point,{mode,mobile:width<700,zoom:keepZoom,duration:local?450:undefined,reducedMotion:!motionEnabled});
    if(!local){state.flying=true;root.classList.add('flying');}// inside one country the camera just pans: markers, heading and panels stay on screen
    flight={start:performance.now(),choreography};dirty=true;}
  function reset(){stopMotion();state.focused=false;state.dragging=false;root.classList.remove('exploring','dragging');state.lon=105;state.lat=25;state.zoom=1;state.focusMix=0;updateIsland();$('#camera-label').textContent='GLOBAL VIEW';dirty=true;notify('已回到全球視角，拖曳地球繼續探索。');}
  // Regional exploration only (Natural Earth 1:50m): 12x keeps Taiwan's coast readable, far from street level.
  const MAX_ZOOM=12;
  // Camera-only move (no selection change, no "flying" state), so markers stay visible and split apart as it zooms.
  function zoomTo(point,zoom){stopMotion();clearTimeout(settleTimer);fastUntil=performance.now()+700;settleTimer=setTimeout(()=>{fastUntil=0;dirty=true;},720);// coarse geography while it animates, then one detailed redraw
    flight={start:performance.now(),choreography:window.SomewhereFlight.create(state,point,{mode:'direct',zoom:clamp(zoom,.7,MAX_ZOOM),duration:700,reducedMotion:!motionEnabled})};dirty=true;}
  function changeZoom(factor){stopMotion();state.zoom=clamp(state.zoom*factor,.7,MAX_ZOOM);fastUntil=performance.now()+180;clearTimeout(settleTimer);settleTimer=setTimeout(()=>{fastUntil=0;dirty=true;},180);dirty=true;}
  function next(){const others=destinations.filter(d=>d.id!==state.selected);flyTo(others[Math.floor(Math.random()*others.length)].id);}
  function openDetails(){stopMotion();const d=selected();window.SomewhereExperience?.detailsOpened(d);$('#detail-photo').src=d.image;$('#detail-photo').alt=d.alt;$('#detail-location').textContent=d.en;$('#detail-title').textContent=d.name;$('#detail-description').textContent=d.description;$('#detail-coordinates').textContent=`示範定位 ${d.point[1].toFixed(3)}° N / ${d.point[0].toFixed(3)}° E`;if(window.SomewhereMedia)window.SomewhereMedia.selectDestination(d.id);updateSaved();if(!$('#destination-dialog').open)$('#destination-dialog').showModal();}
  function closeSaved(){$('#saved-panel').hidden=true;$('#saved-toggle').setAttribute('aria-expanded','false');}
  function tick(now){const delta=lastTick?Math.min(now-lastTick,80):0;lastTick=now;if(flight){const camera=flight.choreography.sample(now-flight.start);state.lon=camera.lon;state.lat=camera.lat;state.zoom=camera.zoom;state.focusMix=camera.focusMix;dirty=true;if(camera.done){flight=null;state.flying=false;root.classList.remove('flying');}}
    else if(state.auto&&!document.hidden&&!$('#destination-dialog').open){state.lon=wrap(state.lon+delta*.0014);dirty=true;}
    if(dirty&&now-lastPaint>=32){draw();lastPaint=now;}frame=requestAnimationFrame(tick);
  }
  canvas.addEventListener('pointerdown',event=>{if(pointer||event.button!==0)return;stopMotion();canvas.setPointerCapture(event.pointerId);pointer={id:event.pointerId,x:event.clientX,y:event.clientY,lon:state.lon,lat:state.lat,moved:false};});
  canvas.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.hypot(dx,dy)>4){pointer.moved=true;state.dragging=true;root.classList.add('dragging');}if(pointer.moved){state.lon=wrap(pointer.lon-dx*.25/state.zoom);state.lat=clamp(pointer.lat+dy*.25/state.zoom,-80,80);dirty=true;}});
  function endPointer(event,cancelled=false){if(!pointer||event.pointerId!==pointer.id)return;const moved=pointer.moved;pointer=null;state.dragging=false;root.classList.remove('dragging');dirty=true;if(cancelled||moved)return;const box=canvas.getBoundingClientRect();const point=projection.invert([event.clientX-box.left,event.clientY-box.top]);if(!point||!Number.isFinite(point[0]))return;const projected=projection(point);if(Math.hypot(projected[0]-(event.clientX-box.left),projected[1]-(event.clientY-box.top))>3)return;const country=geography.features.find(f=>D.geoContains(f,point));if(country){const d=destinations.find(d=>d.iso===country.properties.iso);if(d)flyTo(d.id);else notify('這個地區尚未收錄內容。先探索日本、韓國、台灣或泰國。');}}
  canvas.addEventListener('pointerup',event=>endPointer(event));canvas.addEventListener('pointercancel',event=>endPointer(event,true));canvas.addEventListener('lostpointercapture',event=>{if(pointer&&pointer.id===event.pointerId)endPointer(event,true);});
  canvas.addEventListener('wheel',event=>{event.preventDefault();changeZoom(Math.exp(-clamp(event.deltaY,-150,150)*.0015));},{passive:false});
  canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))return;event.preventDefault();stopMotion();if(event.key==='Home'){reset();return;}if(event.key==='+'||event.key==='=')changeZoom(1.15);else if(event.key==='-')changeZoom(1/1.15);else{state.lon=wrap(state.lon+(event.key==='ArrowLeft'?-8:event.key==='ArrowRight'?8:0));state.lat=clamp(state.lat+(event.key==='ArrowUp'?6:event.key==='ArrowDown'?-6:0),-80,80);dirty=true;}});
  document.querySelectorAll('[data-destination]').forEach(button=>{const key=button.dataset.destination;const count=destinations.filter(p=>countryKey(p)===key).length;const first=destinations.find(p=>p.id===key);if(first)button.textContent=first.country+' '+count;button.addEventListener('click',()=>{if(window.SomewhereExperience){window.SomewhereExperience.chooseCountry(key);return;}flyTo(key);toggleLibrary(true);});});
  $('#library-toggle').addEventListener('click',()=>toggleLibrary());$('#library-close').addEventListener('click',()=>toggleLibrary(false));$('#place-query').addEventListener('input',()=>{libraryQuery=$('#place-query').value.trim().toLowerCase();renderPlaceLibrary();});$('#place-region').addEventListener('change',()=>{libraryRegion=$('#place-region').value;renderPlaceLibrary();});
  $('#begin').addEventListener('click',()=>window.SomewhereExperience?window.SomewhereExperience.chooseCountry('japan'):flyTo('japan'));$('#reset').addEventListener('click',reset);$('#zoom-in').addEventListener('click',()=>changeZoom(1.2));$('#zoom-out').addEventListener('click',()=>changeZoom(1/1.2));$('#spin').addEventListener('click',()=>{if(!motionEnabled){notify('請先開啟左上角的「轉場動效」。');return;}clearTimeout(entryTimer);entryTimer=0;flight=null;state.flying=false;root.classList.remove('flying');setAuto(!state.auto);});
  $('#motion-toggle').addEventListener('click',toggleMotion);$('#replay-flight').addEventListener('click',()=>{if(!motionEnabled){notify('目前動效已關閉，先點「轉場動效：關」即可開啟。');return;}flyTo(state.focused?state.selected:'japan',{mode:'intro'});});
  $('#island-open').addEventListener('click',openDetails);$('#island-details').addEventListener('click',openDetails);$('#island-save').addEventListener('click',()=>toggleSave());$('#detail-save').addEventListener('click',()=>toggleSave());$('#detail-next').addEventListener('click',()=>{if(window.SomewhereExperience){window.SomewhereExperience.nextPlace();return;}$('#destination-dialog').close();next();});$('#dialog-close').addEventListener('click',()=>window.SomewhereExperience?window.SomewhereExperience.closeDetailView():$('#destination-dialog').close());
  $('#destination-dialog').addEventListener('click',event=>{if(event.target!==$('#destination-dialog'))return;const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();});
  $('#island-dismiss').addEventListener('click',()=>{$('#island').hidden=true;$('#restore-island').hidden=false;dirty=true;});$('#restore-island').addEventListener('click',()=>{updateIsland();dirty=true;});
  $('#saved-toggle').addEventListener('click',()=>{if(window.SomewhereExperience){window.SomewhereExperience.showSaved();return;}const open=$('#saved-panel').hidden;$('#saved-panel').hidden=!open;$('#saved-toggle').setAttribute('aria-expanded',String(open));if(open){setAuto(false);updateSaved();}});$('#saved-close').addEventListener('click',closeSaved);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeSaved();}});
  const observer=new ResizeObserver(resize);observer.observe(root);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden)setAuto(false);else dirty=true;});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);clearInterval(clock);clearTimeout(toastTimer);clearTimeout(settleTimer);clearTimeout(entryTimer);observer.disconnect();});
  // The scene window and place panel move with their own CSS animations; re-place the labels once those settle.
  for(const q of ['#island','#place-library'])for(const type of ['transitionend','animationend'])$(q).addEventListener(type,e=>{if(e.target===e.currentTarget){panelsAt=-1e9;dirty=true;}});
  makeMarkers();resize();updateIsland();syncMotionControl();setAuto(!reducedMotion);draw();frame=requestAnimationFrame(tick);const clock=setInterval(updateTime,30000);
  if(motionEnabled)entryTimer=setTimeout(()=>{entryTimer=0;if(!state.focused&&!state.dragging&&!document.hidden)flyTo('japan');},450);
  // Read-only state plus explicit UI actions support prototype verification.
  window.SomewhereGlobe={getState:()=>({...state,saved:[...saved],motionEnabled}),flyTo,reset,changeZoom,toggleSave,openDetails,toggleLibrary,stopMotion,refreshLibrary:renderPlaceLibrary,refreshSaved:updateSaved,invalidate:()=>{dirty=true;},finishFlight:()=>{const d=selected();stopMotion();state.lon=d.point[0];state.lat=d.point[1];state.zoom=width<700?2.3:2.6;state.focusMix=1;dirty=true;},restoreCamera:view=>{stopMotion();for(const k of ['lon','lat','zoom','focusMix'])if(Number.isFinite(view[k]))state[k]=view[k];state.focused=!!view.focused;if(ids.has(view.selected))state.selected=view.selected;root.classList.toggle('exploring',state.focused);updateIsland();dirty=true;}};
})();
