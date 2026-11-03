export function formatCareNumber(value:string|undefined):string;
export function recipientServiceSignal(person:{isDraft?:boolean;enabled?:boolean;servicePaused?:boolean},status:string):{state:'black'|'red'|'yellow'|'green'|'idle';label:string};

export function recipientContractMonth(person:{serviceStartDate?:string;serviceEndDate?:string},month:string):{starts:boolean;ends:boolean;tone:'start'|'end'|null};
