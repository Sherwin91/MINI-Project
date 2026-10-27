import { useCallback, useEffect, useState } from 'react';
import { compactMemory, createSimulation, stepSimulation, triggerDisaster } from '../engine.js';

export function useSimulation() {
  const [state, setState] = useState(() => createSimulation());
  useEffect(() => {
    if (!state.running) return undefined;
    const timer = window.setInterval(() => setState(current => current.running ? stepSimulation(current) : current), 1000 / state.speed);
    return () => window.clearInterval(timer);
  }, [state.running, state.speed]);
  const step = useCallback(() => setState(current => stepSimulation(current)), []);
  const update = useCallback(fn => setState(current => fn(current)), []);
  const toggle = useCallback(() => setState(current => ({ ...current, running: !current.running })), []);
  const reset = useCallback(preset => setState(createSimulation(preset || state.preset)), [state.preset]);
  const disaster = useCallback(() => setState(current => triggerDisaster(current)), []);
  const compact = useCallback(() => setState(current => compactMemory(current)), []);
  return { state, step, update, toggle, reset, disaster, compact };
}
