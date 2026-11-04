export const prospectDocumentKinds={application:'장기요양신청서',customerIdentity:'고객 신분증',guardianIdentity:'보호자 신분증'};
export function formatResidentNumber(value){const digits=value.replace(/\D/g,'').slice(0,13);return digits.length<=6?digits:digits.slice(0,6)+'-'+digits.slice(6);}
export function maskResidentNumber(value){return value?value.slice(0,6)+'-*******':'미등록';}
