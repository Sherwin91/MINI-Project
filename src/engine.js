import { allocateMemory, banker, memoryStats, releaseMemory } from './algorithms.js';

export const PRESETS = {
  'Normal Day': { capacity: 5, ram: 1024, resources: [5, 4, 4], arrivalEvery: 4, seed: 17 },
  'Peak Demand / Disaster Surge': { capacity: 3, ram: 768, resources: [4, 3, 3], arrivalEvery: 1, seed: 83 },
  'Resource Crunch (deadlock-prone)': { capacity: 4, ram: 640, resources: [2, 2, 2], arrivalEvery: 2, seed: 211 },
};
const SOURCES = ['Ambulance', 'Fire', 'Police', 'Call Centre', 'Sensor'];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const initialRandom = seed => seed >>> 0;
const random = state => { const next = (Math.imul(state, 1664525) + 1013904223) >>> 0; return [next, next / 4294967296]; };

export function createSimulation(preset = 'Normal Day') {
  if (!PRESETS[preset]) throw new Error(`Unknown scenario: ${preset}`);
  const config = PRESETS[preset];
  return {
    tick: 0, preset, running: false, speed: 1, policy: 'Priority', quantum: 2, aging: true,
    randomState: initialRandom(config.seed), nextId: 1, buffer: [], capacity: config.capacity,
    memory: [{ size: config.ram, pid: null }], ram: config.ram, fit: 'Best Fit',
    resourceTotal: [...config.resources], available: [...config.resources], active: [], ready: [],
    runningId: null, rrLastId: null, quantumUsed: 0, completed: [], deferred: [], gantt: [], events: ['Command centre initialized. Step the clock to begin.'],
    history: [{ tick: 0, buffer: 0, memory: 0, cpu: 0 }], workload: [], disasterPending: 0,
  };
}

function event(state, message) { state.events = [`T+${state.tick} · ${message}`, ...state.events].slice(0, 60); }
function generateAlert(state) {
  let rng = state.randomState; let value; [rng, value] = random(rng); const sourceN = value; [rng, value] = random(rng); const severityN = value;
  [rng, value] = random(rng); const burstN = value; [rng, value] = random(rng); const memN = value; [rng, value] = random(rng); const resourceN = value;
  const id = `A${state.nextId++}`, severity = SEVERITIES[Math.floor(severityN * (state.preset.includes('Peak') ? 2 : 4))];
  const source = SOURCES[Math.floor(sourceN * SOURCES.length)];
  const alert = { id, name: `${source} ${severity.toLowerCase()} response`, source, severity, priority: SEVERITIES.indexOf(severity) + 1,
    arrival: state.tick, burst: 2 + Math.floor(burstN * 5), remaining: 2 + Math.floor(burstN * 5), memory: 96 + Math.floor(memN * 5) * 32,
    resources: [Math.min(state.resourceTotal[0], 1 + Math.floor(resourceN * 2)),
      Math.min(state.resourceTotal[1], 1 + Math.floor(resourceN * 2)),
      Math.min(state.resourceTotal[2], severity === 'Critical' ? 2 : 1)],
    request: [1, Math.min(1, Math.min(state.resourceTotal[1], 1 + Math.floor(resourceN * 2))), Math.min(1, Math.min(state.resourceTotal[2], severity === 'Critical' ? 2 : 1))],
    wait: 0, firstStart: null, allocation: null };
  state.randomState = rng; state.workload.push({ ...alert });
  if (state.buffer.length >= state.capacity) { event(state, `Producer blocked: ${id} waits (full=${state.capacity}, empty=0).`); state.deferred.push({ ...alert, stage: 'buffer' }); }
  else { state.buffer.push(alert); event(state, `${source} produced ${id} (${severity}); mutex lock → signal(empty) → signal(full) → unlock.`); }
}

