export const basicInfoFields={name:100,birthDate:10,longTermCareNumber:100,careGrade:30,phone:100,address:500,representativeName:100,representativeRelation:100,representativePhone:100,operationalName:200,assignedBackofficeUserId:100,serviceStartDate:10,serviceEndDate:10,serviceType:20,reductionType:20,relatedPeople:5000};
export const registrationFields=[['name','수급자 이름'],['birthDate','생년월일'],['longTermCareNumber','장기요양인정번호'],['careGrade','장기요양등급'],['address','방문 주소'],['representativeName','대표 연락자 이름'],['representativeRelation','대표 연락자 관계'],['representativePhone','대표 연락자 연락처'],['serviceStartDate','이용계약 시작일'],['serviceEndDate','이용계약 만료일']].map(([key,label])=>({key,label}));
export function basicInfoDraft(person){return Object.fromEntries(Object.keys(basicInfoFields).map(key=>[key,person[key]||'']));}
export const validBasicDate=value=>typeof value==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function registrationIssues(value){
 return registrationFields.flatMap(({key,label})=>{
  const current=value[key]?.trim()||'';let message='';
  if(!current)message='미입력';
  else if(key==='longTermCareNumber'&&!/^[Ll]?\d{10}$/.test(current))message='L과 숫자 10자리 확인';
  else if(['birthDate','serviceStartDate','serviceEndDate'].includes(key)&&!validBasicDate(current))message='날짜 확인';
  else if(key==='careGrade'&&!['1등급','2등급','3등급','4등급','5등급','인지지원등급'].includes(current))message='등급 확인';
  else if(key==='serviceEndDate'&&value.serviceStartDate&&current<value.serviceStartDate)message='시작일 이후로 확인';
  return message?[{key,label,message}]:[];
 });
}
