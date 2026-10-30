import { useEffect, useRef } from 'react';
import { workCache } from './work-cache';
export function useWorkCacheUpdates<T>(path:string,onData:(data:T)=>void) {
  const callback=useRef(onData);callback.current=onData;
  useEffect(()=>workCache.subscribe(path,()=>{const value=workCache.peek<T>(path);if(value!==undefined)callback.current(value);}),[path]);
}
