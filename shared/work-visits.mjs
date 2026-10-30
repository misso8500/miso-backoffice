export const visitAssigneeIds = Object.freeze(['staff-park-jungyu','staff-hwang-youngsang']);
export function visitUrgency(month, today) {
  if(month<today.slice(0,7))return 'overdue';
  if(month>today.slice(0,7))return 'normal';
  const [year,number]=month.split('-').map(Number);
  const last=new Date(Date.UTC(year,number,0)).getUTCDate();
  return last-Number(today.slice(8))<=7?'warning':'normal';
}
