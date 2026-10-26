import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';

export const workOperationEvent = 'miso-work-operation';
export type WorkOperation = { id: string; phase: 'start' | 'success' | 'error' };

export default function WorkOperationStatus() {
  const [phase, setPhase] = useState<'hidden' | 'busy' | 'success' | 'error'>('hidden');
  const [leaving, setLeaving] = useState(false);
  const indicator = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = indicator.current;
    if (node && phase !== 'hidden') {
      if (node.matches(':popover-open')) node.hidePopover();
      node.showPopover();
    }
  }, [phase]);
  useEffect(() => {
    const active = new Set<string>();
    let failed = false;
    let started = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(action: () => void, delay: number) { const timer = setTimeout(() => { timers.delete(timer); action(); }, delay); timers.add(timer); }
    function clear() { for (const timer of timers) clearTimeout(timer); timers.clear(); }
    function update(event: Event) {
      const operation = (event as CustomEvent<WorkOperation>).detail;
      if (operation.phase === 'start') {
        clear();
        if (!active.size) { failed = false; started = Date.now(); }
        active.add(operation.id); setLeaving(false); setPhase('busy');
      } else {
        if (!active.delete(operation.id)) return;
        failed ||= operation.phase === 'error';
        if (!active.size) later(() => {
          setPhase(failed ? 'error' : 'success');
          later(() => { setLeaving(true); later(() => setPhase('hidden'), 260); }, failed ? 1800 : 1000);
        }, Math.max(0, 350 - (Date.now() - started)));
      }
    }
    window.addEventListener(workOperationEvent, update);
    return () => { clear(); window.removeEventListener(workOperationEvent, update); };
  }, []);
  if (phase === 'hidden') return null;
  return <div ref={indicator} popover="manual" className={`work-operation-status is-${phase} ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite">
    <span className="work-operation-icons" aria-hidden="true"><RefreshCw className="work-operation-spinner" size={23}/><Check className="work-operation-check" size={25}/><X className="work-operation-error" size={23}/></span>
    <span>{phase === 'busy' ? '처리 중' : phase === 'success' ? '완료' : '처리 실패'}</span>
  </div>;
}
