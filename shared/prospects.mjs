export const prospectStages={intake:'연락처 접수',consulting:'상담 중',visit_planned:'실사 방문 예정',waiting:'점검 완료·대기',deferred:'서비스 수급 유보',lost:'타 센터 선택·거절',contracted:'계약 연결'};
export const prospectActivityKinds={contact:'연락',consultation:'상담',visit:'실사 방문',note:'메모'};
export const prospectClosed=stage=>stage==='lost'||stage==='contracted';
export function prospectAttention(prospect,today){return !prospect.archived&&!prospectClosed(prospect.stage)&&Boolean(prospect.nextDate)&&(prospect.nextDate<today?'overdue':prospect.nextDate===today?'today':'scheduled');}
