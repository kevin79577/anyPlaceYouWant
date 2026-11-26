// 小遊戲「門後是哪裡」（組員 demo 移植）：看照片、在地圖上點位置，5 題，分數 5000×e^(−距離/1200km)。
// 挑戰連結 game.html#c-3-0-7-2-9-s18420＝同樣 5 題（題目索引）＋朋友的分數。不存任何資料。
import {initShell,toast} from "./shell.js";
initShell();
const $=id=>document.getElementById(id);
const PLACES=[
  {id:"fuji",name:"富士山",area:"靜岡・山梨",country:"日本",lat:35.361,lon:138.728},
  {id:"fushimi",name:"伏見稻荷大社",area:"京都",country:"日本",lat:34.967,lon:135.773},
  {id:"itsukushima",name:"嚴島神社",area:"廣島・宮島",country:"日本",lat:34.296,lon:132.320},
  {id:"gyeongbok",name:"景福宮光化門",area:"首爾",country:"韓國",lat:37.580,lon:126.977},
  {id:"namsan",name:"N 首爾塔",area:"首爾",country:"韓國",lat:37.551,lon:126.988},
  {id:"haedong",name:"海東龍宮寺",area:"釜山",country:"韓國",lat:35.188,lon:129.223},
  {id:"jiufen",name:"九份阿妹茶樓",area:"新北",country:"台灣",lat:25.109,lon:121.845},
  {id:"taroko",name:"太魯閣峽谷",area:"花蓮",country:"台灣",lat:24.167,lon:121.333},
  {id:"watarun",name:"鄭王廟",area:"曼谷",country:"泰國",lat:13.744,lon:100.489},
  {id:"rongkhun",name:"白廟",area:"清萊",country:"泰國",lat:19.824,lon:99.763},
  {id:"phiphi",name:"皮皮島",area:"甲米",country:"泰國",lat:7.733,lon:98.767}
];
const ROUNDS=5,MAX=ROUNDS*5000;

/* 地圖：assets/game/map.webp 是從 day.webp 裁出的經度 95–146、緯度 4–45，等距圓柱投影；寬度乘 cos25° 讓中緯度不變形太多 */
const L0=95,L1=146,B0=4,B1=45,VW=600,VH=Math.round(VW*(B1-B0)/((L1-L0)*Math.cos(25*Math.PI/180)));
const proj=(lon,lat)=>[(lon-L0)/(L1-L0)*VW,(B1-lat)/(B1-B0)*VH];
const inv=(x,y)=>[L0+x/VW*(L1-L0),B1-y/VH*(B1-B0)];
console.assert(inv(...proj(121.5,25)).every((v,i)=>Math.abs(v-[121.5,25][i])<1e-9),"投影來回要一致");
const NS="http://www.w3.org/2000/svg",svg=$("map");
const mk=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);parent?.append(e);return e};
svg.setAttribute("viewBox",`0 0 ${VW} ${VH}`);
mk("image",{href:"assets/game/map.webp",width:VW,height:VH,preserveAspectRatio:"none"},svg);
const gB=mk("g",{class:"borders"},svg),gL=mk("g",{},svg),gM=mk("g",{},svg);
fetch("assets/door/borders.json").then(r=>r.json()).then(rings=>{let d="";
  for(const r of rings){let near=false;for(let i=0;i<r.length&&!near;i+=2)near=r[i]>L0-3&&r[i]<L1+3&&r[i+1]>B0-3&&r[i+1]<B1+3;if(!near)continue;
    for(let i=0;i<r.length;i+=2){const [x,y]=proj(r[i],r[i+1]);d+=(i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1)}}
  mk("path",{d},gB)}).catch(()=>{});// 邊界只是輔助，載入失敗照樣能玩
for(const [t,lo,la] of [["日本",137.5,37.8],["韓國",127.8,36.3],["台灣",121,23.6],["泰國",101,15.5]]){const [x,y]=proj(lo,la);mk("text",{x:x+14,y,class:"lbl"},gL).textContent=t}

function km(a,b){const R=6371,r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lon-a.lon)*r;
  const h=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const score=d=>Math.round(5000*Math.exp(-d/1200));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const el=(tag,text,cls)=>Object.assign(document.createElement(tag),{textContent:text},cls?{className:cls}:{});
function parseChallenge(h){const m=/^#c-((?:\d{1,2}-){5})s(\d{1,5})$/.exec(h);if(!m)return null;
  const idx=m[1].split("-").filter(Boolean).map(Number);
  if(idx.some(i=>i>=PLACES.length)||new Set(idx).size!==5)return null;
  return {qs:idx.map(i=>PLACES[i]),score:Math.min(+m[2],MAX)}}

