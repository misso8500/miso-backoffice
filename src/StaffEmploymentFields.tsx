import type { StaffEmployment, StaffRole } from './lib/staff-records';
import { recurrenceToday } from '../shared/work-recurrence.mjs';

export default function StaffEmploymentFields({value,onChange}:{value?:StaffEmployment;onChange:(value:StaffEmployment)=>void}) {
  if (!value) return <button type="button" className="secondary-button" onClick={()=>{
    const hiredOn=recurrenceToday();
    onChange({hiredOn,payType:'salary',leaveMode:'automatic',roles:[{from:hiredOn,title:'사무원'}]});
  }}>상근 근로자 정보 추가</button>;
  return <div className="staff-card">
    <div className="staff-profile-grid">
      <label>입사일<input required type="date" value={value.hiredOn} onChange={event=>{
        const hiredOn=event.target.value;
        onChange({...value,hiredOn,roles:value.roles.map((role,index)=>index===0?{...role,from:hiredOn}:role)});
      }}/></label>
      <label>근로 구분<select value={value.payType} onChange={event=>{
        const payType=event.target.value as StaffEmployment['payType'];
        onChange({...value,payType,leaveMode:payType==='hourly'&&value.leaveMode==='automatic'?'manual':value.leaveMode});
      }}><option value="salary">월급</option><option value="hourly">시간제</option></select></label>
      <label>연차 적용<select value={value.leaveMode} onChange={event=>onChange({...value,leaveMode:event.target.value as StaffEmployment['leaveMode']})}>
        {value.payType==='salary'&&<option value="automatic">회계연도 자동 부여</option>}
        <option value="manual">직접 부여</option><option value="none">미적용</option>
      </select></label>
    </div>
    {value.payType==='hourly'&&<p className="staff-help">시간제 근로자의 연차는 소정근로시간에 따라 산정한 값을 연차대장에 등록하세요.</p>}
    <h3>직함 이력</h3>
    {value.roles.map((role,index)=><div className="staff-toolbar" key={index}>
      <label>발령일<input required type="date" disabled={index===0} value={role.from} onChange={event=>onChange({...value,roles:value.roles.map((item,i)=>i===index?{...item,from:event.target.value}:item)})}/></label>
      <label>직함<select value={role.title} onChange={event=>onChange({...value,roles:value.roles.map((item,i)=>i===index?{...item,title:event.target.value as StaffRole}:item)})}><option>사무원</option><option>사회복지사</option></select></label>
      {index>0&&<button type="button" className="secondary-button" onClick={()=>onChange({...value,roles:value.roles.filter((_,i)=>i!==index)})}>이력 삭제</button>}
    </div>)}
    <button type="button" className="secondary-button" onClick={()=>onChange({...value,roles:[...value.roles,{from:recurrenceToday(),title:'사회복지사'}]})}>직함 변경 추가</button>
  </div>;
}
