const dayMs = 86400000;
const iso = time => time.toISOString().slice(0,10);
function addMonths(date, count) {
  const [year, month, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year,month+count,0)).getUTCDate();
  return iso(new Date(Date.UTC(year,month-1+count,Math.min(day,last))));
}

export function fiscalLeaveGrant(hiredOn, year, today, rows) {
  const start = year+'-01-01';
  if (start > today || hiredOn > today) return {granted:0,incomplete:false};
  const previous = String(Number(year)-1)+'-01-01';
  const byDate = new Map(rows.map(row=>[row.date,row.kind]));
  let incomplete = false;
  function attendance(from, until) {
    let days = 0, attended = 0;
    for (let time=Date.parse(from);time<Date.parse(until);time+=dayMs) {
      const kind = byDate.get(iso(new Date(time)));
      if (!kind || !['work','off','leave','absent'].includes(kind)) {
        incomplete = true;
        return null;
      }
      if (kind==='off') continue;
      days++;
      if (kind!=='absent') attended++;
    }
    return {days,attended};
  }
  let granted = 0;
  if (hiredOn < start) {
    const from = hiredOn > previous ? hiredOn : previous;
    const period = attendance(from,start);
    if (period?.days && period.attended/period.days>=0.8) {
      let years = Number(year)-Number(hiredOn.slice(0,4));
      if (addMonths(hiredOn,years*12)>start) years--;
      const days = Math.min(25,15+Math.max(0,Math.floor((years-1)/2)));
      granted += from===previous ? days : Math.ceil(days*(Date.parse(start)-Date.parse(from))/(Date.parse(start)-Date.parse(previous))*2)/2;
    } else if (period?.days && from===previous) {
      for (let month=0;month<12;month++) {
        const part = attendance(addMonths(previous,month),addMonths(previous,month+1));
        if (part?.days && part.days===part.attended) granted++;
      }
    }
  }
  for (let month=1;month<=11;month++) {
    const due = addMonths(hiredOn,month);
    if (due>today || due.slice(0,4)>year) break;
    if (!due.startsWith(year)) continue;
    const part = attendance(addMonths(hiredOn,month-1),due);
    if (part?.days && part.days===part.attended) granted++;
  }
  return {granted,incomplete};
}
