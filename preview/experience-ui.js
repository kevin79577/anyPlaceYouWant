/* Liquid Glass journey. Real catalogue, local collections and explicit provider playback. */
(() => {
  'use strict';
  const G=window.SomewhereGlobe,C=window.SomewhereCatalog;
  if(!G||!C)return;
  const $=s=>document.querySelector(s),root=$('#world');
  // Motion preview controls and build info are for reviewers only: open with ?debug.
  root.classList.toggle('debug',new URLSearchParams(location.search).has('debug'));
  // Beta feedback form (e.g. a Google Form). Empty = feedback links stay hidden. Required before public launch: docs/上線檢查清單.md
  const FEEDBACK_URL='';
  if(FEEDBACK_URL)document.querySelectorAll('[data-feedback]').forEach(a=>{a.href=FEEDBACK_URL;a.hidden=false;});
  const countries=C.countries,places=C.places;
  const byId=id=>places.find(p=>p.id===id);
  const key=p=>p.countryKey||p.id;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const countryNames={japan:'JAPAN',korea:'SOUTH KOREA',taiwan:'TAIWAN',thailand:'THAILAND'};
  const countryCopy={japan:'沿著街道、山景與季節，發現日本的另一面。',korea:'從海岸到城市，尋找下一個讓你停留的角落。',taiwan:'從山海到街巷，重新看見島嶼的日常。',thailand:'把步調交給海風，讓遠方慢慢靠近。'};
  const moodPatterns={'海邊':/海|灣|灘|港|beach|bay|coast|ocean/i,'山景':/山|嶺|峰|森林|mountain|forest/i,'城市':/市|街|路|橋|塔|站|城|city|street|tower/i,'日落':/夕|日落|西子|高美|夕陽|sunset/i};
  let current={view:'home',id:'',index:0},busy=false,ignoreDetailClose=0,ignoreSearchClose=0;
  let savedCountry='',searchCountry='',searchLimit=24,period=7,undo=null,undoTimer=0;
  let lastExplore={view:'home',id:''},detailParent='country',sheetExpanded=false,seenEntry=false;
  try{seenEntry=sessionStorage.getItem('somewhere-entry-seen')==='yes';}catch{}
  function rememberEntry(){seenEntry=true;try{sessionStorage.setItem('somewhere-entry-seen','yes');}catch{}}
  function routeHash(s){return '#'+s.view+(s.id?'/'+encodeURIComponent(s.id):'');}
  function capture(){return {...current,flow:true,camera:G.getState(),library:{query:$('#place-query').value,region:$('#place-region').value,scroll:$('#place-list').scrollTop||0,expanded:sheetExpanded},savedCountry,savedScroll:$('#saved-panel').scrollTop||0,searchCountry,query:$('#global-query').value,searchScroll:$('#global-results').scrollTop||0,searchLimit,period,storiesCountry:$('#stories-country').value,detailParent,lastExplore};}
  function closeDetail(){if($('#destination-dialog').open){ignoreDetailClose++;$('#destination-dialog').close();}}
  function closeSearch(){if($('#search-dialog').open){ignoreSearchClose++;$('#search-dialog').close();}}
  function syncNavigation(){
    const section=current.view==='saved'?'saved':current.view==='stories'?'stories':'explore';
    for(const [id,name] of [['#nav-explore','explore'],['#nav-stories','stories'],['#nav-saved','saved']]){if(section===name)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');}
    document.querySelectorAll('[data-mobile-nav]').forEach(b=>{if(b.dataset.mobileNav===section)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    $('#nav-saved-count').textContent=G.getState().saved.length;
  }
  function syncCountry(){
    const d=byId(G.getState().selected),k=key(d),items=places.filter(p=>key(p)===k);
    $('#breadcrumb-country').textContent=d.country;
    $('#breadcrumb-section').textContent=current.view==='locations'?'／ 所有地點':'';
    $('#country-heading').textContent=current.view==='locations'?'探索'+d.country+'的每一面。':'深入探索'+d.country+'。';
    $('#country-eyebrow').textContent=countryNames[k]+' / '+items.length+' WINDOWS';
    $('#country-summary').textContent=countryCopy[k];
    $('#all-places').hidden=current.view==='locations';
    $('#library-title').textContent=d.country+(current.view==='locations'?'・所有地點':'・從這裡開始');
  }
  function apply(state,{restore=false,keepCamera=false}={}){
    busy=true;current={...state};
    if(state.lastExplore)lastExplore=state.lastExplore;
    if(state.detailParent)detailParent=state.detailParent;
    if(restore&&state.camera)G.restoreCamera(state.camera);
    root.dataset.page=state.view;
    root.classList.toggle('stream-open',state.view==='watch'&&window.innerWidth>700);// the docked stream panel is showing (desktop)
    const isExplore=['country','locations'].includes(state.view);
    $('#explore-context').hidden=!isExplore;
    $('#saved-panel').hidden=state.view!=='saved';$('#saved-toggle').setAttribute('aria-expanded',String(state.view==='saved'));
    $('#stories-page').hidden=state.view!=='stories';
    if(!['place','watch'].includes(state.view))closeDetail();
    if(state.view!=='search')closeSearch();
    if(state.view==='home'){G.toggleLibrary(false);if(!keepCamera)G.reset();}
    else if(isExplore){
      // The globe starts with a place selected (japan) but unfocused, so a deep link to that country must still focus the camera.
      if(!keepCamera&&!restore&&(key(byId(G.getState().selected))!==state.id||!G.getState().focused))G.restoreCamera({selected:state.id,...G.countryCamera(state.id),focusMix:1,focused:true});
      G.toggleLibrary(true);syncCountry();lastExplore={view:state.view,id:state.id};
      if(restore&&state.library){$('#place-query').value=state.library.query||'';$('#place-query').dispatchEvent(new Event('input'));$('#place-region').value=state.library.region||'';$('#place-region').dispatchEvent(new Event('change'));$('#place-list').scrollTop=state.library.scroll||0;sheetExpanded=!!state.library.expanded;root.classList.toggle('sheet-expanded',sheetExpanded);$('#sheet-handle').setAttribute('aria-expanded',String(sheetExpanded));}
    }else{
      G.toggleLibrary(false);G.stopMotion();
      if(state.view==='saved'){savedCountry=state.savedCountry??savedCountry;G.refreshSaved();$('#saved-panel').scrollTop=state.savedScroll||0;}
      if(state.view==='stories'){period=state.period||period;if(state.storiesCountry!==undefined)$('#stories-country').value=state.storiesCountry;renderStories();}
      if(state.view==='search'){if(state.query!==undefined)$('#global-query').value=state.query;searchCountry=state.searchCountry??searchCountry;searchLimit=state.searchLimit||24;renderSearch();if(!$('#search-dialog').open)$('#search-dialog').showModal();$('#global-results').scrollTop=state.searchScroll||0;}
      if(['place','watch'].includes(state.view)){
        if(state.view==='watch'&&window.innerWidth>700)G.toggleLibrary(true);// before the camera is fitted, so the place panel counts
        const d=byId(state.id);if(d&&G.getState().selected!==d.id)G.restoreCamera({selected:d.id,lon:d.point[0],lat:d.point[1],zoom:G.countryCamera(key(d)).zoom,focusMix:1,focused:true});
        G.openDetails();configureDetail();
        // Desktop: the stream is a panel docked beside the map (owner's annotation), opened non-modally so other places stay clickable.
        // The place page stays a modal; switching between the two has to close and re-open the dialog in the other mode.
        const dlg=$('#destination-dialog'),dock=state.view==='watch'&&window.innerWidth>700;
        dlg.classList.toggle('watching',state.view==='watch');dlg.classList.toggle('docked',dock);$('#watch-return').hidden=state.view!=='watch';
        if(dlg.matches(':modal')===dock){ignoreDetailClose++;dlg.close();if(dock)dlg.show();else dlg.showModal();}
        if(dock){root.dataset.page='country';G.toggleLibrary(true);syncCountry();}// the map behind the panel is the working country view
        if(state.view==='place')window.SomewhereMedia?.close();
      }
    }
    syncNavigation();G.invalidate();busy=false;
  }
  function navigate(view,id='',options={}){
    if(!options.replace)history.replaceState(capture(),'',routeHash(current));
    const state={flow:true,view,id,index:options.replace?current.index:current.index+1,detailParent,lastExplore};
    if(view==='search'){state.query=options.query??$('#global-query').value;state.searchCountry=searchCountry;}
    if(options.replace)history.replaceState(state,'',routeHash(state));else history.pushState(state,'',routeHash(state));
    apply(state,options);
  }
  // Page-level morph via the View Transitions API. Only for clicks whose navigation is the last step (update runs async).
  // Skipped without browser support, with reduced motion, or when the page motion switch is off.
  const motionOK=()=>G.getState().motionEnabled&&!!document.startViewTransition;
  let morphFrom='';// place id whose detail was opened from a card, so closing can shrink back into that card
  function withTransition(update,source){
    if(!motionOK())return update();
    if(source)source.style.viewTransitionName='place-photo';
    document.startViewTransition(()=>{if(source)source.style.viewTransitionName='';update();});
  }
  // Reverse morph: the detail hero shrinks back into the card it came from.
  // The list re-renders on return, so the card is found again by id; no visible card means a plain crossfade.
  function closeDetailView(){
    const dialog=$('#destination-dialog'),id=morphFrom;
    if(current.view!=='place'||current.id!==id||!motionOK())return dialog.close();
    let tile;const html=document.documentElement;html.classList.add('vt-back');
    const returned=()=>new Promise(done=>{let tries=0;const check=()=>current.view!=='place'||++tries>40?done():setTimeout(check,16);check();});// back() may go through an async popstate
    // The dialog's close event is held until this update finishes, so navigate here instead of waiting for it (that deadlock froze the page ~0.7s).
    const t=document.startViewTransition(()=>{ignoreDetailClose++;dialog.close();back();return returned().then(()=>{tile=[...document.querySelectorAll(`[data-place="${CSS.escape(id)}"] .tile-photo`)].find(el=>el.getClientRects().length);if(tile)tile.style.viewTransitionName='place-photo';});});
    t.finished.finally(()=>{if(tile)tile.style.viewTransitionName='';html.classList.remove('vt-back');morphFrom='';});
  }
  function back(){if(current.index>0)history.back();else navigate(lastExplore.view,lastExplore.id,{replace:true});}
  function chooseCountry(k){if(!countries[k])return;rememberEntry();navigate('country',k,{keepCamera:true});busy=true;G.flyTo(k);busy=false;syncCountry();}
  function pickCountry(k){if(current.view==='home')G.select(k);else chooseCountry(k);}// home: the dock only changes what is behind the door; 「開門」 walks through
  function showLocations(){const d=byId(G.getState().selected);navigate('locations',key(d),{keepCamera:true});}
  let shownCx=null;// eased horizontal centre of the map, see mapLayout
  let watchDirect=false;// the stream was opened straight from the map or list, with no detail page underneath in history
  function openPlace(id,watch=false){if(!byId(id))return;detailParent=current.view==='search'?'search':current.view==='saved'?'saved':current.view==='stories'?'stories':current.view==='locations'?'locations':'country';rememberEntry();watchDirect=watch;navigate(watch?'watch':'place',id);if(watch)window.SomewhereMedia?.play();}
  function showSearch(query=''){searchLimit=24;navigate('search','',{query});$('#global-query').focus();}
  // Every place in a country shares one mood image, so non-representative places get a typographic tile instead of a misleading photo.
  function typeTile(p){
    const mood=Object.keys(moodPatterns).find(m=>moodPatterns[m].test(p.name))||'';
    return `<div class="tile-type" data-country="${esc(key(p))}" aria-hidden="true"><b>${esc(p.region||p.country)}</b>${mood?`<i>${mood}</i>`:''}</div>`;
  }
  function configureDetail(){
    const d=byId(G.getState().selected),own=d.id===key(d);
    $('#detail-type').innerHTML=own?'':typeTile(d);
    $('#detail-image-label').textContent=own?'風景示意圖 · 非所選地點現場':'此地點尚無風景圖';
    $('#detail-breadcrumb').textContent='通往 '+d.name+'・'+$('#local-time').textContent.replace('當地時間','當地');// door plaque; shortcut: the time is read when the door opens and does not tick while it stays open
    $('#detail-back-label').textContent=({home:'返回全球探索',saved:'返回我的收藏',search:'返回搜尋結果',locations:'返回地點總覽',stories:'返回近期分享'})[detailParent]||'返回國家探索';
    $('#detail-coordinates').textContent=d.coordinatePrecision+' '+d.point[1].toFixed(3)+'° N / '+d.point[0].toFixed(3)+'° E';
  }
  function enterWatch(){watchDirect=false;navigate('watch',G.getState().selected);window.SomewhereMedia?.play();}
  function leaveWatch(){if(current.view==='watch'){if(watchDirect){watchDirect=false;navigate('place',current.id,{replace:true});}else back();}else{window.SomewhereMedia?.close();$('#destination-dialog').classList.remove('watching');$('#watch-return').hidden=true;}}
  function card(p){
    const visual=p.id===key(p)?`<img src="${esc(p.image)}" alt="${esc(p.alt)}" loading="lazy"><span>風景示意</span>`:typeTile(p);
    return `<button class="scene-tile" data-place="${esc(p.id)}"><div class="tile-photo">${visual}</div><div class="tile-copy"><small>${esc(p.country)} / ${esc(p.region||'旅遊靈感')}</small><strong>${esc(p.name)}</strong><span class="tile-meta">${p.sourceCount||1} 個來源入口 <span>候選・待確認 ↗</span></span></div></button>`;
  }
  function decorateLibrary(filtered){
    const list=$('#place-list'),scroll=list.scrollTop||0,isFull=current.view==='locations';
    // Desktop: the scene window already shows the selected place, so the unfiltered country list skips it (mobile hides that window).
    const mobile=matchMedia('(max-width:700px)').matches,unfiltered=!$('#place-query').value.trim()&&!$('#place-region').value&&!mobile,sel=G.getState().selected;
    const shown=isFull?filtered:(unfiltered?filtered.filter(p=>p.id!==sel):filtered).slice(0,3);
    list.innerHTML=shown.length?shown.map(p=>card(p)).join(''):'<div class="library-empty"><h3>換個關鍵字，再出發。</h3><p>這個區域尚無符合的地點。</p><button data-clear-library class="outline-pill">清除篩選</button></div>';
    list.scrollTop=scroll;list.classList.toggle('catalogue-grid',isFull);
    if(!isFull)$('#library-count').textContent=`${filtered.length} 個符合地點 · 先看看這 ${shown.length} 個風景入口`;
    syncCountry();
  }
  function countryPills(target,selected,attribute){
    $(target).innerHTML=[['','全部'],...Object.entries(countries).map(([k,v])=>[k,v.name])].map(([k,name])=>`<button ${attribute}="${k}" aria-pressed="${selected===k}">${name}</button>`).join('');
  }
  function savedRendered(saved){
    $('#nav-saved-count').textContent=saved.length;
    countryPills('#saved-filters',savedCountry,'data-saved-country');
    const filtered=saved.map(byId).filter(p=>!savedCountry||key(p)===savedCountry);
    $('#saved-list').innerHTML=filtered.length?filtered.map(p=>`<article class="collection-card">${card(p)}<button class="collection-remove" data-remove-save="${esc(p.id)}" aria-label="移除收藏 ${esc(p.name)}">♥</button></article>`).join(''):`<div class="collection-empty"><span class="empty-orbit" aria-hidden="true">♡</span><h2>${saved.length?'這個國家，還沒留下心動。':'你的下一站，還有無限可能。'}</h2><p>${saved.length?'切換其他國家，或繼續探索新的風景。':'在景點按下愛心，把下一次旅行的靈感留在這裡。'}</p></div>`;
    $('#saved-start').hidden=filtered.length>0;
  }
  function savedChanged(id,removed){
    if(!removed)return;
    undo=id;clearTimeout(undoTimer);$('#undo-toast').hidden=false;
    undoTimer=setTimeout(()=>{undo=null;$('#undo-toast').hidden=true;},8000);
  }
  function searchMatches(query){
    const q=query.trim().toLowerCase(),pattern=moodPatterns[q];
    return places.filter(p=>(!searchCountry||key(p)===searchCountry)&&(!q||(pattern?pattern.test(p.name+' '+p.region):[p.name,p.country,p.region,p.en,...p.aliases].filter(Boolean).join(' ').toLowerCase().includes(q))));
  }
  function renderSearch(){
    countryPills('#search-countries',searchCountry,'data-search-country');
    const matches=searchMatches($('#global-query').value);
    $('#global-result-count').textContent=`${matches.length} 個地點${matches.length>searchLimit?'・先顯示 '+searchLimit+' 個':''}`;
    $('#global-results').innerHTML=matches.length?matches.slice(0,searchLimit).map(p=>card(p)).join(''):'<div class="search-empty"><span class="empty-orbit">⌕</span><h3>換個關鍵字，再出發。</h3><p>可以搜尋城市、景點，或試試海邊、山景。</p><button id="clear-search" class="yellow-pill">清除搜尋與篩選 →</button></div>';
    $('#search-more').hidden=matches.length<=searchLimit;
  }
  function renderStories(){
    const k=$('#stories-country').value,items=places.filter(p=>!k||key(p)===k);
    document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.period)===period)));
    $('#stories-empty-copy').textContent=`${k?countries[k].name:'四國'}最近 ${period} 天的社群貼文尚未串接。先從當地影像與天氣，認識一個地方。`;
    const suggestions=k?items.slice(0,3):Object.keys(countries).map(byId);
    $('#stories-suggestions').innerHTML='<div class="suggestions-heading"><p class="overline">MEANWHILE, EXPLORE THESE WINDOWS</p><h2>先看看，這裡的風景。</h2></div>'+suggestions.map(p=>card(p)).join('');
  }
  window.SomewhereExperience={
    chooseCountry,pickCountry,openPlace,showLocations,showSearch,showSaved:()=>navigate('saved'),decorateLibrary,savedRendered,savedChanged,typeTile,closeDetailView,
    nextPlace:()=>{const others=places.filter(p=>p.id!==G.getState().selected);navigate('place',others[Math.floor(Math.random()*others.length)].id,{replace:true});},
    chooseMarker:id=>{const p=byId(id);if(!p)return;if(current.view==='home')chooseCountry(key(p));else openPlace(id,true);},// inside a country a place marker opens its stream directly
    selectionChanged(d){if(busy)return;if(['home','country','locations'].includes(current.view)){const nextKey=key(d);if(G.getState().focused&&(current.view==='home'||current.id!==nextKey)){navigate('country',nextKey,{keepCamera:true,replace:current.view==='home'});rememberEntry();}else syncCountry();}},
    detailsOpened(d){if(!busy){detailParent=current.view;navigate('place',d.id);}configureDetail();},
    // home (.67/.52, mobile .5/.35) is the centre of the doorway in door.css
    mapLayout(){const mobile=window.innerWidth<700;if(mobile)return {x:.5,y:.35};
// Country: the centre of the free area beside the place panel (globe.js freeArea), which countryCamera fills with the country.
const mix=G.getState().focusMix,area=G.freeArea();
// The free area changes when the stream panel opens or closes; ease the centre across a few frames instead of jumping.
shownCx=shownCx===null?area.cx:shownCx+(area.cx-shownCx)*.2;if(Math.abs(area.cx-shownCx)>.0005)requestAnimationFrame(G.invalidate);else shownCx=area.cx;
// The country switcher sits under the map, centred on the same free area, so it never ends up beneath a panel.
const dockX=(shownCx*100).toFixed(2)+'%';if(root.style.getPropertyValue('--map-cx')!==dockX)root.style.setProperty('--map-cx',dockX);
// Walking through the door, the globe glides from the doorway (.67) to its country position as the focus fades in, instead of jumping.
return current.view==='locations'?{x:.77,y:.52}:current.view==='home'?{x:.67,y:.52}:{x:.67+(shownCx-.67)*mix,y:.52+(area.cy-.52)*mix};},
    getState:()=>({...current,searchCountry,savedCountry,period,detailParent,sheetExpanded}),searchMatches
  };
  $('#nav-explore').addEventListener('click',()=>withTransition(()=>navigate(lastExplore.view,lastExplore.id)));
  $('#nav-stories').addEventListener('click',()=>withTransition(()=>navigate('stories')));
  $('#nav-saved').addEventListener('click',()=>withTransition(()=>navigate('saved')));
  $('#header-search').addEventListener('click',()=>withTransition(()=>showSearch()));
  $('#breadcrumb-world').addEventListener('click',()=>withTransition(()=>navigate('home')));
  $('#breadcrumb-country').addEventListener('click',()=>withTransition(()=>navigate('country',key(byId(G.getState().selected)),{keepCamera:true})));
  $('#all-places').addEventListener('click',()=>withTransition(showLocations));
  $('#library-toggle').addEventListener('click',showLocations);
  $('#library-close').addEventListener('click',()=>withTransition(()=>navigate('country',key(byId(G.getState().selected)),{keepCamera:true})));
  $('#saved-close').addEventListener('click',()=>withTransition(()=>navigate(lastExplore.view,lastExplore.id)));
  $('#saved-start').addEventListener('click',()=>withTransition(()=>navigate('home')));
  $('#stories-back').addEventListener('click',()=>withTransition(()=>navigate(lastExplore.view,lastExplore.id)));
  $('#stories-explore').addEventListener('click',()=>chooseCountry($('#stories-country').value||'japan'));
  $('#stories-country').addEventListener('change',renderStories);
  $('#skip-entry').addEventListener('click',()=>{G.finishFlight();rememberEntry();});
  $('#detail-back').addEventListener('click',closeDetailView);
  $('#destination-dialog').addEventListener('cancel',e=>{if(current.view==='place'&&morphFrom===current.id&&motionOK()){e.preventDefault();closeDetailView();}});// Esc
  $('#destination-dialog').addEventListener('close',()=>{if(ignoreDetailClose){ignoreDetailClose--;return;}if(['place','watch'].includes(current.view))back();});
  $('#watch-start').addEventListener('click',enterWatch);
  $('#watch-return').addEventListener('click',leaveWatch);
  $('#media-preview').addEventListener('click',leaveWatch);
  $('#media-source').addEventListener('change',()=>{if(current.view==='watch')window.SomewhereMedia?.play();});
  $('#search-close').addEventListener('click',()=>$('#search-dialog').close());
  $('#search-dialog').addEventListener('close',()=>{if(ignoreSearchClose){ignoreSearchClose--;return;}if(current.view==='search')back();});
  $('#global-query').addEventListener('input',()=>{searchLimit=24;renderSearch();});
  $('#global-search-form').addEventListener('submit',e=>{e.preventDefault();renderSearch();});
  $('#search-more').addEventListener('click',()=>{searchLimit+=24;renderSearch();});
  $('#undo-save').addEventListener('click',()=>{if(undo&&!G.getState().saved.includes(undo))G.toggleSave(undo);undo=null;clearTimeout(undoTimer);$('#undo-toast').hidden=true;});
  $('#undo-dismiss').addEventListener('click',()=>{undo=null;clearTimeout(undoTimer);$('#undo-toast').hidden=true;});
  $('#sheet-handle').addEventListener('click',()=>{if(sheetDragged){sheetDragged=false;return;}sheetExpanded=!sheetExpanded;root.classList.toggle('sheet-expanded',sheetExpanded);$('#sheet-handle').setAttribute('aria-expanded',String(sheetExpanded));});
  let sheetPointer,sheetDragged=false;
  $('#sheet-handle').addEventListener('pointerdown',e=>{sheetPointer=e.clientY;sheetDragged=false;$('#sheet-handle').setPointerCapture(e.pointerId);});
  $('#sheet-handle').addEventListener('pointerup',e=>{if(sheetPointer===undefined)return;const delta=e.clientY-sheetPointer;sheetPointer=undefined;if(Math.abs(delta)>18){sheetDragged=true;sheetExpanded=delta<0;root.classList.toggle('sheet-expanded',sheetExpanded);$('#sheet-handle').setAttribute('aria-expanded',String(sheetExpanded));}});
  $('#sheet-handle').addEventListener('pointercancel',()=>{sheetPointer=undefined;sheetDragged=false;});
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    // Cards in the country/place list open the stream directly; search, saved and story cards open the detail page.
    if(button.dataset.place){morphFrom=button.dataset.place;const watch=!!button.closest('#place-list');withTransition(()=>openPlace(button.dataset.place,watch),button.querySelector('.tile-photo'));}
    if(button.hasAttribute('data-saved-country')){savedCountry=button.dataset.savedCountry;G.refreshSaved();}
    if(button.dataset.removeSave)G.toggleSave(button.dataset.removeSave);
    if(button.hasAttribute('data-search-country')){searchCountry=button.dataset.searchCountry;searchLimit=24;renderSearch();}
    if(button.dataset.mood){$('#global-query').value=button.dataset.mood;searchLimit=24;renderSearch();}
    if(button.dataset.period){period=Number(button.dataset.period);renderStories();}
    if(button.id==='clear-search'){$('#global-query').value='';searchCountry='';renderSearch();}
    if(button.hasAttribute('data-clear-library')){$('#place-query').value='';$('#place-query').dispatchEvent(new Event('input'));$('#place-region').value='';$('#place-region').dispatchEvent(new Event('change'));}
    if(button.dataset.mobileNav){const section=button.dataset.mobileNav;withTransition(()=>section==='explore'?navigate(lastExplore.view,lastExplore.id):navigate(section));}
  });
  // The logo returns home without reloading, preserving local navigation context.
  $('.wordmark').addEventListener('click',e=>{e.preventDefault();withTransition(()=>navigate('home'));});
  $('#reset').addEventListener('click',()=>navigate('home','',{keepCamera:true}));
  // Decorative pointer effects, skipped when motion is off (CSS reads --mx/--my for the glow; .click-burst is styled in experience-ui.css).
  const fxOK=()=>G.getState().motionEnabled;
  document.addEventListener('pointermove',e=>{const t=e.target.closest?.('.scene-tile,.island');if(!t)return;const r=t.getBoundingClientRect();t.style.setProperty('--mx',e.clientX-r.left+'px');t.style.setProperty('--my',e.clientY-r.top+'px');},{passive:true});
  document.addEventListener('pointerdown',e=>{if(!fxOK()||!e.target.closest?.('button,a'))return;const burst=document.createElement('span');burst.className='click-burst';burst.style.left=e.clientX+'px';burst.style.top=e.clientY+'px';
    (e.target.closest('dialog[open]')||document.body).append(burst);burst.addEventListener('animationend',()=>burst.remove());},{passive:true});// inside a modal dialog the burst must live in the dialog (top layer)
  window.addEventListener('popstate',e=>{if(e.state?.flow)apply(e.state,{restore:true});});
  let motionFrame;
  function watchMotion(){const s=G.getState(),hidden=!s.flying||s.focusMix>=.98;if($('#skip-entry').hidden!==hidden)$('#skip-entry').hidden=hidden;if(!seenEntry&&s.flying&&s.focusMix>=.98)rememberEntry();motionFrame=requestAnimationFrame(watchMotion);}
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(motionFrame);clearTimeout(undoTimer);});
  const [initialView,initialId]=location.hash.slice(1).split('/');
  const validViews=['home','country','locations','saved','stories','place','watch','search'];
  const deep=validViews.includes(initialView)&&(!['country','locations','place','watch'].includes(initialView)||byId(initialId));
  if(seenEntry||deep)G.stopMotion();
  const initial=history.state?.flow?history.state:{flow:true,view:deep?initialView:'home',id:deep?initialId||'':'',index:0};
  history.replaceState(initial,'',routeHash(initial));apply(initial,{restore:!!initial.camera,keepCamera:!seenEntry&&!deep});G.refreshSaved();watchMotion();
})();
