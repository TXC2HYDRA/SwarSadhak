import { useEffect, useState } from 'react';

// Pages live in the URL as /<base>/<key>; the base's home page is /<base>. History API only, no router dependency.
export const ROLE_BASES = ['owner', 'teacher', 'student'];

export const pagePath = (base, key, home) => (key === home ? `/${base}` : `/${base}/${key}`);

// Unknown keys and other bases (another role's URL) fall back to home.
export function pageFromPath(pathname, base, keys, home) {
  const [, first, second] = String(pathname || '/').split('/');
  return first === base && keys.includes(second) ? second : home;
}

export const roleFromPath = (pathname = globalThis.location?.pathname) => {
  const first = String(pathname || '/').split('/')[1];
  return ROLE_BASES.includes(first) ? first : null;
};

export function showPath(path, { replace = false } = {}) {
  const history = globalThis.history;
  if (!history || globalThis.location?.pathname === path) return;
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
}

// Portal page state that follows the URL: refresh, Back/Forward and bookmarks keep the page.
export function useUrlPage(base, keys, home) {
  const read = () => pageFromPath(globalThis.location?.pathname, base, keys, home);
  const [page, setPage] = useState(read);
  useEffect(() => {
    showPath(pagePath(base, page, home), { replace: true });
    const onPop = () => setPage(read());
    globalThis.addEventListener?.('popstate', onPop);
    return () => globalThis.removeEventListener?.('popstate', onPop);
  }, [base]);
  const go = (next) => { showPath(pagePath(base, next, home)); setPage(next); };
  return [page, go];
}
