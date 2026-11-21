// 產生 preview/assets/taiwan-map-data.js：台灣（含澎湖、金門、馬祖、綠島、蘭嶼等離島）的海岸線與縣市界線。
// 來源：taiwan-atlas@2021.9.20 counties-10t.json（MIT，衍生自內政部國土測繪中心縣市界線，政府資料開放授權）。
// Natural Earth 1:50m 的台灣只有約 70 個點、沒有離島，景點會落在海上；globe.js 用這份資料取代台灣的輪廓。
// 用法：node scripts/build-taiwan-map.cjs
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const ATLAS_URL='https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/counties-10t.json',ATLAS=path.join(ROOT,'tmp/tw-county/counties-2021.9.20.json');
const OUT=path.join(ROOT,'preview/assets/taiwan-map-data.js');
const DIGITS=3,EPS=0.0015;// 0.001° ≈ 100 m；簡化容差 0.0015°：國家視角放大到約 35 倍時不到 0.5 px，看不出差別
// Douglas–Peucker：每條 arc 單獨簡化，相鄰縣市共用同一條 arc，所以界線和海岸線仍然完全接合
function simplify(pts){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
  while(stack.length){const [a,b]=stack.pop();const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-12;let far=-1,dist=0;
    for(let i=a+1;i<b;i++){const d=len>1e-12?Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/len:Math.hypot(pts[i][0]-ax,pts[i][1]-ay);if(d>dist){dist=d;far=i;}}
    if(dist>EPS){keep[far]=1;stack.push([a,far],[far,b]);}}
  return pts.filter((_,i)=>keep[i]);}

(async()=>{
  if(!fs.existsSync(ATLAS)){fs.mkdirSync(path.dirname(ATLAS),{recursive:true});const res=await fetch(ATLAS_URL);if(!res.ok)throw new Error('縣市界線下載失敗 '+res.status);fs.writeFileSync(ATLAS,await res.text());}
  const topo=JSON.parse(fs.readFileSync(ATLAS,'utf8')),[sx,sy]=topo.transform.scale,[tx,ty]=topo.transform.translate;
  const r=v=>+v.toFixed(DIGITS);
  const arcs=topo.arcs.map(a=>{let x=0,y=0;const pts=a.map(([dx,dy])=>[r((x+=dx)*sx+tx),r((y+=dy)*sy+ty)]);return simplify(pts.filter((p,i)=>i===0||i===pts.length-1||p[0]!==pts[i-1][0]||p[1]!==pts[i-1][1]));});
  const arc=i=>i<0?arcs[~i].slice().reverse():arcs[i];
  const ring=ids=>ids.flatMap((i,k)=>{const a=arc(i);return k?a.slice(1):a;});
  const polys=g=>(g.type==='Polygon'?[g.arcs]:g.arcs).map(p=>p.map(ring)).filter(p=>p[0].length>=4);

  // 每條 arc 被幾個縣市用到：2 次＝縣市之間的界線，1 次＝海岸線
  const uses=new Map();for(const g of topo.objects.counties.geometries)for(const p of (g.type==='Polygon'?[g.arcs]:g.arcs))for(const ids of p)for(const i of ids){const k=i<0?~i:i;uses.set(k,(uses.get(k)||0)+1);}
  const borders=[...uses].filter(([,n])=>n>1).map(([k])=>arcs[k]).filter(a=>a.length>1);

  // d3 的球面多邊形方向反了會被當成「整個地球減掉這塊」：外環面積應小於半個球面，洞（內環）則相反；直接用 d3 判斷
  const D=require(path.join(ROOT,'preview/vendor/d3.min.js'));
  const small=rg=>D.geoArea({type:'Polygon',coordinates:[rg]})<2*Math.PI;
  const fix=p=>p.map((rg,k)=>(k===0)===small(rg)?rg:rg.slice().reverse());
  const nation=polys(topo.objects.nation.geometries[0]).map(fix);

  const data={source:'taiwan-atlas@2021.9.20（內政部國土測繪中心縣市界線，政府資料開放授權）',
    nation:{type:'Feature',properties:{iso:'TWN',name:'Taiwan'},geometry:{type:'MultiPolygon',coordinates:nation}},
    borders:{type:'MultiLineString',coordinates:borders}};
  if(D.geoArea(data.nation)>0.01)throw new Error('台灣面積異常，多邊形方向可能錯誤');
  fs.writeFileSync(OUT,'/* 台灣海岸線與縣市界線：'+data.source+'。由 scripts/build-taiwan-map.cjs 產生。 */\nwindow.SOMEWHERE_TAIWAN='+JSON.stringify(data)+';\n');
  const n=g=>JSON.stringify(g).split('],[').length;
  console.log(`完成：海岸 ${nation.length} 塊陸地、${n(data.nation.geometry.coordinates)} 點；縣市界線 ${borders.length} 段、${n(borders)} 點；檔案 ${(fs.statSync(OUT).size/1024).toFixed(0)} KB`);
})().catch(e=>{console.error(e);process.exit(1);});
