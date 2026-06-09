/* ===========================================================
   Poetry in Motion — persistence store
   - localStorage: poem metadata + video library index + view overrides
   - IndexedDB:    uploaded video file blobs (too big for localStorage)
   Exposes window.PIMStore
   =========================================================== */
(function () {
  'use strict';

  const LS_POEMS  = 'pim.poems.v1';
  const LS_VIDEOS = 'pim.videos.v1';
  const LS_VIEWS  = 'pim.viewVideos.v1';
  const LS_OVER   = 'pim.overrides.v1';   // edits to built-in poems
  const LS_ADMIN  = 'pim.admin.v1';

  // NB: a client-only password on a static site is obfuscation, not real
  // security. Anyone can read it in the source. Fine for gating a personal
  // publishing UI; do not protect anything sensitive with it.
  const ADMIN_PASSWORD = 'apoetwhodidntknowit';

  const DB_NAME = 'pim-media';
  const DB_STORE = 'blobs';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbPut(key, blob) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(blob, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const r = tx.objectStore(DB_STORE).get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbDel(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // ---- localStorage helpers --------------------------------
  function readLS(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch { return fallback; }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('LS write failed', e); }
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---- object-URL cache (so we don't leak / recreate) ------
  const urlCache = new Map(); // videoId -> objectURL

  // ===========================================================
  // PUBLIC API
  // ===========================================================
  const Store = {
    // ----- video library -----
    getVideos() { return readLS(LS_VIDEOS, []); },

    /** Add a video that is linked by URL. Returns the record. */
    addVideoURL(name, url) {
      const videos = Store.getVideos();
      const rec = { id: uid('vid'), name: name || url, kind: 'url', url: url };
      videos.push(rec);
      writeLS(LS_VIDEOS, videos);
      return rec;
    },

    /** Add an uploaded file. Stores blob in IndexedDB. Returns the record. */
    async addVideoFile(name, file) {
      const id = uid('vid');
      await idbPut(id, file);
      const videos = Store.getVideos();
      const rec = { id, name: name || file.name, kind: 'file', mime: file.type, size: file.size };
      videos.push(rec);
      writeLS(LS_VIDEOS, videos);
      return rec;
    },

    async removeVideo(id) {
      const videos = Store.getVideos().filter(v => v.id !== id);
      writeLS(LS_VIDEOS, videos);
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
      try { await idbDel(id); } catch (_) {}
    },

    /** Resolve a video reference to a playable URL.
        ref can be: a raw http(s) url, or "lib:<videoId>". */
    async resolveRef(ref) {
      if (!ref) return '';
      if (ref.indexOf('lib:') !== 0) return ref; // raw URL
      const id = ref.slice(4);
      if (urlCache.has(id)) return urlCache.get(id);
      const rec = Store.getVideos().find(v => v.id === id);
      if (!rec) return '';
      if (rec.kind === 'url') return rec.url;
      const blob = await idbGet(id);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    },

    // ----- custom poems -----
    getPoems() { return readLS(LS_POEMS, []); },

    addPoem(poem) {
      const poems = Store.getPoems();
      const rec = Object.assign({ id: uid('poem'), custom: true }, poem);
      poems.push(rec);
      writeLS(LS_POEMS, poems);
      return rec;
    },

    updatePoem(id, patch) {
      const poems = Store.getPoems();
      const i = poems.findIndex(p => p.id === id);
      if (i < 0) return null;
      poems[i] = Object.assign({}, poems[i], patch);
      writeLS(LS_POEMS, poems);
      return poems[i];
    },

    removePoem(id) {
      writeLS(LS_POEMS, Store.getPoems().filter(p => p.id !== id));
    },

    // ----- view (landing/about) video overrides -----
    getViewVideos() { return readLS(LS_VIEWS, {}); },
    setViewVideo(view, ref) {
      const v = Store.getViewVideos();
      if (ref) v[view] = ref; else delete v[view];
      writeLS(LS_VIEWS, v);
    },

    // ----- edits applied to BUILT-IN poems (kept separate so we never
    //       mutate poems.js; merged over the originals at read time) -----
    getOverrides() { return readLS(LS_OVER, {}); },
    setOverride(id, patch) {
      const o = Store.getOverrides();
      o[id] = Object.assign({}, o[id], patch);
      writeLS(LS_OVER, o);
    },
    removeOverride(id) {
      const o = Store.getOverrides();
      delete o[id];
      writeLS(LS_OVER, o);
    },

    // ----- admin auth -----
    isAdmin() { return readLS(LS_ADMIN, false) === true; },
    login(pw) {
      if (pw === ADMIN_PASSWORD) { writeLS(LS_ADMIN, true); return true; }
      return false;
    },
    logout() { writeLS(LS_ADMIN, false); },

    uid
  };

  window.PIMStore = Store;
})();
