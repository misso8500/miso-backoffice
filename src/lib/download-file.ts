import {getAuthHeaders,authFailureEvent} from '../auth';
import {workOperationEvent} from '../WorkOperationStatus';
export async function downloadApiFile(path:string,name:string){
 const id=crypto.randomUUID(),notify=(phase:'start'|'success'|'error')=>window.dispatchEvent(new CustomEvent(workOperationEvent,{detail:{id,phase,read:true}}));notify('start');
 try{
  const response=await fetch(path,{headers:await getAuthHeaders(),signal:AbortSignal.timeout(60000)});
  if(response.status===401||response.status===403)window.dispatchEvent(new Event(authFailureEvent));
  if(!response.ok){const value=await response.json().catch(()=>null);throw new Error(value?.error||'서식을 다운로드하지 못했습니다.');}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);notify('success');
 }catch(cause){notify('error');throw cause;}
}
