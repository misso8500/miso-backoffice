const fields={phone:100,address:500,representativeName:100,representativeRelation:100,representativePhone:100};
export function prepareRecipientContact(body,existing){
 if(!existing)throw Object.assign(new Error('수급자를 찾을 수 없습니다.'),{status:404});
 if(!body||typeof body.updatedAt!=='string'||body.updatedAt!==existing.updatedAt)throw Object.assign(new Error('다른 화면에서 수급자 정보가 변경되었습니다. 입력 내용은 유지됩니다. 최신 정보를 다시 열어 확인해 주세요.'),{status:409});
 if(Object.keys(body).some(key=>key!=='updatedAt'&&!Object.hasOwn(fields,key)))throw Object.assign(new Error('연락처·주소 정보만 수정할 수 있습니다.'),{status:400});
 const result={};
 for(const [key,max]of Object.entries(fields)){if(typeof body[key]!=='string'||body[key].length>max)throw Object.assign(new Error('연락처와 주소의 입력 내용을 확인해 주세요.'),{status:400});result[key]=body[key].trim();}
 return {...result,updatedAt:new Date(Math.max(Date.now(),Date.parse(existing.updatedAt)+1||0)).toISOString()};
}
