import type {Recipient} from '../types';
export type RecipientSortField='name'|'careGrade'|'serviceStartDate'|'serviceEndDate';
export type RecipientSortDirection='asc'|'desc';
export type RecipientSort={field:RecipientSortField;direction:RecipientSortDirection};
export const recipientSortFields: {value:RecipientSortField;label:string}[]=[
 {value:'name',label:'이름'}, {value:'careGrade',label:'등급'},
 {value:'serviceStartDate',label:'계약 시작일'}, {value:'serviceEndDate',label:'계약 만료일'}
];
const names=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
const gradeRank=(value:string)=>value==='인지지원등급'?6:/^[1-5]등급$/.test(value)?Number(value[0]):null;
export function compareRecipients(a:Recipient,b:Recipient,sort:RecipientSort):number{
 const value=(person:Recipient)=>sort.field==='careGrade'?gradeRank(person.careGrade):person[sort.field]?.trim()||null;
 const av=value(a),bv=value(b);
 // Missing values stay last even when sorting in descending order.
 if(av===null&&bv!==null)return 1;
 if(bv===null&&av!==null)return -1;
 const primary=av===null||bv===null?0:typeof av==='number'&&typeof bv==='number'?av-bv:sort.field==='name'?names.compare(String(av),String(bv)):String(av).localeCompare(String(bv));
 if(primary)return sort.direction==='asc'?primary:-primary;
 return names.compare(a.name,b.name)||(a.birthDate||'').localeCompare(b.birthDate||'')||a.id.localeCompare(b.id);
}
const defaultSort:RecipientSort={field:'serviceEndDate',direction:'asc'};
export function loadRecipientSort():RecipientSort{
 try{const saved=JSON.parse(localStorage.getItem('miso:recipient-directory-sort:v1')||'null');if(saved&&recipientSortFields.some(option=>option.value===saved.field)&&['asc','desc'].includes(saved.direction))return {field:saved.field,direction:saved.direction};}catch{/* A blocked or invalid preference should not prevent opening the directory. */}
 return defaultSort;
}
export function saveRecipientSort(sort:RecipientSort){try{localStorage.setItem('miso:recipient-directory-sort:v1',JSON.stringify(sort));}catch{/* Sorting remains available when storage is unavailable. */}}
