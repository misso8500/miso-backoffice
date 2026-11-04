export function prepareRecipientCareNumber(body,existing){
 if(!existing)throw Object.assign(new Error('수급자를 찾을 수 없습니다.'),{status:404});
 if(!body||body.updatedAt!==existing.updatedAt)throw Object.assign(new Error('다른 화면에서 수급자 정보가 변경되었습니다. 최신 정보를 다시 확인해 주세요.'),{status:409});
 if(Object.keys(body).some(key=>!['updatedAt','longTermCareNumber'].includes(key)))throw Object.assign(new Error('장기요양인정번호만 수정할 수 있습니다.'),{status:400});
 const raw=typeof body.longTermCareNumber==='string'?body.longTermCareNumber.trim():'';
 if(!/^[Ll]?\d{10}$/.test(raw))throw Object.assign(new Error('장기요양인정번호는 L과 숫자 10자리로 입력해 주세요.'),{status:400});
 return {longTermCareNumber:'L'+raw.replace(/^[Ll]/,''),updatedAt:new Date(Math.max(Date.now(),Date.parse(existing.updatedAt)+1||0)).toISOString()};
}
export const duplicateCareNumberMessage='같은 장기요양인정번호가 다른 수급자에게 등록되어 있습니다.';
