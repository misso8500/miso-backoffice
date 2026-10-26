export function calendarDayEntries(data, tasks, day) {
  const entries = new Map(), byId = new Map(tasks.map(task => [task.id, task]));
  function add(kind, row) {
    const taskId = kind === 'deadline' ? row.id : row.taskId, task = byId.get(taskId), owner = row.assigneeId;
    const key = JSON.stringify([taskId ?? row.id, owner]);
    if (!entries.has(key)) entries.set(key, { key, taskId: taskId ?? null, owner, title: task?.title ?? (kind === 'deadline' ? row.title : kind === 'execution' ? row.content : row.snapshot.title), kinds: [], task: task ?? null });
    const entry = entries.get(key);
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
  }
  for (const row of data.plans) if (row.date === day && row.status === 'planned') add('plan', row);
  for (const row of data.executions) if (row.date === day && row.status === 'recorded') add('execution', row);
  for (const row of data.deadlines) if (row.dueDate === day) add('deadline', row);
  return [...entries.values()];
}
