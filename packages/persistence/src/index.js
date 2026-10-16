export const createStorage = (storage = globalThis.localStorage) => {
  const memory = new Map();
  const backend = storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
  return {
    get(key, fallback = null) {
      let raw;
      try { raw = backend ? backend.getItem(key) : memory.get(key); } catch { return fallback; }
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (backend) backend.setItem(key, raw); else memory.set(key, raw); return { ok: true, value }; } catch { return { ok: false, value: null, error: 'storage_unavailable' }; }
    },
    remove(key) { try { if (backend) backend.removeItem(key); else memory.delete(key); return true; } catch { return false; } },
    clear() { if (backend && backend.clear) backend.clear(); else memory.clear(); },
  };
};

export const storage = createStorage();
export const getItem = (key, fallback = null) => storage.get(key, fallback);
export const setItem = (key, value) => storage.set(key, value);
