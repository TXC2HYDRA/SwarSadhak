import React, { useState } from 'react';
import { PortalShell } from './PortalShell.jsx';

export function TeacherPortal({ shell }) {
  const [page, setPage] = useState('dashboard');
  const p = shell.t.portal;
  return <PortalShell {...shell} nav={[['dashboard', p.nav.dashboard]]} page={page} onPage={setPage}>
    <div className="page portal-page"><h1>{p.teacher.title}</h1><p className="page-lede">{p.teacher.lede}</p></div>
  </PortalShell>;
}
