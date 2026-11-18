export function formatCareNumber(value:string|undefined):string;
export function recipientServiceSignal(person:{isDraft?:boolean;enabled?:boolean;servicePaused?:boolean},status:string):{state:'black'|'red'|'yellow'|'green'|'idle';label:string};

export function recipientContractMonth(person:{serviceStartDate?:string;serviceEndDate?:string},month:string):{starts:boolean;ends:boolean;tone:'start'|'end'|null};

export function getRecipientStatus(person:{isDraft?:boolean;enabled?:boolean;serviceStartDate:string;serviceEndDate:string},now?:Date):'정보입력중'|'급여시작'|'급여제공중'|'급여갱신필요'|'계약종료예정'|'계약종료';
