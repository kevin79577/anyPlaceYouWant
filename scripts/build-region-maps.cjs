// 產生 preview/assets/region-map-data.js：台灣、日本、韓國的精細海岸線與一級行政區界線（window.SOMEWHERE_REGIONS[iso]）。
//   台灣：taiwan-atlas@2021.9.20（MIT，衍生自內政部國土測繪中心縣市界線，政府資料開放授權）
//   日本、韓國：Natural Earth 1:10m admin-1 v5.1.2（公共領域）
// Natural Earth 1:50m 的國界太粗（台灣約 70 個點、沒有離島），海邊的鏡頭會落在海上；globe.js 用這份資料取代這三國的輪廓，並在國家視角畫行政區界線。
// 每個國家輸出 nation（填色用的 MultiPolygon）、coast（海岸線）、borders（行政區之間的界線）。
// 簡化以「邊」為單位：兩個行政區共用的一段邊只簡化一次，所以填色、海岸線、界線永遠完全接合，不會有縫。
// 用法：node scripts/build-region-maps.cjs
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),OUT=path.join(ROOT,'preview/assets/region-map-data.js');
const D=require(path.join(ROOT,'preview/vendor/d3.min.js'));
const SOURCES={
  atlas:{file:'tmp/tw-county/counties-2021.9.20.json',url:'https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/counties-10t.json'},
  ne:{file:'tmp/ne10/admin1-v5.1.2.geojson',url:'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson'}};
const DIGITS=3,EPS=0.0015;// 0.001° ≈ 100 m；簡化容差 0.0015°：國家視角放大到幾十倍時不到 1 px

async function load(key){const s=SOURCES[key],file=path.join(ROOT,s.file);
  if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});const res=await fetch(s.url);if(!res.ok)throw new Error(key+' 下載失敗 '+res.status);fs.writeFileSync(file,await res.text());}
  return JSON.parse(fs.readFileSync(file,'utf8'));}

// Douglas–Peucker，端點固定
function simplify(pts){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
  while(stack.length){const [a,b]=stack.pop();const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);let far=-1,dist=0;
    for(let i=a+1;i<b;i++){const d=len>1e-12?Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/len:Math.hypot(pts[i][0]-ax,pts[i][1]-ay);if(d>dist){dist=d;far=i;}}
    if(dist>EPS){keep[far]=1;stack.push([a,far],[far,b]);}}
  return pts.filter((_,i)=>keep[i]);}
const round=v=>+v.toFixed(DIGITS),K=p=>p[0]+','+p[1];
const dedupe=pts=>pts.filter((p,i)=>i===0||p[0]!==pts[i-1][0]||p[1]!==pts[i-1][1]);

// 環 → 拓樸：在「這段邊屬於哪些區域」改變的頂點切成鏈；同一條鏈（不論方向）只簡化一次，再組回各環。
// 輸入 rings:[{owner, ring(閉合)}]；回傳 {all: 與輸入同順序的簡化後環（太小的為 null）, coast, borders}
function topology(rings){
  const ek=(a,b)=>{const s=K(a),t=K(b);return s<t?s+'|'+t:t+'|'+s;};
  const owners=new Map();
  for(const {owner,ring} of rings)for(let i=0;i+1<ring.length;i++){const k=ek(ring[i],ring[i+1]);if(!owners.has(k))owners.set(k,new Set());owners.get(k).add(owner);}
  const sig=(a,b)=>[...owners.get(ek(a,b))].sort().join('+');
  const chains=new Map();
  const chain=(p)=>{const f=p.map(K).join(';'),b=p.slice().reverse().map(K).join(';'),fwd=f<=b,key=fwd?f:b;
    if(!chains.has(key)){const base=fwd?p:p.slice().reverse();chains.set(key,{pts:simplify(base),shared:owners.get(ek(p[0],p[1])).size>1});}
    const c=chains.get(key).pts;return fwd?c:c.slice().reverse();};
  const all=rings.map(({ring})=>{
    const n=ring.length-1,at=i=>ring[((i%n)+n)%n];
    const node=i=>sig(at(i-1),at(i))!==sig(at(i),at(i+1));
    let start=-1;for(let i=0;i<n;i++)if(node(i)){start=i;break;}
    let out;
    if(start<0){// 整圈的鄰居都一樣（離島、或只和同一區相鄰）：從字典序最小的點起算，讓兩邊共用時切法一致
      let s0=0;for(let i=1;i<n;i++)if(K(ring[i])<K(ring[s0]))s0=i;
      const seq=[];for(let k=0;k<=n;k++)seq.push(at(s0+k));
      const half=Math.floor(n/2);out=[...chain(seq.slice(0,half+1)),...chain(seq.slice(half)).slice(1)];// 拆兩半，否則首尾相同的鏈簡化後只剩兩點
    }else{
      const seq=[];for(let k=0;k<=n;k++)seq.push(at(start+k));
      out=[];let cur=[seq[0]];
      for(let k=1;k<seq.length;k++){cur.push(seq[k]);if(k===seq.length-1||node(start+k)){const c=chain(cur);out.push(...(out.length?c.slice(1):c));cur=[seq[k]];}}
    }
    out=dedupe(out);return out.length>=4?out:null;
  });
  const lines=s=>[...chains.values()].filter(c=>c.shared===s&&c.pts.length>1).map(c=>c.pts);
  return {all,coast:lines(false),borders:lines(true)};
}

