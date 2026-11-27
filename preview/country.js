// 國家頁：從地球降落到 #japan / #korea / #taiwan / #thailand（組員前端 taiwan/、spots/ 通用化）。
// 網址：country.html#taiwan 或 country.html#taiwan/<地點 id>（直接打開那扇窗）。
// 播放交給 media-player.js、天氣交給 weather.js（錯誤處理、取消請求、不顯示虛構數字都在那兩支）。
import * as THREE from "./vendor/three.module.min.js";
import {SIGNS,CATS,GEN,PLACES as MYSTIC,ORDER} from "./mystic.js";
import {STORIES} from "./stories.js";
import {initShell,places as ALL,countries,sources,countryOf,thumbOf,firstVideo,isSaved,toggleSaved,onSavedChange,byId} from "./shell.js";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const RM=matchMedia("(prefers-reduced-motion:reduce)").matches;
initShell();

/* ---------- 這一國的資料 ---------- */
const route=()=>{const [k,id]=location.hash.slice(1).split("/");return [k,id&&decodeURIComponent(id)]};
let [KEY,START]=route();if(!countries[KEY])KEY="taiwan";
const C=countries[KEY],P=ALL.filter(p=>countryOf(p)===KEY);
addEventListener("hashchange",()=>{const [k,id]=route();if(k&&k!==KEY&&countries[k]){location.reload();return}
  if(id&&id!==openId)openDetail(id);else if(!id&&openId)closeDetail()});
const vidOf=u=>(String(u).match(/[?&]v=([\w-]{11})/)||[])[1];
// 夜之門：組員整理的 5 個地點，用直播影片 ID 對到目錄裡的地點
const NIGHT=new Map();for(const k of ORDER){const v=vidOf(MYSTIC[k].url);const p=P.find(x=>(sources[x.id]||[]).some(s=>s.videoId===v));if(p)NIGHT.set(p.id,k)}
document.title=`任意門 — 深入探索${C.name}`;
$("crumbN").textContent=C.name;$("title").textContent=`深入探索${C.name}。`;
$("lead").textContent="從山海到街角，看見此刻的日常。點標點飛過去，打開那裡的窗。";
$("pTitle").prepend(`${C.name}・從這裡開始`);
const regionsAll=[...new Set(P.map(p=>p.region).filter(Boolean))];
{const n=r=>P.filter(p=>p.region===r).length;regionsAll.sort((a,b)=>n(b)-n(a));
  for(const r of regionsAll)$("reg").append(new Option(`${r}（${n(r)}）`,r));
  const play=P.filter(p=>p.embeddableCount).length;
  $("figs").innerHTML=`<div><b>${P.length}</b><span>扇窗</span></div><div><b>${play}</b><span>可在站內試播</span></div><div><b>${regionsAll.length}</b><span>個地區</span></div>`;
  $("sub").textContent=`${P.length} 扇窗・${regionsAll.length} 個地區`;
  $("nHot").textContent=P.filter(p=>p.tier==="hot").length;$("nAll").textContent=P.length;
  const cc={};P.forEach(p=>{if(p.category)cc[p.category]=(cc[p.category]||0)+1});
  $("cats").innerHTML=`<button type="button" data-c="" aria-pressed="true">全部</button>`+Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`<button type="button" data-c="${esc(k)}" aria-pressed="false">${esc(k)}<small>${n}</small></button>`).join("");
  $("dock").innerHTML=["japan","korea","taiwan","thailand"].map(k=>`<a href="country.html#${k}"${k===KEY?' aria-current="page"':""}>${esc(countries[k].name)}<small>${window.SomewhereCatalog.counts[k].places}</small></a>`).join("")}

/* ---------- 3D：同一顆地球（沒有 WebGL 時清單、景點面板照常可用） ---------- */
const canvas=$("gl"),stage=$("stage"),R=1,deg=Math.PI/180;
let renderer=null;try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true})}catch(e){}
const vec=(lat,lon,r=R)=>{const a=(90-lat)*deg,t=(lon+180)*deg;return new THREE.Vector3(-r*Math.sin(a)*Math.cos(t),r*Math.cos(a),r*Math.sin(a)*Math.sin(t))};
// 一群點的取景：去掉頭尾 3% 的離群點（例如沖繩、離島），讓國土佔畫面約 55% 高
const q=(arr,f)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.round(f*(s.length-1))]};
function frameOf(list,minSpan=.35){const lo=list.map(p=>p.point[0]),la=list.map(p=>p.point[1]),w=q(lo,.03),e=q(lo,.97),s=q(la,.03),n=q(la,.97),lat=(s+n)/2;
  const span=Math.max(minSpan,n-s,(e-w)*Math.cos(lat*deg));return {lat,lon:(w+e)/2,dist:1+Math.max(.012,span*deg/(.536*.55))}}
