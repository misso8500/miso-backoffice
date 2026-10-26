import type {RecipientPlanState,RecipientPlanVersion,RecipientPlanSummary,PlanExecution} from '../types';
export function summarizePlan(state:RecipientPlanState):RecipientPlanSummary {
  const meta=(p:RecipientPlanVersion|PlanExecution|null)=>p?{id:p.id,planId:p.planId,version:p.version,effectiveDate:p.effectiveDate,authorName:p.authorName,schedule:p.schedule,
    executionEndDate:'executionEndDate' in p?p.executionEndDate:null,executionStatus:'executionStatus' in p?p.executionStatus:'기간 확인 필요',...('deadlineStatus' in p?{deadlineStatus:p.deadlineStatus}:{})}:null;
  return {version:state.version,current:meta(state.current),nextEffectiveDate:state.nextEffectiveDate,executionCurrent:meta(state.executionCurrent),regularRequirement:state.regularRequirement,plans:state.plans.map(p=>meta(p)!)};
}
