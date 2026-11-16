import React, { useEffect, useRef, useState } from 'react';
import { Menu, Music2, X } from 'lucide-react';
import { BRAND_DEVANAGARI, PAGE_TERMS, PageCrest, RagaHour, isDevanagari } from './darbar.jsx';

export const Brand = ({ t }) => <span>{t.brand.first}<span>{t.brand.second}</span></span>;

const DRAWER_WIDTH = 850; // matches the CSS breakpoint where the sidebar becomes a drawer

// One shell for every role: sidebar on desktop (collapsible), drawer on tablets, bottom navigation on phones.
// items: [{ key, label, Icon }]; tools sit in the top bar (language, theme); account sits at the foot of the sidebar.
export function AppShell({ t, kicker, note, items, active, focusKey = active, onNavigate, title, tools, footer, account, children }) {
  const mainRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (globalThis.innerWidth ?? 1280) <= DRAWER_WIDTH);
  useEffect(() => {
    // New page: move focus to its heading so screen readers announce it.
    const heading = mainRef.current?.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }, [focusKey]);
  useEffect(() => {
    const onResize = () => {
      const mobile = globalThis.innerWidth <= DRAWER_WIDTH;
      setIsMobile(mobile);
      if (mobile) setCollapsed(false); else setMenuOpen(false);
    };
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, []);
  const go = (key) => { setMenuOpen(false); onNavigate(key); };
  const hidden = (isMobile && !menuOpen) || collapsed;
  const closeMenu = () => { setMenuOpen(false); mainRef.current?.querySelector('.menu-button')?.focus(); };
  const navButton = (item, className) => <button key={item.key} className={`${className} ${item.key === active ? 'active' : ''}`} aria-current={item.key === active ? 'page' : undefined} onClick={() => go(item.key)}>
    <item.Icon size={className === 'nav-item' ? 19 : 21} aria-hidden="true" />{className === 'nav-item' && !isDevanagari(item.label) && PAGE_TERMS[item.key] ? <span className="nav-label">{item.label}<small className="nav-term" lang="hi" aria-hidden="true">{PAGE_TERMS[item.key]}</small></span> : <span>{item.label}</span>}{className === 'nav-item' && item.key === active && <span className="nav-active-mark" aria-hidden="true" />}
  </button>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">{t.portal.skipToContent}</a>
    <aside id="primary-navigation" className={`sidebar ${menuOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label={t.nav} inert={hidden ? true : undefined} onKeyDown={(event) => { if (event.key === 'Escape') closeMenu(); }}>
      <div className="sidebar-header"><div className="brand"><span className="brand-mark"><Music2 size={20} aria-hidden="true" /></span><span><Brand t={t} />{!isDevanagari(t.brand.first) && <small className="brand-devanagari" lang="mr">{BRAND_DEVANAGARI}</small>}</span></div><button className="icon-button close-menu" aria-label={t.close} onClick={closeMenu}><X size={20} aria-hidden="true" /></button></div>
      {kicker && <div className="sidebar-intro"><span className="sidebar-kicker">{kicker}</span>{note && <span className="sidebar-note">{note}</span>}</div>}
      <nav aria-label={t.nav}>{items.map((item) => navButton(item, 'nav-item'))}</nav>
      <div className="sidebar-footer">{footer}{account && <div className="sidebar-account">{account}</div>}</div>
    </aside>
    {menuOpen && <button className="scrim" aria-label={t.close} onClick={closeMenu} />}
    <div ref={mainRef} className={`main-content ${collapsed ? 'expanded' : ''}`}>
      <header className="topbar">
        <button className="icon-button menu-button" aria-label={hidden ? t.openMenu : t.close} aria-controls="primary-navigation" aria-expanded={!hidden} onClick={() => (isMobile ? setMenuOpen((open) => !open) : setCollapsed((value) => !value))}><Menu size={22} aria-hidden="true" /></button>
        <span className="brand-mark topbar-mark" aria-hidden="true"><Music2 size={16} /></span>
        <strong className="topbar-title">{title}</strong>
        <RagaHour t={t} /><div className="topbar-tools">{tools}</div>
      </header>
      <main id="main-content" tabIndex={-1}><PageCrest term={PAGE_TERMS[focusKey] || PAGE_TERMS[active]} />{children}</main>
    </div>
    <nav className="bottom-nav" aria-label={t.nav}>
      {items.slice(0, 4).map((item) => navButton(item, 'bottom-nav-item'))}
      <button className="bottom-nav-item" aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} aria-hidden="true" /><span>{t.portal.more}</span></button>
    </nav>
  </div>;
}