function safeToGrant(state, task) {
  const processes = [...state.active.map(t => ({ id: t.id, allocation: [...t.allocation], max: [...t.resources] })), { id: task.id, allocation: [...task.request], max: [...task.resources] }];
  const allocated = [0, 1, 2].map(j => processes.reduce((sum, p) => sum + p.allocation[j], 0));
  const available = state.available.map((v, j) => v - task.request[j]);
  if (available.some(x => x < 0)) return { safe: false, sequence: [], steps: [] };
  return banker({ resources: [...state.resourceTotal], available, processes });
}

export function stepSimulation(current) {
  const state = structuredClone(current); state.tick++;
  const config = PRESETS[state.preset];
  if (state.disasterPending > 0) { generateAlert(state); generateAlert(state); generateAlert(state); state.disasterPending--; }
  else if (state.tick % config.arrivalEvery === 0) generateAlert(state);
  // A producer waiting for a slot is retried after the consumer frees space.
  if (state.buffer.length && state.active.length + state.ready.length < 10) {
    const task = state.buffer.shift();
    event(state, `Dispatcher consumed ${task.id} (FIFO); mutex released, empty=${state.capacity - state.buffer.length}, full=${state.buffer.length}.`);
    const blockedProducer = state.deferred.findIndex(t => t.stage === 'buffer');
    if (blockedProducer >= 0 && state.buffer.length < state.capacity) {
      const [waiting] = state.deferred.splice(blockedProducer, 1); delete waiting.stage; state.buffer.push(waiting);
      event(state, `Waiting producer ${waiting.id} resumed after signal(empty).`);
    }
    const memory = allocateMemory(state.memory, task.id, task.memory, state.fit);
    if (!memory) { task.stage = 'memory'; state.deferred.push(task); event(state, `${task.id} waits: memory request ${task.memory} MB failed (fragmentation or insufficient space).`); }
    else {
      const safety = safeToGrant(state, task);
      if (!safety.safe) { state.memory = releaseMemory(memory, task.id); task.stage = 'unsafe'; state.deferred.push(task); event(state, `${task.id} deferred: Banker safety check unsafe; tentative memory grant rolled back.`); }
      else {
        state.memory = memory; task.allocation = [...task.request]; state.available = state.available.map((v, j) => v - task.request[j]);
        task.readyAt = state.tick - 1;
        state.active.push(task); state.ready.push(task.id); event(state, `${task.id}: memory allocated (${state.fit}); Banker SAFE (${safety.sequence.join(' → ')}); queued for ${state.policy}.`);
      }
    }
  }
  // Retry one held alert each tick after resources have been returned.
  if (state.deferred.length && state.available.some(v => v > 0)) {
    const item = state.deferred[0];
    if (item.stage === 'unsafe' || item.stage === 'memory') { state.deferred.shift(); state.buffer.unshift(item); }
  }
  const ready = state.active.filter(t => t.remaining > 0);
  const score = t => state.policy === 'FCFS' ? t.arrival : state.policy === 'SJF' ? t.burst : state.policy === 'Round Robin' ? 0 : Math.max(1, t.priority - (state.aging ? Math.floor(t.wait / 5) : 0));
  ready.sort((a, b) => score(a) - score(b) || a.arrival - b.arrival || a.id.localeCompare(b.id));
  let task = ready[0];
  if (['FCFS', 'SJF', 'Priority'].includes(state.policy) && state.runningId) task = ready.find(t => t.id === state.runningId) || task;
  if (state.policy === 'Round Robin') {
    if (state.runningId && state.quantumUsed < state.quantum) task = ready.find(t => t.id === state.runningId) || task;
    else if (state.rrLastId) { const lastIndex = ready.findIndex(t => t.id === state.rrLastId); task = ready[(lastIndex + 1) % ready.length] || task; }
  }
  for (const waiting of ready) if (waiting !== task) waiting.wait++;
  if (!task) { state.runningId = null; state.quantumUsed = 0; if (state.tick > 0) { const last = state.gantt.at(-1); if (last?.id === 'IDLE' && last.end === state.tick - 1) last.end = state.tick; else state.gantt.push({ id: 'IDLE', start: state.tick - 1, end: state.tick }); } }
  else {
    if (task.firstStart === null) task.firstStart = state.tick - 1;
    if (state.runningId !== task.id) { state.quantumUsed = 0; event(state, `CPU dispatched ${task.id} (${state.policy}).`); }
    state.runningId = task.id; task.remaining--; state.quantumUsed++;
    const last = state.gantt.at(-1);
    if (last?.id === task.id && last.end === state.tick - 1) last.end = state.tick;
    else state.gantt.push({ id: task.id, start: state.tick - 1, end: state.tick });
    if (task.remaining === 0) {
      const turnaround = state.tick - task.readyAt;
      const completed = { ...task, completion: state.tick, turnaround, waiting: turnaround - task.burst, response: task.firstStart - task.readyAt };
      state.completed.push(completed); state.active = state.active.filter(t => t.id !== task.id); state.ready = state.ready.filter(id => id !== task.id);
      state.memory = releaseMemory(state.memory, task.id); state.available = state.available.map((v, j) => v + task.allocation[j]);
      event(state, `${task.id} completed; memory reclaimed and resources returned (deadlock averted).`); state.rrLastId = task.id; state.runningId = null; state.quantumUsed = 0;
    } else if (state.policy === 'Round Robin' && state.quantumUsed >= state.quantum) { state.rrLastId = task.id; state.runningId = null; state.quantumUsed = 0; }
  }
  state.ready = ready.filter(t => t.id !== state.runningId).map(t => t.id);
  const stats = memoryStats(state.memory);
  state.history.push({ tick: state.tick, buffer: state.buffer.length, queue: state.ready.length, memory: stats.used / stats.total * 100,
    wait: state.active.length ? state.active.reduce((sum, p) => sum + p.wait, 0) / state.active.length : 0, cpu: task ? 100 : 0 });
  if (state.history.length > 80) state.history.shift();
  return state;
}

