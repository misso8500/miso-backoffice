// Plans and executions describe the selected day; deadlines are a separate signal.
export function groupDayTasks(tasks, date, activity) {
  const scheduled = new Set([
    ...(activity?.plans ?? []).filter(row => row.status === 'planned').map(row => row.taskId),
    ...(activity?.executions ?? []).filter(row => row.status === 'recorded').map(row => row.taskId)
  ]);
  const groups = [
    { title: '기한 지남', rows: [] },
    { title: '선택일 할 일', rows: [] },
    { title: '그 외 업무', rows: [] },
    { title: '완료한 업무', rows: [] },
    { title: '취소한 업무', rows: [] }
  ];
  for (const task of tasks) {
    const index = task.status === 'cancelled' ? 4 : task.status === 'done' ? 3
      : task.dueDate && task.dueDate < date ? 0
      : task.dueDate === date || scheduled.has(task.id) ? 1 : 2;
    groups[index].rows.push(task);
  }
  return groups.filter(group => group.rows.length);
}
