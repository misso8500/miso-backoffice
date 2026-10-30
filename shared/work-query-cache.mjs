// Memory only. A cache instance belongs to one authenticated browser session.
export function createWorkQueryCache({ ttl = 60000, now = Date.now, limit = 160 } = {}) {
  const entries = new Map(), listeners = new Map();
  let epoch = 0;
  const emit = key => { for (const listener of listeners.get(key) ?? []) listener(); };
  function entry(key) {
    if (!entries.has(key)) entries.set(key,{ value: undefined, at: -Infinity, revision: 0 });
    const result=entries.get(key);entries.delete(key);entries.set(key,result);
    if(entries.size>limit) for(const [candidate,e] of entries) { if(candidate!==key&&!e.pending&&!listeners.get(candidate)?.size){entries.delete(candidate);break;} }
    return result;
  }
  function refresh(key,e) {
    if(e.pending) return e.pending;
    const revision=e.revision, generation=epoch;
    const pending=Promise.resolve().then(e.loader).then(value=>{
      if(epoch===generation && entries.get(key)===e && e.revision===revision) {e.value=value;e.at=now();emit(key);}
      return e.value ?? value;
    }).finally(()=>{if(e.pending===pending)e.pending=undefined;});
    e.pending=pending;return pending;
  }
  return {
    async get(key,loader,{force=false}={}) {
      const e=entry(key);e.loader=loader;
      if(force) {
        if(e.pending) {await e.pending.catch(()=>{});if(now()-e.at<ttl)return e.value;}
        e.at=-Infinity;return refresh(key,e);
      }
      if(e.value!==undefined){if(now()-e.at>=ttl)void refresh(key,e).catch(()=>{});return e.value;}
      return refresh(key,e);
    },
    peek:key=>entries.get(key)?.value,
    subscribe(key,listener){if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key).add(listener);return ()=>{listeners.get(key)?.delete(listener);if(!listeners.get(key)?.size)listeners.delete(key);};},
    update(predicate,transform){for(const [key,e] of entries)if(predicate(key)&&e.value!==undefined){e.revision++;e.value=transform(e.value,key);e.at=now();emit(key);}},
    invalidate(predicate){for(const [key,e] of entries)if(predicate(key)){e.revision++;e.at=-Infinity;emit(key);}},
    async revalidate(){await Promise.allSettled([...entries].filter(([key,e])=>listeners.get(key)?.size && e.loader && now()-e.at>=ttl).map(([key,e])=>refresh(key,e)));},
    clear(){epoch++;entries.clear();for(const key of listeners.keys())emit(key);}
  };
}
