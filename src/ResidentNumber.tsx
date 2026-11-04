import {useState} from 'react';
import {formatResidentNumber,maskResidentNumber} from '../shared/prospect-details.mjs';
export function ResidentNumberInput({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){
 const [visible,setVisible]=useState(false);
 return <div className="prospect-resident-number"><label>{label}<input type={visible?'text':'password'} inputMode="numeric" autoComplete="off" placeholder="000000-0000000" maxLength={14} pattern="[0-9]{6}-[0-9]{7}" value={value} onChange={event=>onChange(formatResidentNumber(event.target.value))}/></label><button type="button" className="secondary-button" aria-label={`${label} ${visible?'숨기기':'보기'}`} onClick={()=>setVisible(!visible)}>{visible?'숨기기':'보기'}</button></div>;
}
export function ResidentNumberDisplay({label,value}:{label:string;value:string}){
 const [visible,setVisible]=useState(false);
 return <span className="prospect-resident-display"><span>{visible?value||'미등록':maskResidentNumber(value)}</span>{value&&<button type="button" aria-label={`${label} ${visible?'숨기기':'보기'}`} onClick={()=>setVisible(!visible)}>{visible?'숨기기':'보기'}</button>}</span>;
}
