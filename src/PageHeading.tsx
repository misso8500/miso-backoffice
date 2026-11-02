import type { ReactNode } from 'react';
import './PageHeading.css';

/** Main screen heading. Use h2/h3 for sections within the screen. */
export default function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="page-heading workspace-page-heading">
    <div className="workspace-page-heading-copy"><h1>{title}</h1><p>{description}</p></div>
    {children && <div className="workspace-page-heading-actions">{children}</div>}
  </header>;
}
