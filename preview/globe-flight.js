/* Homepage: two turns and alignment. Country switches: direct shortest arc. */
(function (root) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { const t = clamp(x); return t * t * t * (t * (t * 6 - 15) + 10); };
  const wrap = lon => ((lon + 180) % 360 + 360) % 360 - 180;
  const radians = Math.PI / 180;
  const vector = ([lon,lat]) => [Math.cos(lat*radians)*Math.cos(lon*radians),Math.cos(lat*radians)*Math.sin(lon*radians),Math.sin(lat*radians)];
  function shortestArc(start,end){
    const a=vector(start),b=vector(end);
    const dot=Math.max(-1,Math.min(1,a.reduce((sum,n,i)=>sum+n*b[i],0)));
    const angle=Math.acos(dot);
    let tangent=b.map((n,i)=>n-dot*a[i]);
    let length=Math.hypot(...tangent);
    if(length<1e-10){
      const axis=Math.abs(a[2])<.8?[0,0,1]:[1,0,0];
      const projection=a.reduce((sum,n,i)=>sum+n*axis[i],0);
      tangent=axis.map((n,i)=>n-projection*a[i]);length=Math.hypot(...tangent);
    }
    tangent=tangent.map(n=>n/length);
    return t=>{
      if(t<=0)return start.slice();if(t>=1)return end.slice();
      if(angle<1e-10)return start.slice();
      const v=a.map((n,i)=>n*Math.cos(angle*t)+tangent[i]*Math.sin(angle*t));
      const lon=Math.atan2(v[1],v[0])/radians;
      return [start[0]+wrap(lon-start[0]),Math.atan2(v[2],Math.hypot(v[0],v[1]))/radians];
    };
  }

  function create(from, destination, options = {}) {
    const mode = options.mode || (from.focused ? 'direct' : 'intro');
    const duration = options.reducedMotion ? 0 : options.duration ?? (mode === 'intro' ? 5000 : 1100);
    const toZoom = options.zoom ?? (options.mobile ? 2.3 : 2.6);// options.zoom: cluster zoom-in keeps its own target scale
    // Unwrapped camera angles keep both modes continuous at the date line.
    // Intro has two presentation turns plus the final small alignment;
    // direct mode adds no extra turn and preserves the close-up scale.
    const alignment = wrap(destination[0] - from.lon);
    const turn = mode === 'intro' ? 720 + alignment : alignment;
    const directPath = mode === 'direct' ? shortestArc([from.lon,from.lat],destination) : null;
    const needsPullback = mode === 'intro' && from.zoom > 1.15;
    const overviewZoom = Math.min(from.zoom, 1);
    return {
      duration,
      sample(elapsed) {
        const t = duration ? clamp(elapsed / duration) : 1;
        const rotation = smooth(t);
        let zoom;
        if (needsPullback && t < 0.16) {
          zoom = from.zoom + (overviewZoom - from.zoom) * smooth(t / 0.16);
        } else {
          const progress = needsPullback ? clamp((t - 0.16) / 0.84) : t;
          const growth = smooth(Math.pow(progress, 1.35));
          const initialZoom = needsPullback ? overviewZoom : from.zoom;
          zoom = initialZoom + (toZoom - initialZoom) * growth;
        }
        const point=directPath?directPath(rotation):[from.lon+turn*rotation,from.lat+(destination[1]-from.lat)*rotation];
        return {
          lon: t === 1 ? wrap(destination[0]) : point[0],
          lat: point[1],
          zoom,
          focusMix: from.focusMix + (1 - from.focusMix) * smooth(t),
          done: t === 1
        };
      }
    };
  }
  root.SomewhereFlight = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
})(globalThis);