export function triggerDisaster(current, count = 4) {
  const state = structuredClone(current); state.disasterPending += Math.max(1, Math.floor(count));
  event(state, `Disaster surge triggered: ${state.disasterPending} alerts queued for generation.`); return state;
}
export function setScenario(current, preset) { const fresh = createSimulation(preset); fresh.policy = current.policy; fresh.quantum = current.quantum; fresh.speed = current.speed; return fresh; }
export function compactMemory(current) {
  const state = structuredClone(current), allocated = state.memory.filter(b => b.pid), used = allocated.reduce((n, b) => n + b.size, 0), total = state.ram;
  state.memory = [...allocated, ...(total > used ? [{ size: total - used, pid: null }] : [])]; event(state, 'Memory compacted: free space coalesced into one contiguous block.'); return state;
}
export function forceUnsafeRequest(current) {
  const state = structuredClone(current);
  state.unsafeDemo = banker({ resources: [3, 3], available: [1, 1], processes: [
    { id: 'Demo A', allocation: [1, 0], max: [2, 2] }, { id: 'Demo B', allocation: [0, 1], max: [2, 2] },
  ] });
  event(state, `Force unsafe demo: Banker found no safe sequence; request rejected and live resource ledger unchanged.`); return state;
}
export function simulationMetrics(state) {
  const done = state.completed, avg = key => done.length ? done.reduce((n, p) => n + p[key], 0) / done.length : 0;
  const totalCpu = state.gantt.reduce((n, s) => n + s.end - s.start, 0);
  return { completed: done.length, averageWaiting: avg('waiting'), averageTurnaround: avg('turnaround'), averageResponse: avg('response'), cpuUtilization: state.tick ? totalCpu / state.tick * 100 : 0, memory: memoryStats(state.memory) };
}