// d3 球面多邊形：外環面積要小於半個球面，洞相反；方向反了會被當成「整個地球減掉這塊」
const small=rg=>D.geoArea({type:'Polygon',coordinates:[rg]})<2*Math.PI;
const orient=(rg,outer)=>outer===small(rg)?rg:rg.slice().reverse();

function build(regions){// regions: [{name, polys:[[outer, hole...]...]}]
  const rings=[];
  regions.forEach((g,gi)=>g.polys.forEach((p,pi)=>p.forEach((rg,ri)=>{
    const ring=dedupe(rg.map(q=>[round(q[0]),round(q[1])]));if(K(ring[0])!==K(ring[ring.length-1]))ring.push(ring[0]);
    if(ring.length>=4)rings.push({owner:gi,poly:gi+':'+pi,outer:ri===0,ring});})));
  const t=topology(rings);
  // 填色不需要行政區之間的界線：把海岸線的鏈頭尾相接串回一圈圈的陸地外框，界線只存一份（borders）
  const ends=new Map();const add=(k,i)=>{if(!ends.has(k))ends.set(k,[]);ends.get(k).push(i);};
  t.coast.forEach((c,i)=>{add(K(c[0]),i);add(K(c[c.length-1]),i);});
  const used=new Uint8Array(t.coast.length),loops=[];
  for(let i=0;i<t.coast.length;i++){if(used[i])continue;used[i]=1;let loop=t.coast[i].slice();
    while(K(loop[0])!==K(loop[loop.length-1])){const tail=K(loop[loop.length-1]),j=(ends.get(tail)||[]).find(x=>!used[x]);if(j===undefined)break;used[j]=1;const c=t.coast[j];loop.push(...(K(c[0])===tail?c:c.slice().reverse()).slice(1));}
    if(K(loop[0])===K(loop[loop.length-1])&&loop.length>=4)loops.push(orient(loop,true));}
  const open=t.coast.length-used.reduce((a,b)=>a+b,0);if(open)console.warn('  有',open,'段海岸線沒接成一圈');
  return {nation:{type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:loops.map(l=>[l])}},borders:{type:'MultiLineString',coordinates:t.borders}};
}

(async()=>{
  const atlas=await load('atlas'),ne=await load('ne');
  const [sx,sy]=atlas.transform.scale,[tx,ty]=atlas.transform.translate;
  const arcs=atlas.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>[(x+=dx)*sx+tx,(y+=dy)*sy+ty]);});
  const arc=i=>i<0?arcs[~i].slice().reverse():arcs[i];
  const ring=ids=>ids.flatMap((i,k)=>{const a=arc(i);return k?a.slice(1):a;});
  const tw=atlas.objects.counties.geometries.map(g=>({name:g.properties.COUNTYNAME,polys:(g.type==='Polygon'?[g.arcs]:g.arcs).map(p=>p.map(ring))}));
  const neRegions=iso=>ne.features.filter(f=>f.properties.adm0_a3===iso).map(f=>({name:f.properties.name_zht||f.properties.name,polys:f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates}));

  const data={sources:{TWN:'內政部國土測繪中心縣市界線（taiwan-atlas@2021.9.20，政府資料開放授權）',JPN:'Natural Earth 1:10m admin-1 v5.1.2（公共領域）',KOR:'Natural Earth 1:10m admin-1 v5.1.2（公共領域）'}};
  const n=g=>JSON.stringify(g).split('],[').length;
  for(const [iso,regions] of [['TWN',tw],['JPN',neRegions('JPN')],['KOR',neRegions('KOR')]]){
    const m=build(regions);m.nation.properties={iso,name:iso};
    const area=D.geoArea(m.nation);if(!(area>0&&area<0.05))throw new Error(iso+' 面積異常 '+area+'，多邊形方向可能錯誤');
    data[iso]=m;
    console.log(`${iso}：${regions.length} 個行政區、${m.nation.geometry.coordinates.length} 塊陸地、面積 ${area.toExponential(2)} sr；填色 ${n(m.nation.geometry.coordinates)} 點、界線 ${m.borders.coordinates.length} 段 ${n(m.borders.coordinates)} 點`);
  }
  fs.writeFileSync(OUT,'/* 精細海岸線與一級行政區界線。台灣：'+data.sources.TWN+'；日本、韓國：'+data.sources.JPN+'。由 scripts/build-region-maps.cjs 產生。 */\nwindow.SOMEWHERE_REGIONS='+JSON.stringify(data)+';\n');
  console.log(`寫入 ${path.relative(ROOT,OUT)}：${(fs.statSync(OUT).size/1024).toFixed(0)} KB`);
})().catch(e=>{console.error(e);process.exit(1);});
