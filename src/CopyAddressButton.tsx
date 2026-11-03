import {useEffect,useRef,useState} from 'react';
import {Check,Copy} from 'lucide-react';
export default function CopyAddressButton({address,name}:{address:string;name:string}){
 const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle'),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{setStatus('idle');return()=>clearTimeout(timer.current);},[address]);
 async function copy(){
  let copied=false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(address);copied=true;}}catch{/* The user may still permit copying through the selection fallback. */}
  if(!copied){const previous=document.activeElement as HTMLElement|null,input=document.createElement('textarea');input.value=address;input.setAttribute('readonly','');input.style.cssText='position:fixed;left:-9999px;top:0;';const host=document.querySelector('dialog[open]')||document.body;host.append(input);try{input.select();copied=document.execCommand('copy');}catch{copied=false;}finally{input.remove();previous?.focus({preventScroll:true});}}
  clearTimeout(timer.current);setStatus(copied?'copied':'error');timer.current=setTimeout(()=>setStatus('idle'),3000);
 }
 return <span className="recipient-address-copy"><button type="button" aria-label={`${name} 주소 복사`} disabled={!address.trim()} onClick={event=>{event.stopPropagation();void copy();}}>{status==='copied'?<Check size={13}/>:<Copy size={13}/>}{status==='copied'?'복사됨':'주소 복사'}</button><span role="status" aria-live="polite" className={status==='error'?'recipient-copy-error':'sr-only'}>{status==='copied'?'주소를 복사했습니다.':status==='error'?'복사하지 못했습니다. 주소를 선택해 복사해 주세요.':''}</span></span>;
}
