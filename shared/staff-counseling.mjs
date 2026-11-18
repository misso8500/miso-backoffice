export const counselingServiceTypes={visitCare:'방문요양',visitBath:'방문목욕'};
export const counselingMethods={faceToFace:'대면',phone:'유선'};
export function counselingQuarter(date){return Math.ceil(Number(date.slice(5,7))/3);}
export function counselingContractForDate(worker,date){
 const contracts=[...worker.contracts].sort((a,b)=>b.contractStartDate.localeCompare(a.contractStartDate)||Number(b.enabled)-Number(a.enabled)||a.id.localeCompare(b.id));
 return contracts.find(row=>row.contractStartDate&&row.contractStartDate<=date&&(!row.contractEndDate||row.contractEndDate>=date))||contracts.find(row=>row.contractStartDate&&row.contractStartDate<=date)||contracts[0];
}