let game=null;
function newGame(ch){game={qs:ch?ch.qs:shuffle(PLACES).slice(0,ROUNDS),i:0,total:0,log:[],rival:ch?ch.score:null};$("final").hidden=true;
  $("gSub").textContent=ch?`朋友出的挑戰：同樣 5 題，對方拿了 ${ch.score.toLocaleString()} 分`:"門打開了，猜猜門後是哪裡：在地圖上點一下";round()}
function round(){const q=game.qs[game.i];game.guess=null;game.done=false;
  $("gImg").src=`assets/game/${q.id}.jpg`;$("gReveal").hidden=true;
  $("gRound").textContent=`${game.i+1} / ${ROUNDS}`;$("gTotal").textContent=game.total.toLocaleString();
  $("gResult").textContent="";$("gGo").textContent="確定";$("gGo").disabled=true;$("mapHint").hidden=false;gM.replaceChildren()}
function place(x,y){if(!game||game.done)return;x=Math.max(0,Math.min(VW,x));y=Math.max(0,Math.min(VH,y));
  const [lon,lat]=inv(x,y);game.guess={lat,lon,x,y};$("mapHint").hidden=true;
  gM.replaceChildren();mk("circle",{class:"me",cx:x,cy:y,r:7},gM);$("gGo").disabled=false}
svg.addEventListener("click",e=>{const r=svg.getBoundingClientRect();place((e.clientX-r.left)/r.width*VW,(e.clientY-r.top)/r.height*VH)});
// 鍵盤：方向鍵移動猜測點、Enter 確定
svg.addEventListener("keydown",e=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(d){e.preventDefault();const g=game.guess||{x:VW/2,y:VH/2};place(g.x+d[0]*12,g.y+d[1]*12)}
  else if(e.key==="Enter"&&!$("gGo").disabled){e.preventDefault();$("gGo").click()}});
$("gGo").addEventListener("click",()=>{
  if(!game.done){const q=game.qs[game.i],d=km(game.guess,q),pts=score(d);game.done=true;game.total+=pts;game.log.push({q,d,pts});
    const [tx,ty]=proj(q.lon,q.lat);gM.prepend(mk("line",{class:"link",x1:game.guess.x,y1:game.guess.y,x2:tx,y2:ty}));mk("circle",{class:"true",cx:tx,cy:ty,r:8},gM);
    $("gReveal").replaceChildren(el("b",q.name),el("small",`${q.area}・${q.country}`));$("gReveal").hidden=false;
    $("gResult").replaceChildren("差了 ",el("b",`${Math.round(d).toLocaleString()} 公里`),"，拿到 ",el("b",`+${pts.toLocaleString()}`,"pts")," 分");
    $("gTotal").textContent=game.total.toLocaleString();$("gGo").textContent=game.i+1<ROUNDS?"下一題":"看結果"}
  else if(++game.i<ROUNDS)round();
  else finish()});
const rankOf=t=>t>MAX*.8?"活地圖":t>MAX*.5?"常出國的人":t>MAX*.25?"方向感還可以":"需要多開幾次門";
function finish(){const t=game.total,title=rankOf(t);
  const link=`${location.origin}${location.pathname}#c-${game.qs.map(q=>PLACES.indexOf(q)).join("-")}-s${t}`;
  const vs=game.rival==null?"":t>game.rival?`贏過朋友 ${(t-game.rival).toLocaleString()} 分。`:t===game.rival?"跟朋友打平。":`還差朋友 ${(game.rival-t).toLocaleString()} 分。`;
  const text=`我在任意門玩「門後是哪裡」拿了 ${t.toLocaleString()} 分，稱號「${title}」。${vs}同樣 5 題，你能贏我嗎？`;
  $("fTotal").textContent=`${t.toLocaleString()} / ${MAX.toLocaleString()} 分`;$("fTitle").textContent=`你是「${title}」`;$("fVs").textContent=vs;
  $("fLog").replaceChildren(...game.log.map(r=>el("li",`${r.q.name}（${r.q.country}）差 ${Math.round(r.d).toLocaleString()} 公里，${r.pts.toLocaleString()} 分`)));
  $("fLink").textContent=link;$("fThreads").href=`https://www.threads.net/intent/post?text=${encodeURIComponent(text+"\n"+link)}`;
  $("fCopy").onclick=()=>navigator.clipboard.writeText(`${text}\n${link}`).then(()=>toast("挑戰連結已複製")).catch(()=>{getSelection().selectAllChildren($("fLink"));toast("已選取連結，請手動複製")});
  $("gGo").disabled=true;$("final").hidden=false;$("final").scrollIntoView({behavior:"smooth",block:"nearest"})}
$("fAgain").addEventListener("click",()=>{history.replaceState(null,"","game.html");newGame();scrollTo({top:0,behavior:"smooth"})});
addEventListener("hashchange",()=>{const ch=parseChallenge(location.hash);if(ch)newGame(ch)});
newGame(parseChallenge(location.hash));
