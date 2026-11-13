/* Candidate-source playback. Successful playback is not proof of a live feed. */
(function(root){
  'use strict';
  const catalog=root.SomewhereCatalog ? root.SomewhereCatalog.sources : {
    japan:[{id:'kyoto-hanamikoji',title:'京都・祇園花見小路',provider:'京都市觀光協會公開頻道',videoId:'J3xHBUgWRqc',url:'https://www.youtube.com/watch?v=J3xHBUgWRqc',reference:'https://ja.kyoto.travel/comfort/',fallback:'https://www.youtube.com/@kyototouristspotlive/streams'}],
    korea:[{id:'busan-gwangalli',title:'釜山・廣安里海岸',provider:'Busan Live Cam — Gwangan Bridge（經營者待核實）',videoId:'1IJB-QjOzvM',url:'https://www.youtube.com/watch?v=1IJB-QjOzvM',reference:'https://korivu.codetfind.com/places/gwangalli/',fallback:'https://www.youtube.com/watch?v=1IJB-QjOzvM'}],
    taiwan:[{id:'taipei-xiangshan',title:'台北・象山看台北',provider:'台北市政府觀光傳播局／我的 E 政府收錄',videoId:'z_fY1pj1VBw',url:'https://www.youtube.com/watch?v=z_fY1pj1VBw',reference:'https://www.gov.tw/taiwan/',fallback:'https://www.travel.taipei/4k-livestream/'}],
    thailand:[{id:'samui-beach',title:'蘇梅島・Crystal Bay Beach Resort',provider:'The Real Samui Webcam（經營者待核實）',videoId:'Fw9hgttWzIg',url:'https://www.youtube.com/watch?v=Fw9hgttWzIg',reference:'https://phuketdreamcompany.asia/phuket-live-webcams/',fallback:'https://www.youtube.com/@TheRealSamuiWebcam/streams'},
      {id:'samui-yacht',title:'蘇梅島・Crystal Bay Yacht Club',provider:'The Real Samui Webcam（經營者待核實）',videoId:'3N3ZwIB_X4Y',url:'https://www.youtube.com/watch?v=3N3ZwIB_X4Y',reference:'https://phuketdreamcompany.asia/phuket-live-webcams/',fallback:'https://www.youtube.com/@TheRealSamuiWebcam/streams'}]
  };
  const messages={idle:'候選來源・播放與即時狀態待確認',loading:'正在連接原平台影像…',ready:'播放器已準備，請點影片內的播放鍵。',playing:'影片播放中・是否即時請以原平台標示為準',paused:'影片已暫停',ended:'影像已結束，請至原平台確認最新直播。',delayed:'載入較久，仍在等待原平台；也可以改到原站觀看。',error:'目前無法在此播放，可重新嘗試或前往原站。',local:'請透過本機預覽網址開啟播放，或直接前往原站觀看。'};
  function describeError(code){return ({2:'影像識別資料無效，請改用原站觀看。',5:'此瀏覽器目前無法播放這段影像，請改用原站觀看。',100:'這段影像可能已移除、轉為私人或無法取得，請確認原站。',101:'來源不允許在其他網站播放，請至原站觀看。',150:'來源不允許在其他網站播放，請至原站觀看。',153:'原平台無法辨識播放來源，請透過預覽網址開啟或到原站觀看。'})[code]||messages.error;}
  const doc=root.document;
  if(!doc){if(typeof module!=='undefined'&&module.exports)module.exports={catalog,messages,describeError};return;}
  const $=s=>doc.querySelector(s);
  let apiPromise=null,player=null,generation=0,timeout=0,currentDestination=null,currentSource=null,currentStatus='idle';
  function setStatus(status,message){currentStatus=status;$('#media-status').textContent=message||messages[status];$('#media-status').dataset.state=status;$('#media-play').disabled=status==='loading';$('#media-play').textContent=['error','ended','delayed'].includes(status)?'重新嘗試播放 ↗':'播放原平台影像 ▶';}
  function clearPlayer(){generation++;clearTimeout(timeout);timeout=0;if(player){try{player.destroy();}catch{}player=null;}$('#media-viewer').replaceChildren();$('#media-viewer').hidden=true;$('#detail-photo').hidden=false;$('#detail-image-label').hidden=false;}
  function showSource(){clearPlayer();setStatus(currentSource.videoId?'idle':'external',currentSource.videoId?null:'此來源目前提供原站觀看，尚未確認可嵌入本站。');$('#media-play').hidden=!currentSource.videoId;$('#media-provider').textContent=currentSource.provider;$('#media-original').href=currentSource.url;$('#media-fallback').href=currentSource.fallback;$('#media-reference').href=currentSource.reference;$('#media-location-note').textContent=currentSource.title+'；地圖為參考定位，非已核實的攝影機座標。';}
  function selectDestination(id){if(currentDestination===id)return;currentDestination=id;const sources=catalog[id]||[];$('#media-source').replaceChildren();for(const source of sources){const option=doc.createElement('option');option.value=source.id;option.textContent=source.title;$('#media-source').append(option);}currentSource=sources[0]||null;$('#media-controls').hidden=!currentSource;if(currentSource){$('#media-source').value=currentSource.id;showSource();}else clearPlayer();}
  function loadApi(){
    if(root.YT&&root.YT.Player)return Promise.resolve(root.YT);
    if(apiPromise)return apiPromise;
    apiPromise=new Promise((resolve,reject)=>{
      const script=doc.createElement('script');script.src='https://www.youtube.com/iframe_api';script.referrerPolicy='strict-origin-when-cross-origin';
      const previous=root.onYouTubeIframeAPIReady;
      let settled=false;
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);script.onerror=null;if(root.onYouTubeIframeAPIReady===ready)root.onYouTubeIframeAPIReady=previous;if(error){script.remove();reject(error);}else resolve(root.YT);};
      const ready=()=>{try{if(typeof previous==='function')previous();}finally{finish(root.YT&&root.YT.Player?null:new Error('api-unavailable'));}};
      root.onYouTubeIframeAPIReady=ready;
      script.onerror=()=>finish(new Error('api-load-failed'));
      const timer=setTimeout(()=>finish(new Error('api-timeout')),15000);
      doc.head.append(script);
    }).catch(error=>{apiPromise=null;throw error;});
    return apiPromise;
  }
  async function play(){
    if(!currentSource)return;
    if(!currentSource.videoId){setStatus('external','此來源目前提供原站觀看，請點「前往原站」。');return;}
    if(root.location.protocol==='file:'){setStatus('local');$('#media-preview-link').hidden=false;return;}
    clearPlayer();const token=generation,source=currentSource;setStatus('loading');
    try{
      const YT=await loadApi();if(token!==generation)return;
      const host=doc.createElement('div');$('#media-viewer').append(host);$('#media-viewer').hidden=false;$('#detail-photo').hidden=true;$('#detail-image-label').hidden=true;
      timeout=setTimeout(()=>{if(token===generation&&currentStatus!=='playing')setStatus('delayed');},18000);
      player=new YT.Player(host,{width:'100%',height:'100%',host:'https://www.youtube-nocookie.com',videoId:source.videoId,playerVars:{autoplay:1,playsinline:1,rel:0,origin:root.location.origin},events:{
        onReady(event){if(token!==generation)return;setStatus('ready');event.target.mute();event.target.playVideo();},
        onAutoplayBlocked(){if(token===generation)setStatus('ready');},
        onStateChange(event){if(token!==generation)return;const status=({0:'ended',1:'playing',2:'paused',3:'loading',5:'ready'})[event.data];if(status){if([0,1,2].includes(event.data))clearTimeout(timeout);setStatus(status);}},
        onError(event){if(token!==generation)return;clearTimeout(timeout);setStatus('error',describeError(event.data));}
      }});
    }catch(error){if(token===generation)setStatus('error','影像服務未能載入，可能是連線或瀏覽器限制；請重新嘗試或到原站觀看。');}
  }
  $('#media-source').addEventListener('change',()=>{const source=(catalog[currentDestination]||[]).find(s=>s.id===$('#media-source').value);if(!source)return;currentSource=source;showSource();});
  $('#media-play').addEventListener('click',play);
  $('#media-preview').addEventListener('click',()=>{clearPlayer();setStatus('idle');});
  $('#destination-dialog').addEventListener('close',()=>{clearPlayer();setStatus('idle');});
  root.addEventListener('pagehide',clearPlayer);
  root.SomewhereMedia={selectDestination,play,close:()=>{clearPlayer();setStatus('idle');},getState:()=>({destination:currentDestination,source:currentSource&&currentSource.id,status:currentStatus})};
})(typeof window!=='undefined'?window:globalThis);
