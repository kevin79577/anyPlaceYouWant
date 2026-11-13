'use strict';
const screens = [
  {id:'world',title:'全球探索',en:'DISCOVER THE WORLD',intent:'先用地球與四個國家的代表風景喚起好奇，再選國家或直接搜尋；首頁只保留一個主要行動。',interaction:'初次入場沿用兩圈、約五秒的放大轉場，提供略過；返回首頁不強迫重播。頁首統一為「探索／近期分享／我的收藏」。',next:['country','search']},
  {id:'country',title:'國家探索',en:'EXPLORE A COUNTRY',intent:'從全球自然靠近日本、韓國、台灣或泰國，以代表地點與城市群聚建立國家全貌。',interaction:'國家切換走球面最短路徑。地圖只顯示適量城市或群聚標記，右側一次開啟一個面板，選地點時卡片與標記同步。',next:['locations','place']},
  {id:'locations',title:'國內地點總覽',en:'MANY PLACES, ONE COUNTRY',intent:'同一國家可以有多個地點與來源；用地區、關鍵字和清單找到想看的地方，不必在地圖上逐個找小點。',interaction:'地圖與清單並列，點卡片即高亮對應標記；大量地點分批載入。118 是目前台灣盤點地點數，篩選後應顯示符合數與總數；候選來源不等於已驗證直播。',next:['place','search']},
  {id:'search',title:'全域搜尋',en:'SEARCH BY PLACE OR FEELING',intent:'知道城市名稱，或只想找海邊、山景、日落，都可以從同一搜尋入口開始。',interaction:'搜尋只開一層面板；保留輸入與國家篩選，選結果直接進地點。關閉後回到原地圖；零結果提供清除篩選。情境標籤搜尋為新版規劃功能。',next:['place','states']},
  {id:'place',title:'景點詳情',en:'A WINDOW INTO THE PLACE',intent:'把風景、當地天氣、影像來源、近期分享與收藏整合成同一個景點資訊中心，再決定是否觀看。',interaction:'主按鈕固定為「觀看現場影像」。天氣列標註資料時間、估算性質與位置精度；來源另標待確認、可播放或失效。返回保留清單位置與篩選。',next:['watch','stories','saved']},
  {id:'watch',title:'沉浸觀看',en:'LESS INTERFACE, MORE SCENERY',intent:'進入觀看後，把焦點交給影像；天氣、切換來源與原站入口仍在手邊。',interaction:'不規則玻璃只包在播放器外圍，完整矩形播放器與官方控制列不裁切。返回一鍵回原景點；播放失敗保留天氣與來源切換入口。',next:['place','states']},
  {id:'stories',title:'近期分享',en:'WHAT IT LOOKS LIKE LATELY',intent:'用有日期依據的旅行分享，補充鏡頭看不到的街區、季節與旅人視角。',interaction:'依國家及最近 7／30 天篩選，顯示平台、原始發布時間與原文連結。分享關聯回景點，不取代現場影像；目前畫面為示意貼文，尚未串接社群資料。',next:['place','saved']},
  {id:'saved',title:'我的收藏',en:'KEEP THE PLACES YOU LOVE',intent:'把心動的地點留下，按國家快速回看，讓下一次造訪直接延續上次的探索。',interaction:'收藏先儲存在目前裝置，不需要登入。移除後提供短暫復原，點卡片返回地點；尚無收藏時提供「開始探索」入口，不顯示空白地圖。',next:['place','world']},
  {id:'states',title:'例外與載入狀態',en:'ALWAYS A WAY FORWARD',intent:'補齊地圖載入、搜尋空結果、影像無法播放與天氣取得失敗四種畫面，避免任何一步變成死路。',interaction:'骨架畫面減少載入跳動；搜尋可清除條件；播放器可換來源或開原站；天氣失敗只影響天氣區塊，保留風景並提供重試。',next:['search','watch','place']},
  {id:'mobile',title:'手機完整流程',en:'THE SAME JOURNEY, IN YOUR HAND',intent:'手機沿用探索→國家地點→景點→觀看的順序，保持同一個產品的辨識感。',interaction:'地圖搭配可拖曳底部面板，搜尋與篩選放在面板頂端。主要操作至少 44px；觀看維持完整播放器，返回保留面板高度與捲動位置。',next:['world','place','watch']}
];
const $ = s => document.querySelector(s);
let selected = Math.max(0,screens.findIndex(s=>s.id===location.hash.slice(1)));
let view = 'detail';
let restoreZoomFocus;
const source = s => `assets/journey-${s.id}.png`;
function render(){
  const s=screens[selected];
  $('#screen-nav').innerHTML=screens.map((p,i)=>`<button data-screen="${p.id}" aria-current="${i===selected?'page':'false'}"><span>${String(i+1).padStart(2,'0')}</span><strong>${p.title}</strong><small>${p.en}</small></button>`).join('');
  $('#screen-tag').textContent=`${String(selected+1).padStart(2,'0')} / ${s.en}`;
  $('#screen-title').textContent=s.title;
  $('#position').textContent=`${selected+1} / ${screens.length}`;
  $('#previous').disabled=selected===0;
  $('#next').disabled=selected===screens.length-1;
  $('#hero').src=source(s);
  $('#hero').alt=`光感浮島新版：${s.title}。${s.intent} 圖內影像與資料為示意。`;
  $('#intent').textContent=s.intent;
  $('#interaction').textContent=s.interaction;
  $('#original').href=source(s);
  $('#next-links').innerHTML=s.next.map(id=>{const p=screens.find(x=>x.id===id);return `<button data-screen="${id}">接著：${p.title} →</button>`;}).join('');
  document.title=`${s.title} — 漫見完整操作與視覺提案`;
}
function setView(name){
  view=name;
  for(const v of ['detail','overview','flow']) $(`#${v}-view`).hidden=v!==name;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===name));
}
function select(id,focus=false){
  const index=screens.findIndex(s=>s.id===id);
  if(index<0)return;
  selected=index;
  history.replaceState(null,'',`#${id}`);
  setView('detail');render();
  if(focus){$('#screen-nav [aria-current="page"]').focus({preventScroll:true});}
}
$('#overview-grid').innerHTML=screens.map((s,i)=>`<button class="overview-card" data-screen="${s.id}"><img src="${source(s)}" alt="${s.title}視覺預覽" loading="lazy"><div><strong>${String(i+1).padStart(2,'0')} / ${s.title}</strong><small>${s.en} ↗</small></div></button>`).join('');
document.addEventListener('click',e=>{
  const node=e.target.closest('[data-screen]');
  if(node){select(node.dataset.screen,true);return;}
  const tab=e.target.closest('[data-view]');
  if(tab)setView(tab.dataset.view);
});
document.addEventListener('keydown',e=>{
  const node=e.target.closest('[data-screen]');
  if(node?.tagName.toLowerCase()==='g'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(node.dataset.screen,true);return;}
  if(view!=='detail'||$('#lightbox').open||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select'))return;
  if(e.key==='ArrowRight'&&selected<screens.length-1){e.preventDefault();select(screens[selected+1].id,true);}
  if(e.key==='ArrowLeft'&&selected>0){e.preventDefault();select(screens[selected-1].id,true);}
});
$('#previous').addEventListener('click',()=>{if(selected>0)select(screens[selected-1].id);});
$('#next').addEventListener('click',()=>{if(selected<screens.length-1)select(screens[selected+1].id);});
$('#zoom').addEventListener('click',()=>{
  restoreZoomFocus=document.activeElement;
  const s=screens[selected];
  $('#zoom-image').src=source(s);$('#zoom-image').alt=$('#hero').alt;
  $('#zoom-title').textContent=`${String(selected+1).padStart(2,'0')} / ${s.title}`;
  $('#lightbox').showModal();
});
$('#close-zoom').addEventListener('click',()=>$('#lightbox').close());
$('#lightbox').addEventListener('close',()=>restoreZoomFocus?.focus({preventScroll:true}));
$('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('hashchange',()=>{const s=screens.find(x=>x.id===location.hash.slice(1));if(s)select(s.id);});
render();
// Keep the embedded proposal in the original gallery at its natural height.
if(window.parent!==window&&typeof ResizeObserver!=='undefined'){
  document.body.classList.add('embedded');
  const report=()=>window.parent.postMessage({type:'somewhere-journey-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(document.body);
  window.addEventListener('load',report);
}
