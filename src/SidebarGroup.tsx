import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SidebarGroup({ title, active = false, children }: {
  title: string; active?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(active);
  const panelId = useId();
  useEffect(() => { if (active) setOpen(true); }, [active]);
  return <div className="sidebar-group">
    <button type="button" className="sidebar-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(value=>!value)}><span>{title}</span><ChevronDown size={15} aria-hidden="true"/></button>
    <div id={panelId} className="sidebar-group-items" hidden={!open}>{children}</div>
  </div>;
}