const HOME=frameOf(P,2);
// 起點＝首頁放大結束的畫面（home.js ARRIVE、對準這國的入口地點），再降落到全國取景
const E=byId.get(KEY)?.point||[HOME.lon,HOME.lat],cam={lat:E[1],lon:E[0],dist:2.2};let tween=null;
function fly(to,ms=1600){const from={...cam},t0=performance.now();tween={from,to,t0,ms:RM?1:ms}}
function step(now){if(!tween)return;const k=Math.min(1,(now-tween.t0)/tween.ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
  for(const key of ["lat","lon"])cam[key]=tween.from[key]+(tween.to[key]-tween.from[key])*e;
  cam.dist=1+(tween.from.dist-1)*Math.pow((tween.to.dist-1)/(tween.from.dist-1),e);// 距離走對數，降落感比較自然
  if(k>=1)tween=null}
let frame=null;
if(!renderer){const m=document.createElement("p");m.className="nogl glass";m.textContent="這個瀏覽器無法顯示 3D 地球；右側清單和景點面板仍可正常使用。";stage.append(m)}
else frame=await setup3D();
async function setup3D(){
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setClearColor(0x000000,0);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.002,200);
  const L=new THREE.TextureLoader(),small=Math.min(innerWidth,innerHeight)<700;
  const [dayT,nightT,waterT,topoT,twT,twM,jkT,jkM,cloudT]=await Promise.all([small?"day-2k":"day","night","water","topo","taiwan","taiwan-mask","japan-korea","japan-korea-mask","clouds"].map(u=>L.loadAsync("assets/earth/"+u+".webp")));
  [dayT,nightT,twT,jkT].forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8});
  const SUN0=new THREE.Vector3(0,0,1);
  const earthMat=new THREE.ShaderMaterial({uniforms:{dayT:{value:dayT},nightT:{value:nightT},waterT:{value:waterT},topoT:{value:topoT},sun:{value:SUN0}},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform sampler2D dayT;uniform sampler2D nightT;uniform sampler2D waterT;uniform sampler2D topoT;uniform vec3 sun;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
  void main(){vec3 N=normalize(vN),V=normalize(vV);
  vec3 T=normalize(cross(vec3(0.,1.,0.),N)+vec3(1e-4,0.,0.));vec3 B=cross(N,T);
  vec2 e=vec2(1./2048.,1./1024.);float hx=texture2D(topoT,vUv+vec2(e.x,0.)).r-texture2D(topoT,vUv-vec2(e.x,0.)).r;float hy=texture2D(topoT,vUv+vec2(0.,e.y)).r-texture2D(topoT,vUv-vec2(0.,e.y)).r;
  float w=smoothstep(.4,.7,texture2D(waterT,vUv).r);
  vec3 Nb=normalize(N+(1.-w)*3.5*(hx*T-hy*B));
  float d=dot(N,sun),db=dot(Nb,sun);float m=smoothstep(-.3,.25,d);
  vec3 tex=texture2D(dayT,vUv).rgb;float lum=dot(tex,vec3(.299,.587,.114));
  vec3 land=pow(tex,vec3(.7))*1.16;
  float ice=smoothstep(.55,.8,lum);
  vec3 ocean=mix(vec3(.015,.09,.22),vec3(.05,.24,.4),smoothstep(.02,.16,lum))+tex*.45;
  vec3 base=mix(land,ocean,w*(1.-ice));
  float wrap=clamp((db+.25)/1.25,0.,1.);
  vec3 day=base*(.18+1.15*wrap)+base*vec3(.18,.32,.5)*(1.-wrap)*.7;
  vec3 H=normalize(sun+V);day+=vec3(1.,.96,.9)*(pow(max(dot(N,H),0.),60.)*w*.45+pow(max(dot(N,H),0.),10.)*w*.05);
  vec3 night=pow(texture2D(nightT,vUv).rgb,vec3(1.3))*vec3(2.,1.5,1.)+base*.22+vec3(.015,.04,.09);
  vec3 col=mix(night,day,m);
  float rim=1.-max(dot(N,V),0.);float sside=smoothstep(-.2,.7,d);
  col=mix(col,vec3(.75,.9,1.),pow(rim,2.2)*(.25+.75*sside));
  col+=vec3(.04,.08,.13)*pow(rim,1.)*m;
  gl_FragColor=vec4(col,1.);}`});
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R,128,96),earthMat));
  const glowMat=new THREE.ShaderMaterial({uniforms:{ld:{value:new THREE.Vector2(-1,.3)},uF:{value:1}},transparent:true,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneFactor,depthWrite:false,
  vertexShader:`varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec2 ld;uniform float uF;varying vec2 vP;void main(){float r=length(vP);vec2 n=vP/max(r,1e-4);float side=.18+.82*smoothstep(-.5,.85,dot(n,normalize(ld)));
  float g=r<1.?smoothstep(.9,1.,r)*.55:exp(-(r-1.)*14.)*.95+exp(-(r-1.)*3.2)*.42+exp(-(r-1.)*1.1)*.12;
  vec3 c=mix(vec3(.55,.78,1.),vec3(.92,.97,1.),smoothstep(.8,1.05,r)*side);vec3 o=c*g*side*uF;gl_FragColor=vec4(o,clamp(max(o.r,max(o.g,o.b)),0.,1.));}`});
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(R*5,R*5),glowMat);scene.add(glow);
  const cloudMat=new THREE.ShaderMaterial({uniforms:{cT:{value:cloudT},sun:{value:SUN0},uF:{value:1}},transparent:true,depthWrite:false,
  vertexShader:`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D cT;uniform vec3 sun;uniform float uF;varying vec2 vUv;varying vec3 vN;void main(){float a=texture2D(cT,vUv).r*(1.-smoothstep(.32,.44,abs(vUv.y-.5)));float l=.3+.75*smoothstep(-.2,.45,dot(normalize(vN),sun));gl_FragColor=vec4(vec3(1.,1.,1.02)*l,clamp(a*1.4,0.,1.)*.8*uF);}`});
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.008,128,96),cloudMat);clouds.renderOrder=3;scene.add(clouds);
  const NOISE=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
  float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*vnoise(p);p=m*p;a*=.5;}return v;}
  uniform vec2 fc;
  float cloudD(vec2 ll,float tm){vec2 p=ll*vec2(1.15,1.3)+vec2(tm*.035,tm*.008);vec2 q=vec2(fbm(p),fbm(p+vec2(5.2,1.3)));float d=fbm(p*1.3+1.7*q);
    float band=.5+.5*sin(ll.y*.55+1.3);vec2 tc=(ll-fc)/vec2(1.6,1.4);float isl=1.-.85*exp(-dot(tc,tc)*1.4);return smoothstep(.6,.86,d+.05*band)*isl;}`;
  const FC=new THREE.Vector2(HOME.lon,HOME.lat);
  // 高解析地形貼片：台灣（117–124E、20.5–27.5N）、日韓（124–142E、31–41N），NASA Blue Marble 地形＋海底地形
  function patch(tex,mask,BB){const mat=new THREE.ShaderMaterial({uniforms:{t:{value:tex},mk:{value:mask},sun:{value:SUN0},uF:{value:0},tm:{value:0},fc:{value:FC},bb:{value:new THREE.Vector4(BB.w,BB.s,BB.e-BB.w,BB.n-BB.s)}},transparent:true,depthWrite:false,
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform sampler2D t;uniform sampler2D mk;uniform vec3 sun;uniform float uF;uniform float tm;uniform vec4 bb;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
  ${NOISE}
  void main(){vec3 c=texture2D(t,vUv).rgb;
   vec3 N=normalize(vN),V=normalize(vV);
   vec3 M=texture2D(mk,vUv).rgb;float w=M.r,foam=M.g,shallow=M.b;
   vec3 land=pow(c,vec3(.78))*1.22;float l=dot(land,vec3(.299,.587,.114));land=mix(vec3(l),land,1.12);
   vec3 sea=pow(c,vec3(.9))*vec3(.85,1.,1.12)*1.12;
   sea=mix(sea,vec3(.12,.55,.66),shallow*.55);
   vec3 col=mix(land,sea,w);
   col+=vec3(.75,.92,1.)*foam*.55;
   float wrap=clamp((dot(N,sun)+.25)/1.25,0.,1.);col*=.9+.28*wrap;
   vec2 ll=bb.xy+vUv*bb.zw;
   vec2 wp=ll*38.+vec2(tm*.6,tm*.25);vec3 Nw=normalize(N+(vec3(vnoise(wp)-.5,vnoise(wp+9.)-.5,0.)*.18)*w);
   vec3 H=normalize(sun+V);float sp=pow(max(dot(Nw,H),0.),220.)*1.6+pow(max(dot(N,H),0.),18.)*.12;col+=vec3(1.,.96,.88)*sp*w;
   float sh=cloudD(ll+vec2(.09,-.07),tm);col*=1.-sh*.16;
   vec2 q=min(vUv,1.-vUv)*bb.zw;float edge=smoothstep(0.,1.1,min(q.x,q.y));gl_FragColor=vec4(col,edge*uF);}`});
  const m=new THREE.Mesh(new THREE.SphereGeometry(R*1.0004,160,128,(BB.w+180)*deg,(BB.e-BB.w)*deg,(90-BB.n)*deg,(BB.n-BB.s)*deg),mat);m.renderOrder=2;scene.add(m);return mat}
  const patches=[patch(twT,twM,{w:117,e:124,s:20.5,n:27.5}),patch(jkT,jkM,{w:124,e:142,s:31,n:41})];
  // 近景雲層（程序生成，會慢慢飄；畫面中心的國家上空留空）
  const CB={w:90,e:150,s:2,n:47};
  const lowMat=new THREE.ShaderMaterial({uniforms:{sun:{value:SUN0},uF:{value:0},tm:{value:0},fc:{value:FC}},transparent:true,depthWrite:false,
  vertexShader:`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 sun;uniform float uF;uniform float tm;varying vec2 vUv;varying vec3 vN;
  ${NOISE}
  void main(){vec2 ll=vec2(${CB.w}.+vUv.x*${CB.e-CB.w}.,${CB.s}.+vUv.y*${CB.n-CB.s}.);float d=cloudD(ll,tm);
   float d2=cloudD(ll+vec2(-.05,.04),tm);float lit=clamp(.75+(d-d2)*1.2,0.,1.);
   float wrap=clamp((dot(normalize(vN),sun)+.3)/1.3,0.,1.);
   vec3 col=mix(vec3(.8,.86,.94),vec3(1.,1.,.99),lit)*(.86+.2*wrap);
   vec2 q=min(vUv,1.-vUv);float edge=smoothstep(0.,.12,min(q.x,q.y));
   gl_FragColor=vec4(col,pow(d,.8)*.8*edge*uF);}`});
  const low=new THREE.Mesh(new THREE.SphereGeometry(R*1.0045,160,160,(CB.w+180)*deg,(CB.e-CB.w)*deg,(90-CB.n)*deg,(CB.n-CB.s)*deg),lowMat);low.renderOrder=6;scene.add(low);
  // 一級行政區界線（縣市、都道府縣、道；泰國沒有）
  const lineMat=new THREE.LineBasicMaterial({color:0xe8f4ff,transparent:true,opacity:0,depthWrite:false});
  const B=window.SOMEWHERE_REGIONS?.[C.iso]?.borders;
  if(B){const a=[];for(const line of B.coordinates)for(let i=0;i+1<line.length;i++){const p=vec(line[i][1],line[i][0],R*1.0008),q2=vec(line[i+1][1],line[i+1][0],R*1.0008);a.push(p.x,p.y,p.z,q2.x,q2.y,q2.z)}
    const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(a,3));const ls=new THREE.LineSegments(g,lineMat);ls.renderOrder=4;scene.add(ls)}
  function size(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()}
  addEventListener("resize",size);size();
  /* 拖曳旋轉、滾輪／雙指縮放、放手慣性 */
  const ptr=new Map();let moved=0,vel={x:0,y:0},pinch0=0,dist0=0;
  const MAXD=Math.max(4.2,HOME.dist*1.6),degPx=()=>Math.min(.45,(cam.dist-1)*.536/canvas.clientHeight/deg*1.1);
  canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;vel={x:0,y:0};tween=null;
    if(ptr.size===2){const [a,b]=[...ptr.values()];pinch0=Math.hypot(a.x-b.x,a.y-b.y);dist0=cam.dist}});
  const up=e=>{const tap=ptr.size===1&&moved<6&&e.type==="pointerup";ptr.delete(e.pointerId);canvas.style.cursor="";if(tap)pick(e)};
  // 點地圖選地區：取點到的經緯度，找最近的景點，飛到它所在的地區。
  // shortcut: 沒有縣市多邊形，用「最近景點的地區」近似；邊界附近可能選到隔壁縣市，有多邊形資料時改成點在多邊形內判斷。
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),globe=new THREE.Sphere(new THREE.Vector3(),R),hitP=new THREE.Vector3();
  function pick(e){if(openId)return;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);
    if(!ray.ray.intersectSphere(globe,hitP))return;const lat=Math.asin(hitP.y/R)/deg,lon=((Math.atan2(hitP.z,-hitP.x)/deg-180)%360+540)%360-180,cl=Math.cos(lat*deg);
    let best=null,bd=.8**2;for(const p of P){if(!p.region)continue;const dx=(p.point[0]-lon)*cl,dy=p.point[1]-lat,d=dx*dx+dy*dy;if(d<bd){bd=d;best=p}}
    if(best&&best.region!==region)setRegion(best.region)}
  canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
  canvas.addEventListener("pointermove",e=>{const p=ptr.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(ptr.size===2){const [a,b]=[...ptr.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);cam.dist=Math.min(MAXD,Math.max(1.012,1+(dist0-1)*pinch0/d));moved+=9;vel={x:0,y:0};return}
    moved+=Math.abs(dx)+Math.abs(dy);const k=degPx();cam.lon-=dx*k;cam.lat=Math.max(-80,Math.min(80,cam.lat+dy*k));vel={x:dx*k,y:dy*k};canvas.style.cursor="grabbing"});
  canvas.addEventListener("wheel",e=>{e.preventDefault();tween=null;cam.dist=Math.min(MAXD,Math.max(1.012,1+(cam.dist-1)*Math.exp(e.deltaY*.0013)))},{passive:false});
  function inertia(){if(ptr.size||tween)return;if(Math.abs(vel.x)+Math.abs(vel.y)<1e-4)return;cam.lon-=vel.x;cam.lat=Math.max(-80,Math.min(80,cam.lat+vel.y));vel.x*=.92;vel.y*=.92}
  const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)},tmp=new THREE.Vector3();
  return function draw(now){step(now);inertia();
    const dir=vec(cam.lat,cam.lon).normalize();camera.position.copy(dir).multiplyScalar(cam.dist);camera.up.set(0,1,0);camera.lookAt(0,0,0);
    // 太陽：從左上打光（藝術光，不是真實晝夜：國家頁要看得清楚）
    const rt=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize(),upv=new THREE.Vector3().crossVectors(dir,rt);
    const sun=dir.clone().multiplyScalar(.62).addScaledVector(rt,-.62).addScaledVector(upv,.38).normalize();
    earthMat.uniforms.sun.value=sun;cloudMat.uniforms.sun.value=sun;lowMat.uniforms.sun.value=sun;const T=now/1000;lowMat.uniforms.tm.value=T;for(const m of patches){m.uniforms.sun.value=sun;m.uniforms.tm.value=T}
    glow.quaternion.copy(camera.quaternion);glowMat.uniforms.ld.value.set(sun.dot(rt),sun.dot(upv));
    const z=cam.dist,H=HOME.dist;
    const pf=1-sm(Math.max(1.55,H*1.1),Math.max(2.3,H*1.5),z);for(const m of patches)m.uniforms.uF.value=pf;
    lowMat.uniforms.uF.value=(1-sm(1.35,2,z))*sm(1.06,1.15,z);
    cloudMat.uniforms.uF.value=sm(Math.max(1.18,H*1.05),Math.max(1.9,H*1.6),z);glowMat.uniforms.uF.value=sm(1.4,2.2,z);
    lineMat.opacity=.42*(1-sm(H*1.05,H*1.35,z));
    $("skybg").style.opacity=String(sm(1.25,1.9,z));
    const pinsOn=1-sm(H*1.2,H*1.5,z);$("pins").style.opacity=String(pinsOn);$("pins").classList.toggle("off",pinsOn<=.5);
    if(pinsOn>0){const r=canvas.getBoundingClientRect();for(const p of pinEls){tmp.copy(p.v).project(camera);
      const vis=p.v.dot(camera.position)>R*R*1.0005;p.d.hidden=!vis;
      p.d.style.transform=`translate(${(tmp.x+1)/2*r.width}px,${(1-tmp.y)/2*r.height}px)`}}
    renderer.render(scene,camera);requestAnimationFrame(draw)}
}

/* ---------- 清單與標點 ---------- */
const hh=s=>{let h=2166136261;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return h>>>0};
const SCENE={"海岸":"sea","港口漁港":"sea","河川":"sea","山岳":"mtn","火山":"mtn","動物自然":"mtn","道路":"road","機場":"road","城市街景":"city","商店街・店家":"city","車站鐵道":"city","觀光地":"city"};
const SKY=[["#ffcf9a","#6aa9d8"],["#9fd3f2","#3e82b8"],["#f6b38a","#4a6fa5"],["#bfe4f7","#5a9ccc"],["#2a4a7a","#0f2240"]];
function scene2(p){const n=hh(p.id),k=SCENE[p.category]||"city",[a,b]=SKY[n%SKY.length],g="g"+(n%1e6);
  const ground={sea:`<rect y="62" width="120" height="40" fill="#2d6fa3"/><path d="M0 66h120M0 74h120M0 84h120" stroke="rgba(255,255,255,.35)"/>`,
    mtn:`<path d="M0 70 28 36 48 58 70 26 96 54 120 40V100H0z" fill="#3d6b62"/><path d="M0 82 40 60 76 78 120 62V100H0z" fill="#2c5249"/>`,
    road:`<rect y="64" width="120" height="40" fill="#4a5a6a"/><path d="M60 64 20 100M60 64 100 100" stroke="#e9eef4" stroke-width="2"/><path d="M60 66v34" stroke="#ffd27a" stroke-width="1.5" stroke-dasharray="4 4"/>`,
    city:`<path d="M0 100V62h12V48h14v20h10V40h16v26h12V52h18v18h12V58h26v42z" fill="#28405e"/><path d="M30 56h3M30 62h3M58 46h4M58 54h4M88 60h4" stroke="#ffd98a" stroke-width="2"/>`}[k];
  return `<svg viewBox="0 0 120 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><rect width="120" height="100" fill="url(#${g})"/><circle cx="${84-(n%5)*10}" cy="34" r="9" fill="rgba(255,244,214,.85)"/>${ground}</svg>`}
let tab="hot",cat="",region="",pinEls=[],openId=null;
const pool=()=>P.filter(p=>(tab==="all"||p.tier==="hot")&&(!cat||p.category===cat));
function visible(){const qq=$("q").value.trim().toLowerCase();
  return pool().filter(p=>(!region||p.region===region)&&(!qq||[p.name,p.region,p.category,...(p.aliases||[])].join(" ").toLowerCase().includes(qq)))}
function renderList(){const v=visible(),box=$("list");
  box.innerHTML=`<div class="count">${v.length} 扇窗${tab==="hot"&&P.some(p=>p.tier!=="hot")?"・切到「全部」看更多":""}</div>`+(v.length?v.map(p=>{const th=thumbOf(p.id);
    return `<button type="button" class="card${p.id===openId?" on":""}" data-id="${esc(p.id)}"><span class="win">${scene2(p)}${th?`<img src="${esc(th)}" alt="" loading="lazy">`:""}<span class="badge">${p.embeddableCount?"▶ 可試播":"原站觀看"}</span></span>
    <span class="meta"><span class="tags">${p.tier==="hot"?'<span class="hot">熱門</span>':""}${NIGHT.has(p.id)?'<span class="night">夜之門</span>':""}<span>${esc(p.region||"")}</span>${p.category?`<span>${esc(p.category)}</span>`:""}</span><h3>${esc(p.name)}</h3><span class="open">打開這扇窗 →</span></span></button>`}).join(""):`<div class="empty">這裡暫時沒有窗。<br>換個類別、切到「全部」或清除篩選試試。</div>`);
  $("chip").hidden=!region;$("chipT").textContent=region;$("back").hidden=!region}
$("list").addEventListener("error",e=>{if(e.target.tagName==="IMG")e.target.remove()},true);// 縮圖載入失敗就露出示意窗景
// 標點：全國看地區（一個地區一個點、帶數量），進到地區後一個景點一個點
function renderPins(){if(!frame)return;const box=$("pins"),v=visible(),groups=new Map();
  for(const p of v){const k=region?p.point.map(x=>x.toFixed(3)).join(","):p.region||p.id;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
  box.replaceChildren();pinEls=[...groups.values()].map(list=>{const lon=list.reduce((s,p)=>s+p.point[0],0)/list.length,lat=list.reduce((s,p)=>s+p.point[1],0)/list.length;
    const d=document.createElement("button");d.type="button";d.className="pin"+(list.every(p=>p.tier!=="hot")?" general":"");d.innerHTML=`<i></i>${list.length>1?`<b>${list.length}</b>`:""}`;
    const name=region?list[0].name:(list[0].region||list[0].name);d.setAttribute("aria-label",region?`打開${name}${list.length>1?` 等 ${list.length} 扇窗`:""}`:`${name}，${list.length} 扇窗，飛過去`);
    d.addEventListener("click",e=>{e.stopPropagation();if(region)openDetail(list[0].id);else setRegion(list[0].region)});
    d.addEventListener("mouseenter",()=>{const r=d.getBoundingClientRect(),t=$("tip");t.replaceChildren(Object.assign(document.createElement("b"),{textContent:region?list[0].name+(list.length>1?` 等 ${list.length} 處`:""):name}),Object.assign(document.createElement("span"),{textContent:region?(list[0].category||list[0].region):`${list.length} 扇窗`}));t.style.left=r.left+"px";t.style.top=r.top+"px";t.style.opacity=1});
    d.addEventListener("mouseleave",()=>$("tip").style.opacity=0);
    box.append(d);return {d,ids:list.map(p=>p.id),v:vec(lat,lon,R*1.001)}});markPins()}
function markPins(){const p=openId&&byId.get(openId);for(const x of pinEls)x.d.classList.toggle("on",!!p&&(x.ids.includes(openId)||(!region&&byId.get(x.ids[0]).region===p.region)))}
function sync(){renderList();renderPins();
  $("tHot").setAttribute("aria-selected",tab==="hot");$("tAll").setAttribute("aria-selected",tab==="all");
  document.querySelectorAll("#cats button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.c===cat));$("reg").value=region}
function setRegion(r){region=r||"";const list=region?P.filter(p=>p.region===region):P;fly(region?frameOf(list):{...HOME},1300);sync()}
function home(){setRegion("")}
$("cats").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;cat=b.dataset.c;sync()});
$("tHot").onclick=()=>{tab="hot";sync()};$("tAll").onclick=()=>{tab="all";sync()};
$("q").addEventListener("input",sync);$("reg").addEventListener("change",e=>setRegion(e.target.value));
$("list").addEventListener("click",e=>{const a=e.target.closest(".card");if(a)openDetail(a.dataset.id)});
$("chipX").onclick=home;$("back").onclick=home;
$("list").addEventListener("mouseover",e=>{const a=e.target.closest(".card");if(!a)return;for(const x of pinEls)x.d.classList.toggle("on",x.ids.includes(a.dataset.id))});
$("list").addEventListener("mouseleave",markPins);

/* ---------- 景點詳細：影像、天氣、夜之門、留言 ---------- */
const timeAt=()=>new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:C.zone});
function openDetail(id){const p=byId.get(id);if(!p)return;
  if(countryOf(p)!==KEY){location.hash=`${countryOf(p)}/${encodeURIComponent(id)}`;return}// 別國的地點：換頁
  openId=id;const to=$("dTo");to.replaceChildren("通往 ",Object.assign(document.createElement("b"),{textContent:p.name}),`・當地 ${timeAt()}`);
  $("dName").textContent=p.name;$("dWhere").textContent=[p.region,p.category,p.coordinatePrecision].filter(Boolean).join("・");
  const th=thumbOf(id),img=$("detail-photo");img.hidden=!th;if(th){img.src=th;img.alt=p.name+" 影片縮圖"}else img.removeAttribute("src");
  $("bigplay").hidden=!firstVideo(id);
  window.SomewhereMedia?.selectDestination(id);window.SomewhereWeather?.selectPlace(p);
  syncSave();renderNight();renderComments();$("dScroll").scrollTop=0;
  const d=$("destination-dialog");d.classList.add("open");d.setAttribute("aria-hidden","false");document.body.classList.add("dopen");
  fly({lat:p.point[1]+.12*(HOME.dist>1.3?1:.5),lon:p.point[0]-.02,dist:Math.min(1.07,HOME.dist)},1300);
  if(route()[1]!==id)history.replaceState(null,"",`#${KEY}/${encodeURIComponent(id)}`);
  document.querySelectorAll(".card").forEach(c=>c.classList.toggle("on",c.dataset.id===id));markPins()}
function closeDetail(){if(!openId)return;openId=null;window.SomewhereMedia?.close();const d=$("destination-dialog");d.classList.remove("open");d.setAttribute("aria-hidden","true");document.body.classList.remove("dopen");
  history.replaceState(null,"",`#${KEY}`);fly(region?frameOf(P.filter(p=>p.region===region)):{...HOME},1200);document.querySelectorAll(".card.on").forEach(c=>c.classList.remove("on"));markPins()}
$("dX").onclick=closeDetail;
addEventListener("keydown",e=>{if(e.key==="Escape"&&openId)closeDetail()});
$("bigplay").addEventListener("click",()=>window.SomewhereMedia?.play());
const syncSave=()=>{if(!openId)return;const on=isSaved(openId);$("dSave").setAttribute("aria-pressed",String(on));$("dSave").textContent=on?"♥ 已收藏":"♡ 收藏"};
$("dSave").addEventListener("click",()=>{if(openId)toggleSaved(openId)});onSavedChange(syncSave);
$("cForm").addEventListener("submit",e=>e.preventDefault());

/* 示意留言：後端還沒接，先依景點 id 固定挑 2～3 則（同一景點每次看到一樣），標題旁已註明「示意留言」 */
const CM_WHO=["小島旅人","阿哲","Mina","在路上的貓","週末出走","Yuki","背包客老王","晴天娃娃","慢慢走","Hana","夜貓子","Leo"];
const CM_ANY=["半夜睡不著就打開這扇窗，看著{n}的畫面，好像真的出門了一趟。","去年去過{n}，看到畫面整個回憶都回來了。","下次出國一定要排{n}，先收藏起來。","畫面好療癒，開著當背景工作剛剛好。","原來現在{n}是這個樣子，跟我印象中差好多。","跟家人一起看，大家都在討論下一趟要去哪。"];
const CM_CAT={山岳:["天氣好的時候山的稜線好清楚，好想去爬。","{n}的雲海是真的美，運氣好才看得到。"],海岸:["光看浪就覺得放鬆了，好想聽現場的海浪聲。","夕陽時段來看{n}最漂亮。"],河川:["河邊散步一定很舒服，{n}看起來好悠閒。"],
  城市街景:["街上的人來來去去，看著就有種在當地喝咖啡的感覺。","晚上來看{n}，燈一亮整個氣氛都不一樣。"],車站鐵道:["一直等火車進站，等到的那一刻好開心！","鐵道迷表示這扇窗可以看一整天。"],機場:["看飛機起降好紓壓，好想直接飛走。"],
  觀光地:["{n}人好多，在家看反而比較悠閒哈哈。","之前去{n}排了好久，還是很值得。"],溫泉:["看著冒煙的畫面就覺得暖起來了。"],港口漁港:["漁船進港的時候好熱鬧，好想去吃海鮮。"],道路:["看車流也能看得很入迷，好奇大家都要去哪裡。"],滑雪場:["雪季快到了！今年想去{n}滑雪。"]};
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0};
let csort="new";
function renderComments(){const box=$("cList"),p=openId&&byId.get(openId);if(!box||!p)return;let h=hash(p.id);const r=k=>(h=Math.imul(h^h>>>15,2246822507)>>>0)%k;
  const pool=[...(CM_CAT[p.category]||[]),...CM_ANY],rows=[];
  for(let i=0,n=2+r(2);i<n;i++){const t=pool.splice(r(pool.length),1)[0];rows.push({who:CM_WHO[r(CM_WHO.length)],days:1+r(60),likes:r(40),text:t.replaceAll("{n}",p.name)})}
  rows.sort((a,b)=>csort==="hot"?b.likes-a.likes:a.days-b.days);
  box.innerHTML=rows.map(c=>`<article class="cm"><span class="av" aria-hidden="true">${esc([...c.who][0])}</span><div><div class="mt"><b>${esc(c.who)}</b><span>${c.days<30?c.days+" 天前":Math.round(c.days/30)+" 個月前"}</span></div>
    <p>${esc(c.text)}</p><span class="like" aria-label="${c.likes} 個讚"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>${c.likes}</span></div></article>`).join("")}
document.querySelector(".talk .sorts").addEventListener("click",e=>{const b=e.target.closest("[data-csort]");if(!b)return;csort=b.dataset.csort;
  document.querySelectorAll("[data-csort]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderComments()});

/* 夜之門：星座運勢（同一天、同一地點、同一星座結果固定）與都市傳說 */
const today=new Date(),dkey=`${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
const pk=(arr,k)=>arr[hh(k)%arr.length];
function fortune(key,si){const p=MYSTIC[key],sg=SIGNS[si],sc={};
  for(const [k] of CATS){let v=1+hh(`${dkey}|${key}|${si}|${k}`)%5;if(sg[2]===p.elem&&(k==="luck"||k==="trip"))v++;sc[k]=Math.min(5,v)}
  const w=k=>sc[k]+(hh(`${dkey}${key}${si}${k}t`)%100)/1000,top=CATS.reduce((a,c)=>w(c[0])>w(a[0])?c:a,CATS[0]),spot=pk(p.spots,`${dkey}${key}${si}s`);
  const useSp=p.special[top[0]]&&hh(`${dkey}${key}${si}x`)%2===0,line=useSp?p.special[top[0]]:pk(GEN[top[0]],`${dkey}${key}${si}m`).replace("{spot}",spot);
  return{sc,top,spot,line,total:Math.round(CATS.reduce((a,c)=>a+sc[c[0]],0)/CATS.length*20),item:pk(p.items,`${dkey}${key}${si}i`),color:pk(p.colors,`${dkey}${key}${si}c`)}}
const store={get(k,d){try{return localStorage.getItem(k)??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
let sign=+store.get("door-sign",10);if(!(sign>=0&&sign<12))sign=10;const NTABS=[["fort","星座運勢"],["legend","都市傳說"],["story","景點故事"]];let ntab=store.get("door-ntab","fort");if(!NTABS.some(([k])=>k===ntab))ntab="fort";
const host=u=>new URL(u).hostname.replace(/^www./,"");
function renderNight(){const box=$("nightBox"),key=openId&&NIGHT.get(openId);
  if(!key){box.innerHTML=`<div class="soon">星座運勢、都市傳說與景點故事目前在東京、大阪、首爾、釜山、墾丁開放，其他地點會陸續加入。</div>`;return}
  const p=MYSTIC[key];let inner;
  if(ntab==="fort"){const f=fortune(key,sign),s=SIGNS[sign];
    inner=`<div class="signs" role="group" aria-label="選星座">${SIGNS.map((x,i)=>`<button type="button" data-sign="${i}" aria-pressed="${i===sign}">${esc(x[0])}<small>${fortune(key,i).total}</small></button>`).join("")}</div>
    <div class="fort"><div class="fd">${today.getMonth()+1} 月 ${today.getDate()} 日・${esc(s[0])}座（${esc(s[1])}）・${esc(s[2])}象</div><h5>${esc(s[0])}座在${esc(p.name)}：${esc(f.top[1])}運最旺</h5><p>${esc(f.line)}</p>
    <ul class="bars">${CATS.map(([k,n])=>`<li class="${k===f.top[0]?"top":""}"><span>${esc(n)}</span><i role="img" aria-label="${esc(n)} ${f.sc[k]} 顆星，滿分 5"><em data-w="${f.sc[k]*20}"></em></i><b>${f.sc[k]}/5</b></li>`).join("")}</ul>
    <div class="lucky"><div><span>幸運地點</span>${esc(f.spot)}</div><div><span>幸運小物</span>${esc(f.item)}</div><div><span>幸運色</span>${esc(f.color)}</div></div></div>
    <p class="small">運勢依日期、地點與星座產生，每天更新，僅供娛樂。</p>`}
  else if(ntab==="story")inner=(STORIES[key]||[]).map(s=>`<details class="story"><summary><img src="${esc(s.img)}" alt="" loading="lazy" width="88" height="66"><span><span class="tags">${s.tags.map(t=>`<em>${esc(t)}</em>`).join("")}</span><h5>${esc(s.title)}</h5><span class="lead">${esc(s.lead)}</span></span></summary>
    <figure><img src="${esc(s.img)}" alt="${esc(s.title)}" loading="lazy"><figcaption>${s.stand_in?"示意照片・":""}照片：<a href="${esc(s.photo.page)}" target="_blank" rel="noopener noreferrer">${esc(s.photo.author)}</a>／${esc(s.photo.license)}／Wikimedia Commons</figcaption></figure>
    ${s.body.map(b=>`<p>${esc(b)}</p>`).join("")}${s.tip?`<p class="tip"><b>小提醒</b>${esc(s.tip)}</p>`:""}${s.sources.length?`<div class="src">來源：${s.sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(host(u))}</a>`).join("、")}</div>`:""}</details>`).join("")+`<p class="small">景點故事整理自公開資料；標示「都市傳說」「恐怖怪談」的內容屬民間說法。</p>`;
  else inner=p.legends.map(l=>`<article class="lg"><div class="fear" aria-label="恐怖指數 ${l.f}，滿分 5">恐怖指數 ${[1,2,3,4,5].map(n=>`<i class="${n<=l.f?"on":""}"></i>`).join("")}</div>
    <h5>${esc(l.t)}</h5><div class="where">${esc(l.w)}</div><p>${esc(l.s)}</p><p class="why"><b>${esc(l.y[0])}：</b>${esc(l.y[1])}</p>
    <div class="src">出處：${l.src.map(([n,u])=>/^https:\/\//.test(u)?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>`:esc(n)).join("、")}</div></article>`).join("")+`<p class="small">都市傳說整理自網路公開資料，真實性未經查證，僅供娛樂。</p>`;
  box.innerHTML=`<section class="night" aria-label="夜之門"><header><h3>夜之門・${esc(p.name)}</h3><small>${NTABS.map(t=>t[1]).join("・")}</small></header>
    <div class="ntabs" role="tablist">${NTABS.map(([k,n])=>`<button type="button" role="tab" data-nt="${k}" aria-selected="${ntab===k}">${n}</button>`).join("")}</div><div>${inner}</div></section>`;
  box.querySelectorAll("[data-w]").forEach(e=>e.style.width=e.dataset.w+"%")}// CSP 不允許 style 屬性，寬度用 JS 設
$("nightBox").addEventListener("click",e=>{const t=e.target.closest("[data-sign],[data-nt]");if(!t)return;
  if(t.dataset.sign){sign=+t.dataset.sign;store.set("door-sign",sign)}else{ntab=t.dataset.nt;store.set("door-ntab",ntab)}renderNight()});

/* ---------- 開場 ---------- */
sync();
if(frame)requestAnimationFrame(frame);
if(START&&byId.has(START)){Object.assign(cam,HOME);setTimeout(()=>openDetail(START),RM?0:300)}
else setTimeout(()=>fly({...HOME},RM?1:2600),350);// 從太空降落到這個國家
setTimeout(()=>{$("hint").style.opacity=0},9000);
