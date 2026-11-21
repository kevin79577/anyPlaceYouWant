// 不依賴套件的 xlsx 讀取：zip 中央目錄 → 各工作表的列（以第一列為欄名）。
const fs=require('node:fs'),zlib=require('node:zlib');
// ── xlsx：zip 中央目錄 → 檔案內容；只處理本檔用到的 stored / deflate ──
function unzip(buf){
  let eocd=buf.length-22;while(eocd>=0&&buf.readUInt32LE(eocd)!==0x06054b50)eocd--;
  const files={};let p=buf.readUInt32LE(eocd+16);
  for(let n=buf.readUInt16LE(eocd+10);n--;){
    const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
    const name=buf.toString('utf8',p+46,p+46+nameLen);
    const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
    files[name]=method===8?zlib.inflateRawSync(data):data;p+=46+nameLen+extra+comment;
  }
  return files;
}
const xmlText=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
function readSheets(file){
  const z=unzip(fs.readFileSync(file)),str=k=>z[k]&&z[k].toString('utf8');
  const shared=[...(str('xl/sharedStrings.xml')||'').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
  const rels=Object.fromEntries([...str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map(m=>[m[0].match(/Id="([^"]+)"/)[1],m[0].match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/,'xl/')]));
  const sheets={};
  for(const m of str('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)){
    const name=xmlText(m[0].match(/name="([^"]+)"/)[1]),xml=str(rels[m[0].match(/r:id="([^"]+)"/)[1]]),rows=[];
    for(const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
      const row={};
      for(const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const v=(c[3]||'').match(/<v>([\s\S]*?)<\/v>/),t=(c[2].match(/t="([^"]+)"/)||[])[1];
        row[c[1]]=t==='s'&&v?shared[+v[1]]:t==='inlineStr'?xmlText(c[3]||''):v?xmlText(v[1]):'';
      }
      rows.push(row);
    }
    const head=rows.shift()||{};
    sheets[name]=rows.map(r=>Object.fromEntries(Object.entries(head).map(([col,h])=>[h,r[col]??''])));
  }
  return sheets;
}
module.exports={readSheets};
