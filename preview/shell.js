// 任意門・共用外框：頂部列的搜尋、近期分享、我的收藏（首頁與國家頁共用）。
// 目錄文字來自外部影片標題，一律用 textContent 建 DOM，不拼 innerHTML。
const C=window.SomewhereCatalog;
export const places=C.places,countries=C.countries,sources=C.sources;
export const byId=new Map(places.map(p=>[p.id,p]));
export const countryOf=p=>p.countryKey||p.id;
export const firstVideo=id=>(sources[id]||[]).find(s=>s.videoId)?.videoId;
export const thumbOf=id=>{const v=firstVideo(id);return v?`https://i.ytimg.com/vi/${encodeURIComponent(v)}/mqdefault.jpg`:''};
export const placeUrl=p=>`country.html#${countryOf(p)}/${encodeURIComponent(p.id)}`;
export const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const $=id=>document.getElementById(id);

/* 收藏：存在這台裝置（沿用舊版的 key，舊收藏不會消失） */
const KEY='somewhere-globe-saved-v1';let saved=[];const listeners=new Set();
try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(v))saved=[...new Set(v.filter(id=>byId.has(id)))]}catch{}
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}listeners.forEach(f=>f(saved))};
export const isSaved=id=>saved.includes(id);
export function toggleSaved(id){saved=isSaved(id)?saved.filter(x=>x!==id):[id,...saved];persist();toast(isSaved(id)?'已加入收藏':'已移除收藏');return isSaved(id)}
export const onSavedChange=f=>listeners.add(f);

let toastTimer=0;
export function toast(text){const t=$('toast');if(!t)return;t.textContent=text;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),2200)}

/* 搜尋：地點名、地區、國家、別名、類別；心情詞對應到類別 */
// 心情詞：先比對類別，再比對少數明確的名稱詞（只比「海」會抓到東海道、忍野八海）
const MOODS={海邊:{cats:['海岸','港口漁港'],words:['海灘','海水浴場','海岸','beach']},山景:{cats:['山岳','火山'],words:['山頂','登山']},城市:{cats:['城市街景','商店街・店家','車站鐵道'],words:['夜景']},日落:{cats:[],words:['夕陽','夕日','日落','sunset','黃昏']}};
const hay=new Map(places.map(p=>[p.id,[p.name,p.region,p.country,p.category,...(p.aliases||[])].filter(Boolean).join(' ').toLowerCase()]));
export function search(q){q=q.trim().toLowerCase();if(!q)return[];const m=MOODS[q];
  const hits=places.filter(p=>m?m.cats.includes(p.category)||m.words.some(w=>p.name.toLowerCase().includes(w)):hay.get(p.id).includes(q));
  return hits.sort((a,b)=>(b.tier==='hot')-(a.tier==='hot')||(b.name.toLowerCase().startsWith(q))-(a.name.toLowerCase().startsWith(q)))}

function hitRow(p,{removable}={}){const a=el('a','hit');a.href=placeUrl(p);
  const th=el('span','thumb'),src=thumbOf(p.id);if(src){const i=el('img');i.src=src;i.alt='';i.loading='lazy';i.addEventListener('error',()=>i.remove());th.append(i)}
  const t=el('span');t.append(el('b','',p.name),el('small','',`${p.country}・${p.region||''}${p.category?'・'+p.category:''}`));
  a.append(th,t);
  if(removable){const r=el('button','rm','移除');r.type='button';r.addEventListener('click',e=>{e.preventDefault();toggleSaved(p.id)});a.append(r)}else a.append(el('span','go','打開這扇窗 →'));
  return a}

let open=null;
function closeSheet(){if(!open)return;open.remove();$('scrim')?.remove();open=null;document.querySelectorAll('.nav [data-sheet]').forEach(b=>b.removeAttribute('aria-current'));$('nav-explore')?.setAttribute('aria-current','page')}
function sheet(name,title,sub){closeSheet();const s=el('section','sheet glass');s.setAttribute('role','dialog');s.setAttribute('aria-label',title);s.dataset.sheet=name;
  const h=el('header'),h2=el('h2','',title);if(sub)h2.append(el('small','',sub));const x=el('button','x','×');x.type='button';x.setAttribute('aria-label','關閉');x.addEventListener('click',closeSheet);h.append(h2,x);s.append(h);
  const scrim=el('div','scrim');scrim.id='scrim';scrim.addEventListener('click',closeSheet);document.body.append(scrim,s);open=s;
  document.querySelectorAll('.nav [aria-current]').forEach(b=>b.removeAttribute('aria-current'));document.querySelector(`.nav [data-sheet="${name}"]`)?.setAttribute('aria-current','page');return s}

export function openSearch(initial=''){const s=sheet('search','你想看見什麼風景？','搜尋地點、城市，或一種心情');
  const q=el('input','q');q.type='search';q.placeholder='試試「海邊」、「京都」或「高美濕地」';q.setAttribute('aria-label','搜尋地點');q.value=initial;
  const moods=el('div','moods');for(const m of Object.keys(MOODS)){const b=el('button','',m);b.type='button';b.addEventListener('click',()=>{q.value=m;run()});moods.append(b)}
  const out=el('div','results');out.setAttribute('aria-live','polite');s.append(q,moods,out);let limit=30;
  function run(){limit=30;draw()}
  function draw(){const hits=search(q.value);out.replaceChildren();
    if(!q.value.trim()){out.append(el('p','empty','輸入地名，或點上面的心情。'));return}
    out.append(el('div','count',`${hits.length} 個地點`));if(!hits.length){const e=el('p','empty');e.append(el('b','','這裡暫時沒有窗'),'換個關鍵字試試。');out.append(e);return}
    hits.slice(0,limit).forEach(p=>out.append(hitRow(p)));
    if(hits.length>limit){const m=el('button','more',`顯示更多（還有 ${hits.length-limit} 個）`);m.type='button';m.addEventListener('click',()=>{limit+=30;draw()});out.append(m)}}
  q.addEventListener('input',run);draw();q.focus()}

export function openSaved(){const s=sheet('saved','我的收藏','收藏存在這台裝置，隨時回到讓你心動的地方');const out=el('div','results');s.append(out);
  const draw=()=>{if(open!==s)return;out.replaceChildren();const list=saved.map(id=>byId.get(id)).filter(Boolean);
    if(!list.length){const e=el('p','empty');e.append(el('b','','還沒有收藏'),'在景點面板按「♡ 收藏」，就會出現在這裡。');out.append(e);return}
    out.append(el('div','count',`${list.length} 個地點`));list.forEach(p=>out.append(hitRow(p,{removable:true})))};
  onSavedChange(draw);draw()}

export function openRecent(){const s=sheet('recent','近期分享','讓有日期的旅行分享，補上鏡頭以外的風景');const e=el('p','empty');
  e.append(el('b','','下一段旅行故事，還在路上'),'近期社群分享尚未串接。先從即時影像與天氣，認識一個地方。');s.append(e)}

/* 頂部列綁定；頁面需有 #nav-recent、#nav-saved、#saved-n、#open-search、#toast */
export function initShell(){
  $('open-search')?.addEventListener('click',()=>openSearch());
  $('nav-saved')?.addEventListener('click',openSaved);$('nav-recent')?.addEventListener('click',openRecent);
  const count=()=>{const n=$('saved-n');if(n){n.textContent=saved.length;n.hidden=!saved.length}};onSavedChange(count);count();
  addEventListener('keydown',e=>{if(e.key==='Escape'&&open){e.stopImmediatePropagation();closeSheet()}else if(e.key==='/'&&!open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)){e.preventDefault();openSearch()}},true);
}
