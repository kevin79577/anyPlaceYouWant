// 首頁：房間照片裡的拱門，門洞裡是此刻真實晝夜的地球（組員前端 index.html 移植）。開門後選國家，進入 country.html。
import * as THREE from "./vendor/three.module.min.js";
import {initShell,countries} from "./shell.js";
const $=id=>document.getElementById(id);
const body=document.body,canvas=$("sky"),bg=$("bg");
initShell();
const done=()=>setTimeout(()=>$("load").classList.add("done"),600);

/* 國家：數量、代表地點都從目錄來 */
const CAT=window.SomewhereCatalog,LAYOUT={japan:{up:1},korea:{left:1},taiwan:{},thailand:{}};
const C=Object.keys(LAYOUT).map(key=>{const c=countries[key],entry=CAT.places.find(p=>p.id===key);
  return {key,n:c.name,count:CAT.counts[key].places,city:entry.region||entry.name,lat:entry.point[1],lon:entry.point[0],tz:c.zone,...LAYOUT[key]}});
const MAX=Math.max(...C.map(c=>c.count));
let cur=Math.max(0,C.findIndex(c=>c.key==="taiwan")),mode="closed",p=0,pTarget=0;
const timeIn=tz=>new Intl.DateTimeFormat("zh-TW",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
function seg(box){box.replaceChildren(...C.map((c,i)=>{const b=document.createElement("button");b.type="button";b.dataset.i=i;b.setAttribute("aria-pressed",String(i===cur));
  b.append(c.n,Object.assign(document.createElement("small"),{textContent:c.count}));return b}))}

/* 沒有 WebGL：門照樣能開，直接進國家頁 */
let renderer=null;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true})}catch(e){}
if(!renderer){const m=document.createElement("p");m.className="nogl glass";m.textContent="這個瀏覽器無法顯示 3D 地球，選好國家後按「開門」會直接帶你過去。";body.append(m);
  const info=()=>{seg($("seg"));};info();done();
  document.addEventListener("click",e=>{const b=e.target.closest("[data-i]");if(b){cur=+b.dataset.i;info()}});
  $("open").addEventListener("click",()=>{location.href="country.html#"+C[cur].key});
}else{
renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setClearColor(0x000000,0);
const IMG={w:1536,h:864,door:{x0:887,x1:1152,y0:80,y1:622}};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(30,1,.1,200),R=1,deg=Math.PI/180;
const vec=(lat,lon,r=R)=>{const a=(90-lat)*deg,t=(lon+180)*deg;return new THREE.Vector3(-r*Math.sin(a)*Math.cos(t),r*Math.cos(a),r*Math.sin(a)*Math.sin(t))};
function sunVec(){const d=new Date(),doy=(d-Date.UTC(d.getUTCFullYear(),0,0))/864e5,dec=-23.44*Math.cos(2*Math.PI*(doy+10)/365),h=d.getUTCHours()+d.getUTCMinutes()/60;return vec(dec,(12-h)*15).normalize()}
const L=new THREE.TextureLoader(),small=Math.min(innerWidth,innerHeight)<700;
const [dayT,nightT,waterT,topoT]=await Promise.all([small?"day-2k":"day","night","water","topo"].map(u=>L.loadAsync("assets/earth/"+u+".webp")));
[dayT,nightT].forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8});
const earthMat=new THREE.ShaderMaterial({uniforms:{dayT:{value:dayT},nightT:{value:nightT},waterT:{value:waterT},topoT:{value:topoT},sun:{value:sunVec()}},
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
const earth=new THREE.Mesh(new THREE.SphereGeometry(R,128,96),earthMat);scene.add(earth);
const glowMat=new THREE.ShaderMaterial({uniforms:{ld:{value:new THREE.Vector2(-1,.3)}},transparent:true,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneFactor,depthWrite:false,
vertexShader:`varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
fragmentShader:`uniform vec2 ld;varying vec2 vP;void main(){float r=length(vP);vec2 n=vP/max(r,1e-4);float side=.18+.82*smoothstep(-.5,.85,dot(n,normalize(ld)));
float g=r<1.?smoothstep(.9,1.,r)*.55:exp(-(r-1.)*14.)*.95+exp(-(r-1.)*3.2)*.42+exp(-(r-1.)*1.1)*.12;
vec3 c=mix(vec3(.55,.78,1.),vec3(.92,.97,1.),smoothstep(.8,1.05,r)*side);vec3 o=c*g*side;gl_FragColor=vec4(o,clamp(max(o.r,max(o.g,o.b)),0.,1.));}`});
const glow=new THREE.Mesh(new THREE.PlaneGeometry(R*5,R*5),glowMat);scene.add(glow);
const bordersMat=new THREE.LineBasicMaterial({color:0xd6ecff,transparent:true,opacity:0,depthWrite:false});
fetch("assets/door/borders.json").then(r=>r.json()).then(rings=>{const a=[];rings.forEach(r=>{for(let i=0;i+3<r.length;i+=2){const p1=vec(r[i+1],r[i],R*1.0015),p2=vec(r[i+3],r[i+2],R*1.0015);a.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)}});
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(a,3));earth.add(new THREE.LineSegments(g,bordersMat))}).catch(()=>{});
const cloudT=await L.loadAsync("assets/earth/clouds.webp");
const cloudMat=new THREE.ShaderMaterial({uniforms:{cT:{value:cloudT},sun:{value:sunVec()}},transparent:true,depthWrite:false,
vertexShader:`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`,
fragmentShader:`uniform sampler2D cT;uniform vec3 sun;varying vec2 vUv;varying vec3 vN;void main(){float a=texture2D(cT,vUv).r*(1.-smoothstep(.32,.44,abs(vUv.y-.5)));float l=.3+.75*smoothstep(-.2,.45,dot(normalize(vN),sun));gl_FragColor=vec4(vec3(1.,1.,1.02)*l,clamp(a*1.4,0.,1.)*.8);}`});
const clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.008,128,96),cloudMat);scene.add(clouds);
const pinMat=new THREE.MeshBasicMaterial({color:0xffa53a});
const pins=C.map(c=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.007,12,12),pinMat);m.position.copy(vec(c.lat,c.lon,R*1.002));earth.add(m);return m});
const tags=C.map(c=>{const d=document.createElement("div");d.className="tag"+(c.left?" l":"")+(c.up?" u":"");body.appendChild(d);return d});

/* 版面：照片 cover 對齊，門洞位置換算到螢幕 */
let geo={};
function measure(){
  const W=innerWidth,H=innerHeight,s=Math.max(W/IMG.w,H/IMG.h),dc=(IMG.door.x0+IMG.door.x1)/2;
  let dx=W>820?(W-IMG.w*s)/2:W/2-dc*s;dx=Math.min(0,Math.max(W-IMG.w*s,dx));const dy=(H-IMG.h*s)/2;
  const d={x0:dx+IMG.door.x0*s,x1:dx+IMG.door.x1*s,y0:dy+IMG.door.y0*s,y1:dy+IMG.door.y1*s};
  geo={W,H,s,dx,dy,d,cx:(d.x0+d.x1)/2,cy:(d.y0+d.y1)/2};
  renderer.setSize(W,H,false);camera.aspect=W/H;
  const k=Math.max(W/1536,H/864),iw=1536*k,ih=864*k,fg=$("fg");fg.style.backgroundSize=iw+"px "+(ih*.34)+"px";fg.style.backgroundPosition=((W-iw)/2)+"px "+((H+ih)/2-ih*.34)+"px";
}
// 進國家頁前先放大到這個距離；country.js 的鏡頭從同一個距離開始降落，畫面才接得起來
const ARRIVE=2.2;let zoom=0,leaveAt=0;
let litSun=sunVec();const view={lat:22,lon:118},tgt={lat:22,lon:118};let drag=null;
function apply(){
  const {W,H,s,dx,dy,d,cx,cy}=geo,e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2,k=1+e*7;
  bg.style.width=IMG.w*s+"px";bg.style.height=IMG.h*s+"px";
  bg.style.transform=`translate(${cx}px,${cy}px) scale(${k}) translate(${-cx+dx}px,${-cy+dy}px)`;
  bg.style.opacity=String(1-Math.max(0,(p-.55)/.45));
  const r={x0:cx+(d.x0-cx)*k,x1:cx+(d.x1-cx)*k,y0:cy+(d.y0-cy)*k,y1:cy+(d.y1-cy)*k};
  const rad=(r.x1-r.x0)/2,fade=Math.max(0,(p-.6)/.4);
  const top=Math.max(0,r.y0)*(1-fade),left=Math.max(0,r.x0)*(1-fade),right=Math.max(0,W-r.x1)*(1-fade),bottom=Math.max(0,H-r.y1)*(1-fade);
  canvas.style.clipPath=$("fg").style.clipPath=$("skybg").style.clipPath=`inset(${top}px ${right}px ${bottom}px ${left}px round ${rad*(1-fade)}px ${rad*(1-fade)}px 0 0)`;
  $("fg").style.opacity=1-fade*.35;bordersMat.opacity=.32*fade;clouds.rotation.y+=.00025;
  const doorW=d.x1-d.x0,pxC=doorW*.46,pxT=W>820?H*.56:Math.min(W,H)*.34,px=pxC+(pxT-pxC)*e;
  const tx=W>820?W*.19:0,ty=W>820?H*.07:-H*.01;const ox=(cx-W/2)*(1-e)+tx*e,oy=(d.y0+(d.y1-d.y0)*.5-H/2)*(1-e)+ty*e;
  const z=zoom<.5?2*zoom*zoom:1-Math.pow(-2*zoom+2,2)/2,d0=R/(Math.tan(15*deg)*px/(H/2))*1.03,dist=1+(d0-1)*Math.pow((ARRIVE-1)/(d0-1),z);
  const lk=leaveAt?.15:.06;view.lat+=(tgt.lat-view.lat)*lk;view.lon+=(tgt.lon-view.lon)*lk;
  const sunD=sunVec(),cdir=vec(view.lat,view.lon).normalize(),bias=.5*(1-e);const dir=cdir.clone().multiplyScalar(1-bias).add(sunD.clone().multiplyScalar(bias)).normalize();
  camera.position.copy(dir.multiplyScalar(dist));camera.lookAt(0,0,0);
  camera.setViewOffset(W,H,-ox*(1-z),-oy*(1-z),W,H);camera.updateProjectionMatrix();
  {const toC=camera.position.clone().normalize(),rt=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),toC).normalize(),up=new THREE.Vector3().crossVectors(toC,rt);
   const art=toC.clone().multiplyScalar(.5).addScaledVector(rt,-.82).addScaledVector(up,.3).normalize();
   litSun=sunD.clone().multiplyScalar(1-e).addScaledVector(art,e).normalize();glow.quaternion.copy(camera.quaternion);
   const lp=new THREE.Vector2(litSun.dot(rt),litSun.dot(up));glowMat.uniforms.ld.value.copy(lp.lengthSq()>1e-4?lp:new THREE.Vector2(-1,.3));}
  $("sign").style.left=cx+"px";$("sign").style.top=(d.y0+(d.x1-d.x0)*.28)+"px";
}
function info(){
  const c=C[cur],t=timeIn(c.tz),day=vec(c.lat,c.lon).normalize().dot(sunVec())>0;
  $("sign").textContent=`通往 ${c.n}・當地 ${t}`;
  $("here").textContent=`此刻・台北 ${timeIn("Asia/Taipei")}`;
  $("hudN").textContent=c.n;$("hudC").textContent=`${c.city} 一帶`;
  $("hudCount").textContent=c.count;$("hudTime").textContent=t;$("hudDay").textContent=day?"白天":"夜晚";
  $("enter").textContent=`打開${c.n}的門 →`;$("enter").href="country.html#"+c.key;
  $("rows").replaceChildren(...C.map((x,i)=>{const row=document.createElement("div");row.className="row"+(i===cur?" on":"");const bar=document.createElement("i"),em=document.createElement("em");em.style.width=(x.count/MAX*100).toFixed(1)+"%";bar.append(em);
    row.append(Object.assign(document.createElement("span"),{textContent:x.n}),bar,Object.assign(document.createElement("b"),{textContent:x.count}));return row}));
  C.forEach((x,i)=>{tags[i].replaceChildren(Object.assign(document.createElement("b"),{textContent:`${x.n}・${x.city}`}),Object.assign(document.createElement("span"),{textContent:timeIn(x.tz)}));tags[i].classList.toggle("on",i===cur)});
  seg($("seg"));seg($("seg2"));
}
function select(i){cur=i;const c=C[i];tgt.lat=mode==="through"?Math.max(-30,Math.min(45,c.lat)):22+(c.lat-22)*.4;tgt.lon=mode==="through"?c.lon:118+(c.lon-118)*.4;info()}
function loop(){
  if(leaveAt){zoom=Math.min(1,(performance.now()-leaveAt)/1300);if(zoom>=1){leaveAt=0;location.href=$("enter").href}}
  p+=(pTarget-p)*.045;if(Math.abs(pTarget-p)<.001)p=pTarget;
  if(p>.9&&mode==="opening"){mode="through";body.classList.add("through");select(cur)}
  apply();earthMat.uniforms.sun.value=litSun;cloudMat.uniforms.sun.value=litSun;renderer.render(scene,camera);
  const cd=camera.position.clone().normalize();
  pins.forEach((m,i)=>{const w=m.getWorldPosition(new THREE.Vector3()),vis=w.clone().normalize().dot(cd)>.2,q=w.project(camera);
    tags[i].style.left=(q.x+1)/2*geo.W+"px";tags[i].style.top=(1-q.y)/2*geo.H+"px";tags[i].style.opacity=vis&&mode==="through"?1:0});
  requestAnimationFrame(loop);
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-i]");if(b)select(+b.dataset.i)});
$("open").addEventListener("click",()=>{if(mode!=="closed")return;mode="opening";pTarget=1;select(cur)});
$("close").addEventListener("click",()=>{mode="closed";pTarget=0;body.classList.remove("through");select(cur)});
// 打開某國的門：先在門裡把地球放大到那個國家，再換頁（新分頁開啟、減少動態時照常直接換頁）
$("enter").addEventListener("click",e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.button||matchMedia("(prefers-reduced-motion:reduce)").matches)return;
  e.preventDefault();if(!leaveAt&&zoom===0){leaveAt=performance.now();body.classList.add("leaving")}});
addEventListener("pageshow",e=>{if(e.persisted){zoom=0;leaveAt=0;body.classList.remove("leaving")}});// 從國家頁按上一頁回來
canvas.addEventListener("pointerdown",e=>{if(mode!=="through"||leaveAt)return;drag={x:e.clientX,y:e.clientY,lat:tgt.lat,lon:tgt.lon};canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{if(!drag)return;tgt.lon=drag.lon-(e.clientX-drag.x)*.25;tgt.lat=Math.max(-70,Math.min(70,drag.lat+(e.clientY-drag.y)*.25))});
canvas.addEventListener("pointerup",()=>{drag=null});
addEventListener("resize",measure);
measure();select(cur);setInterval(info,15000);loop();
if(location.hash==="#open")setTimeout(()=>$("open").click(),300);
if(location.hash==="#through"){mode="opening";p=pTarget=1}
bg.complete?done():bg.addEventListener("load",done);
}
