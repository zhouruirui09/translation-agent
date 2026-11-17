// 长任务的内存进度表：dev 单进程足够，重启即清，只用于前端轮询展示。
// 挂在 globalThis 上避免热更新导致路由和 progress 接口读到不同的 Map。
const store = (globalThis.__agentJobs ||= new Map());
const JOB_TTL = 60 * 60 * 1000;

export function startJob(id, data) {
  gc();
  store.set(id, data);
}

export function getJob(id) {
  return store.get(id) || null;
}

function gc() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - (v.startedAt || 0) > JOB_TTL) store.delete(k);
  }
}
