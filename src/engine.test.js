import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMemory, createSimulation, forceUnsafeRequest, setScenario, simulationMetrics, stepSimulation, triggerDisaster } from './engine.js';
import { schedule } from './algorithms.js';

test('preemptive priority interrupts a running task when a higher priority task arrives', () => {
  const result = schedule([
    { id: 'A', arrival: 0, burst: 5, priority: 3 },
    { id: 'B', arrival: 2, burst: 1, priority: 1 },
  ], 'Preemptive Priority');
  assert.deepEqual(result.timeline, [
    { id: 'A', start: 0, end: 2 }, { id: 'B', start: 2, end: 3 }, { id: 'A', start: 3, end: 6 },
  ]);
  assert.deepEqual(result.rows.map(p => [p.id, p.waiting, p.response]), [['A', 1, 0], ['B', 0, 0]]);
});

test('priority aging eventually raises a long-waiting process and supports initial idle time', () => {
  const result = schedule([
    { id: 'Older', arrival: 4, burst: 1, priority: 10 },
    { id: 'Urgent', arrival: 4, burst: 55, priority: 1 },
  ], 'Preemptive Priority + Aging');
  assert.deepEqual(result.timeline.slice(0, 2), [{ id: 'IDLE', start: 0, end: 4 }, { id: 'Urgent', start: 4, end: 49 }]);
  assert.ok(result.timeline.some(s => s.id === 'Older' && s.start === 49));
  assert.ok(result.rows.every(p => p.waiting >= 0 && p.response >= 0));
});

test('seeded simulation connects alert producers, buffer, admission, CPU and releases', () => {
  let a = createSimulation(), b = createSimulation();
  for (let i = 0; i < 50; i++) { a = stepSimulation(a); b = stepSimulation(b); }
  assert.deepEqual(a.workload, b.workload);
  assert.ok(a.workload.length > 0);
  assert.ok(a.completed.length > 0);
  assert.ok(a.buffer.length <= a.capacity);
  assert.equal(a.capacity - a.buffer.length + a.buffer.length, a.capacity);
  assert.equal(a.memory.reduce((sum, block) => sum + block.size, 0), a.ram);
  assert.equal(a.available.reduce((sum, n, i) => sum + n + a.active.reduce((held, t) => held + t.allocation[i], 0), 0), a.resourceTotal.reduce((sum, n) => sum + n, 0));
  assert.ok(simulationMetrics(a).cpuUtilization > 0);
});

test('disaster surge creates a reproducible burst and presets reset all scenario state', () => {
  let state = triggerDisaster(createSimulation(), 3);
  assert.equal(state.disasterPending, 3);
  state = stepSimulation(state);
  assert.equal(state.disasterPending, 2);
  state = setScenario(state, 'Resource Crunch (deadlock-prone)');
  assert.equal(state.tick, 0);
  assert.equal(state.ram, 640);
  assert.deepEqual(state.resourceTotal, [2, 2, 2]);
});

test('peak surge fills the bounded buffer and logs blocked producers without exceeding capacity', () => {
  let state = setScenario(createSimulation(), 'Peak Demand / Disaster Surge');
  state = triggerDisaster(state, 4);
  for (let i = 0; i < 5; i++) state = stepSimulation(state);
  assert.equal(state.buffer.length, state.capacity);
  assert.ok(state.events.some(message => message.includes('Producer blocked')));
  assert.ok(state.buffer.length <= state.capacity);
});

test('resource crunch defers unsafe admissions and retries from a conserved resource ledger', () => {
  let state = triggerDisaster(setScenario(createSimulation(), 'Resource Crunch (deadlock-prone)'), 10);
  for (let i = 0; i < 80; i++) state = stepSimulation(state);
  assert.ok(state.events.some(message => message.includes('Banker safety check unsafe')));
  for (let i = 0; i < 3; i++) {
    const held = state.active.reduce((sum, task) => sum + task.allocation[i], 0);
    assert.equal(state.available[i] + held, state.resourceTotal[i]);
  }
});

test('memory pressure logs failed contiguous requests while preserving the RAM total', () => {
  let state = triggerDisaster(createSimulation(), 10);
  for (let i = 0; i < 100; i++) state = stepSimulation(state);
  assert.ok(state.events.some(message => message.includes('memory request') && message.includes('failed')));
  assert.equal(state.memory.reduce((sum, block) => sum + block.size, 0), state.ram);
});

test('memory compaction preserves total and allocations while coalescing free space', () => {
  let state = createSimulation();
  state.memory = [{ size: 100, pid: 'P1' }, { size: 200, pid: null }, { size: 150, pid: 'P2' }, { size: 574, pid: null }];
  const compacted = compactMemory(state);
  assert.deepEqual(compacted.memory, [{ size: 100, pid: 'P1' }, { size: 150, pid: 'P2' }, { size: 774, pid: null }]);
  assert.equal(compacted.memory.reduce((sum, block) => sum + block.size, 0), state.ram);
});

test('unsafe demonstration executes a real safety check and leaves live resource ledger intact', () => {
  const state = createSimulation();
  const result = forceUnsafeRequest(state);
  assert.equal(result.unsafeDemo.safe, false);
  assert.deepEqual(result.available, state.available);
  assert.deepEqual(result.resourceTotal, state.resourceTotal);
});
