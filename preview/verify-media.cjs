const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'media-player.js'),'utf8');
function setup(protocol='http:',ready=true){
  const nodes=new Map(),players=[],timers=new Map();let timerId=0;
  class E{constructor(){this.events={};this.children=[];this.dataset={};this.hidden=false;this.value='';}addEventListener(t,f){(this.events[t]??=[]).push(f)}fire(t){for(const f of this.events[t]||[])f({})}append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}remove(){this.removed=true}}
  const head=new E(),document={head,querySelector(key){if(!nodes.has(key))nodes.set(key,new E());return nodes.get(key)},createElement(){return new E()}};
  const YT={Player:class{constructor(host,options){this.options=options;this.destroyed=false;players.push(this)}destroy(){this.destroyed=true}mute(){}playVideo(){}}};
  const scope={document,location:{protocol,origin:'http://127.0.0.1:4173'},addEventListener(){},console,setTimeout(fn){const id=++timerId;timers.set(id,fn);return id},clearTimeout(id){timers.delete(id)}};
  if(ready)scope.YT=YT;scope.window=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'catalog.js'),'utf8'),scope);vm.runInContext(source,scope);
  return {scope,api:scope.SomewhereMedia,nodes,head,players,YT,timers};
}
(async()=>{
  const http=setup();http.api.selectDestination('japan');assert.equal(http.head.children.length,0,'no external API before explicit play');assert.equal(http.players.length,0);await http.api.play();assert.equal(http.players.length,1);const first=http.players[0];assert.equal(first.options.videoId,'J3xHBUgWRqc');assert.equal(first.options.playerVars.origin,'http://127.0.0.1:4173');assert.equal(first.options.host,'https://www.youtube-nocookie.com');first.options.events.onReady({target:first});first.options.events.onStateChange({data:1});assert.equal(http.api.getState().status,'playing');first.options.events.onError({data:101});assert(http.nodes.get('#media-status').textContent.includes('\u4e0d\u5141\u8a31'));
  http.api.selectDestination('thailand');assert(first.destroyed);assert.equal(http.api.getState().status,'idle');first.options.events.onStateChange({data:1});assert.equal(http.api.getState().status,'idle','stale callbacks cannot update a new source');
  http.nodes.get('#media-source').value='samui-yacht';http.nodes.get('#media-source').fire('change');await http.api.play();assert.equal(http.players[1].options.videoId,'3N3ZwIB_X4Y');http.nodes.get('#destination-dialog').fire('close');assert(http.players[1].destroyed);assert.equal(http.api.getState().status,'idle');
  const local=setup('file:');local.api.selectDestination('taiwan');await local.api.play();assert.equal(local.api.getState().status,'local');assert.equal(local.players.length,0);assert.equal(local.head.children.length,0);
  const delayed=setup('http:',false);delayed.api.selectDestination('korea');const loading=delayed.api.play();assert.equal(delayed.head.children.length,1);delayed.nodes.get('#destination-dialog').fire('close');delayed.scope.YT=delayed.YT;delayed.scope.onYouTubeIframeAPIReady();await loading;assert.equal(delayed.players.length,0,'closing during API loading must not create a hidden player');
  const failure=setup('http:',false);failure.api.selectDestination('taiwan');const attempt=failure.api.play();failure.head.children[0].onerror();await attempt;assert.equal(failure.api.getState().status,'error');assert.equal(failure.players.length,0);
  const external=setup();external.api.selectDestination('th-0');assert(external.nodes.get('#media-play').hidden);await external.api.play();assert.equal(external.api.getState().status,'external');assert.equal(external.players.length,0);assert.equal(external.head.children.length,0);
  console.log('PASS: lazy provider connection, player origin, state/error handling, source replacement, close cleanup, file-mode fallback, cancelled loading, API failure and external-only sources.');
})().catch(error=>{console.error(error);process.exitCode=1});
