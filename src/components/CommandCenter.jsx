import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Download, HardDrive, LockKeyhole, Pause, Play, Radio, RotateCcw, StepForward, Zap } from 'lucide-react';
import { banker } from '../algorithms.js';
import { forceUnsafeRequest, PRESETS, setScenario, simulationMetrics, stepSimulation } from '../engine.js';
import { useSimulation } from '../hooks/useSimulation.js';

const fmt = n => Number(n).toFixed(1);
function Sparkline({ title, values, color }) {
  const max = Math.max(1, ...values), points = values.map((value, i) => `${values.length < 2 ? 0 : i / (values.length - 1) * 180},${38 - value / max * 34}`).join(' ');
  return <div className="spark"><span>{title}</span><svg viewBox="0 0 180 42" role="img" aria-label={`${title} trend`}><polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg></div>;
}
export default function CommandCenter() {
  const sim = useSimulation(), { state } = sim, metrics = simulationMetrics(state), freeBlocks = state.memory.filter(b => !b.pid);
  const activeSafety = state.active.length ? banker({ resources: state.resourceTotal, available: state.available, processes: state.active.map(t => ({ id: t.id, allocation: t.allocation, max: t.resources })) }) : null;
  const download = () => {
    const csv = ['id,source,severity,arrival,burst,completion,waiting,turnaround,response', ...state.completed.map(p => [p.id,p.source,p.severity,p.arrival,p.burst,p.completion,p.waiting,p.turnaround,p.response].join(','))].join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'resqos-simulation-report.csv'; link.click(); URL.revokeObjectURL(link.href);
  };
  const compare = React.useMemo(() => ['FCFS', 'SJF', 'Priority', 'Round Robin'].map(policy => {
    let s = { ...state, running: false, policy, tick: 0, buffer: [], active: [], ready: [], completed: [], deferred: [], memory: [{ size: state.ram, pid: null }], available: [...state.resourceTotal], gantt: [], events: [], workload: [], nextId: 1, randomState: state.preset.includes('Normal') ? 17 : state.preset.includes('Peak') ? 83 : 211, disasterPending: 5 };
    for (let i = 0; i < 180 && s.completed.length < 5; i++) s = stepSimulation(s);
    const done = s.completed; return { policy, waiting: done.length ? done.reduce((n,p)=>n+p.waiting,0)/done.length : 0, turnaround: done.length ? done.reduce((n,p)=>n+p.turnaround,0)/done.length : 0 };
  }), [state.preset]);
  const update = fn => sim.update(s => fn(s));
  const percent = n => `${Math.max(0, Math.min(100, n))}%`;
  const status = state.buffer.length === state.capacity ? 'OVERLOAD' : state.preset.includes('Peak') ? 'PEAK DEMAND' : 'NORMAL';
  return <div className="command-center">
    <div className="sim-toolbar"><div className="sim-controls">
      <button className="primary small" onClick={sim.toggle}>{state.running ? <Pause size={14}/> : <Play size={14}/>} {state.running ? 'Pause' : 'Play'}</button>
      <button className="outline small" onClick={sim.step}><StepForward size={14}/> Step</button>
      <button className="outline small" onClick={() => sim.reset()}><RotateCcw size={14}/> Reset</button>
      <span className="sim-clock">T+{state.tick}</span><span className={`sim-status ${status==='OVERLOAD'?'overload':status==='PEAK DEMAND'?'peak':''}`}>{status}</span>
    </div><label>SCENARIO<select aria-label="Scenario preset" value={state.preset} onChange={e => update(s => setScenario(s,e.target.value))}>{Object.keys(PRESETS).map(p=><option key={p}>{p}</option>)}</select></label>
      <label>SPEED<select aria-label="Simulation speed" value={state.speed} onChange={e=>update(s=>({...s,speed:Number(e.target.value)}))}>{[0.5,1,2,5].map(v=><option key={v} value={v}>{v}x</option>)}</select></label>
      <label>CPU POLICY<select aria-label="CPU policy" value={state.policy} onChange={e=>update(s=>({...s,policy:e.target.value}))}>{['FCFS','SJF','Priority','Preemptive Priority','Round Robin'].map(p=><option key={p}>{p}</option>)}</select></label>
    </div>
      <div className="sim-actions"><label className="check-label"><input type="checkbox" checked={state.aging} onChange={e=>update(s=>({...s,aging:e.target.checked}))}/> Priority aging</label><button className="outline small" onClick={sim.disaster}><Zap size={14}/> Trigger disaster</button><button className="outline small" onClick={()=>update(forceUnsafeRequest)}><AlertTriangle size={14}/> Unsafe request demo</button></div>
    <div className="sim-kpis"><div><span>COMPLETED</span><b>{metrics.completed}</b></div><div><span>CPU UTILIZATION</span><b>{fmt(metrics.cpuUtilization)}%</b></div><div><span>AVG WAIT</span><b>{fmt(metrics.averageWaiting)}</b></div><div><span>AVG TURNAROUND</span><b>{fmt(metrics.averageTurnaround)}</b></div><div><span>MEMORY</span><b>{metrics.memory.used}/{metrics.memory.total} MB</b></div></div>
    <div className="sim-grid">
      <section className="sim-card"><h3><Radio size={15}/> Alert intake and bounded buffer <small>mutex + semaphores</small></h3><div className="sim-slots">{Array.from({length:state.capacity},(_,i)=><div key={i} className={state.buffer[i]?'sim-slot filled':'sim-slot'}>{state.buffer[i]?<><b>{state.buffer[i].id}</b><small>{state.buffer[i].source} · {state.buffer[i].severity}</small></>:<small>EMPTY</small>}</div>)}</div><div className="sim-sems"><span>MUTEX <b>UNLOCKED</b></span><span>EMPTY <b>{state.capacity-state.buffer.length}</b></span><span>FULL <b>{state.buffer.length}</b></span></div><p className="sim-help">Producer = alert source; dispatcher consumes FIFO. Semaphore signals are modeled as deterministic simulation events.</p></section>
      <section className="sim-card"><h3><Activity size={15}/> Live CPU <small>{state.runningId ? `running ${state.runningId}` : 'idle'}</small></h3><div className="sim-gantt">{state.gantt.slice(-24).map((g,i)=><div key={`${g.id}-${g.start}-${i}`} style={{flex:Math.max(1,g.end-g.start)}} title={`${g.id}: ${g.start}–${g.end}`}><b>{g.id}</b><small>{g.start}–{g.end}</small></div>)}</div><div className="queue-line"><b>Ready:</b> {state.ready.join(' → ') || '—'} <span>Policy: {state.policy}{state.aging?' + aging':''}</span></div></section>
      <section className="sim-card"><h3><HardDrive size={15}/> Memory map <small>{metrics.memory.utilization.toFixed(0)}% used</small></h3><div className="sim-memory">{state.memory.map((b,i)=><div key={`${b.pid||'free'}-${i}`} title={`${b.pid||'Free'} · ${b.size} MB`} style={{width:percent(b.size/state.ram*100)}} className={b.pid?'used':'free'}><b>{b.pid||'FREE'}</b><small>{b.size} MB</small></div>)}</div><p className="sim-help">Largest free block: {Math.max(0,...freeBlocks.map(b=>b.size))} MB · external fragmentation: {metrics.memory.externalFragmentation.toFixed(0)}%</p><button className="outline tiny" onClick={sim.compact}>Compact memory</button><span className="sim-help"> Pending: {state.deferred.filter(t=>t.stage==='memory').length}</span></section>
      <section className="sim-card"><h3><LockKeyhole size={15}/> Banker resource ledger <small>{state.deferred.filter(t=>t.stage==='unsafe').length} deferred unsafe</small></h3><div className="resource-bars">{['Ambulance units','Radio channels','Fire units'].map((name,i)=><div key={name}><span>{name}</span><b>{state.available[i]} / {state.resourceTotal[i]}</b><i><em style={{width:percent(state.available[i]/state.resourceTotal[i]*100)}}/></i></div>)}</div><div className="sim-matrix"><b>Process · Allocation / Max / Need</b>{state.active.map(task=><div key={task.id}>{task.id}<span>{task.allocation.join(',')} / {task.resources.join(',')} / {task.resources.map((v,i)=>v-task.allocation[i]).join(',')}</span></div>)}</div><p className="sim-help">Current safe sequence: {activeSafety?.safe ? activeSafety.sequence.join(' → ') || '—' : 'none'}. Admission runs safety before resource commitment; completion returns resources.</p>{state.unsafeDemo&&<p className="result-unsafe">Unsafe demo rejected; live Available values remain unchanged.</p>}</section>
      <section className="sim-card sim-log"><h3><Activity size={15}/> Event log <small>latest first</small></h3><div className="sim-events">{state.events.slice(0,8).map((e,i)=><div key={`${i}-${e}`}><span className="log-dot"/>{e}</div>)}</div></section>
      <section className="sim-card sim-explain"><h3><CheckCircle2 size={15}/> How the mechanisms work together</h3><p>{state.events[0] || 'Step the clock to admit an emergency alert through the system.'}</p><button className="outline small" onClick={download}><Download size={14}/> Export CSV report</button></section>
    </div>
    <section className="sim-card compare-card"><h3>Compare the same surge workload <small>deterministic, seeded run</small></h3><div className="table-wrap"><table><thead><tr><th>POLICY</th><th>AVG WAIT</th><th>AVG TURNAROUND</th></tr></thead><tbody>{compare.map(row=><tr key={row.policy}><td>{row.policy}</td><td>{fmt(row.waiting)}</td><td>{fmt(row.turnaround)}</td></tr>)}</tbody></table></div></section>
    <section className="sim-card trend-card"><h3>Simulation trends <small>last {state.history.length} ticks</small></h3><div className="trend-grid"><Sparkline title="CPU utilization" values={state.history.map(p=>p.cpu)} color="#59b8df"/><Sparkline title="Buffer / queue length" values={state.history.map(p=>p.buffer+p.queue)} color="#e8b35d"/><Sparkline title="Memory utilization" values={state.history.map(p=>p.memory)} color="#62cb9b"/><Sparkline title="Average ready wait" values={state.history.map(p=>p.wait)} color="#cb8ae5"/></div></section>
    {state.completed.length>0&&<div className="sim-success"><CheckCircle2 size={15}/> {state.completed.length} response tasks completed; memory and resources returned.</div>}
  </div>;
}
