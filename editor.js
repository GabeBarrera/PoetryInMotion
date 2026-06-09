/* ===========================================================
   Poetry in Motion — content editor
   New poem form · video library/import · landing video picker · export
   Exposes window.PIMEditor { open(tab) }
   Emits window event "pim:datachanged" when content changes.
   =========================================================== */
(function () {
  'use strict';

  const Store = window.PIMStore;
  const $ = (s, r) => (r || document).querySelector(s);

  function emitChange() { window.dispatchEvent(new CustomEvent('pim:datachanged')); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

  // Built-in ambient clips, named, so the picker is friendly.
  function builtinClips() {
    const seen = new Set();
    const out = [];
    (window.POEMS_ORIGINAL || window.POEMS || []).forEach(p => {
      if (p.video && !seen.has(p.video)) { seen.add(p.video); out.push({ url: p.video, name: 'clip · ' + p.title }); }
    });
    const vv = window.VIEW_VIDEOS || {};
    [['home', 'clip · ocean (default home)'], ['about', 'clip · clouds (default about)']].forEach(([k, n]) => {
      if (vv[k] && !seen.has(vv[k])) { seen.add(vv[k]); out.push({ url: vv[k], name: n }); }
    });
    return out;
  }

  /* Build <option>s for a video <select>. Value is a video ref.
     Groups: imported library, then built-in clips. */
  function videoOptions(selectedRef) {
    const lib = Store.getVideos();
    const clips = builtinClips();
    let html = '<option value="">— choose a film loop —</option>';
    if (lib.length) {
      html += '<optgroup label="your imported videos">';
      lib.forEach(v => {
        const ref = 'lib:' + v.id;
        html += `<option value="${esc(ref)}"${ref === selectedRef ? ' selected' : ''}>${esc(v.name)} · ${v.kind === 'file' ? 'file' : 'link'}</option>`;
      });
      html += '</optgroup>';
    }
    html += '<optgroup label="built-in clips">';
    clips.forEach(c => {
      html += `<option value="${esc(c.url)}"${c.url === selectedRef ? ' selected' : ''}>${esc(c.name)}</option>`;
    });
    html += '</optgroup>';
    return html;
  }

  // ===========================================================
  // Modal shell
  // ===========================================================
  let overlay, panel, currentTab = 'poem';
  let editingId = null;

  function ensureModal() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'editor-overlay';
    overlay.innerHTML = `
      <div class="editor" role="dialog" aria-modal="true" aria-label="Editor">
        <header class="editor__head">
          <div class="editor__tabs">
            <button class="editor__tab" data-tab="poem">+ new poem</button>
            <button class="editor__tab" data-tab="videos">videos</button>
          </div>
          <button class="editor__close" aria-label="Close editor">✕</button>
        </header>
        <div class="editor__body" id="editorBody"></div>
        <footer class="editor__foot">
          <span class="editor__note" id="editorNote"></span>
          <button class="btn btn--ghost editor__export" id="editorExport">Export poems.js ↓</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    $('.editor__close', overlay).addEventListener('click', close);
    overlay.querySelectorAll('.editor__tab').forEach(t =>
      t.addEventListener('click', () => {
        if (t.dataset.tab === 'poem') editingId = null; // tab = start a fresh new poem
        switchTab(t.dataset.tab);
      }));
    $('#editorExport', overlay).addEventListener('click', exportPoemsJS);
    panel = $('.editor', overlay);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) { e.stopPropagation(); close(); }
    }, true);
  }

  function switchTab(tab) {
    currentTab = tab;
    overlay.querySelectorAll('.editor__tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.tab === tab));
    if (tab === 'poem') renderPoemTab();
    else renderVideosTab();
  }

  function requireAdmin() {
    if (Store && Store.isAdmin()) return true;
    openLogin();
    return false;
  }

  function open(tab) {
    if (!requireAdmin()) return;
    ensureModal();
    editingId = null;
    overlay.classList.add('is-open');
    document.body.classList.add('editor-open');
    switchTab(tab || 'poem');
  }

  function edit(id) {
    if (!requireAdmin()) return;
    ensureModal();
    editingId = id;
    overlay.classList.add('is-open');
    document.body.classList.add('editor-open');
    switchTab('poem');
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('editor-open');
    editingId = null;
  }

  function note(msg, kind) {
    const n = $('#editorNote', overlay);
    if (!n) return;
    n.textContent = msg || '';
    n.className = 'editor__note' + (kind ? ' is-' + kind : '');
    if (msg) { clearTimeout(note._t); note._t = setTimeout(() => { n.textContent = ''; n.className = 'editor__note'; }, 4000); }
  }

  // ===========================================================
  // Tab: New / edit poem (rich text)
  // ===========================================================
  let rt = null; // active rich-text instance

  function renderPoemTab() {
    const body = $('#editorBody', overlay);
    const editing = editingId ? (window.POEMS || []).find(p => p.id === editingId) : null;
    const initialHtml = editing
      ? (editing.bodyHtml || (window.PIMRichText && window.PIMRichText.linesToHtml(editing.body)) || '')
      : '';
    const isCustom = editing && editing.custom;
    const isEdited = editing && !isCustom && Store.getOverrides()[editing.id];

    body.innerHTML = `
      <form class="ed-form" id="poemForm" autocomplete="off">
        <div class="ed-formhead">
          ${editing ? 'edit poem · № ' + esc(editing.number) : 'new poem'}
          ${isCustom ? '<span class="ed-list__tag">added</span>' : (isEdited ? '<span class="ed-list__tag">edited</span>' : '')}
        </div>
        <label class="ed-field">
          <span class="ed-label">title</span>
          <input class="ed-input" name="title" type="text" value="${editing ? esc(editing.title) : ''}" placeholder="e.g. Tidewater" required />
        </label>
        <label class="ed-field">
          <span class="ed-label">epigraph <em>· the small line under the title</em></span>
          <input class="ed-input" name="epigraph" type="text" value="${editing ? esc(editing.epigraph || '') : ''}" placeholder="after the storm, before the next" />
        </label>
        <div class="ed-field">
          <span class="ed-label">the poem <em>· format with the toolbar; Tab to indent</em></span>
          <div class="ed-rtmount" id="rtMount"></div>
        </div>
        <div class="ed-field">
          <span class="ed-label">film loop <em>· plays behind the card &amp; full-screen when opened</em></span>
          <div class="ed-row">
            <select class="ed-input ed-select" name="video" id="poemVideoSel">${videoOptions(editing ? editing.video : '')}</select>
            <button type="button" class="btn btn--ghost ed-mini" id="poemAddVideo">+ import / link</button>
          </div>
        </div>
        <div class="ed-actions">
          ${editing && !isCustom ? '<button type="button" class="ed-danger" id="poemReset">revert to original</button>' : ''}
          ${isCustom ? '<button type="button" class="ed-danger" id="poemDelete">delete poem</button>' : ''}
          <button type="submit" class="btn">${editing ? 'Save changes →' : 'Add poem →'}</button>
        </div>
      </form>
      <div class="ed-manage" id="poemManage"></div>`;

    rt = window.PIMRichText.create($('#rtMount', overlay), initialHtml);

    $('#poemAddVideo', overlay).addEventListener('click', () => switchTab('videos'));

    const resetBtn = $('#poemReset', overlay);
    if (resetBtn) resetBtn.addEventListener('click', () => {
      Store.removeOverride(editing.id);
      emitChange();
      note('reverted to the original.', 'ok');
      editingId = null;
      renderPoemTab();
    });
    const delBtn = $('#poemDelete', overlay);
    if (delBtn) delBtn.addEventListener('click', () => {
      Store.removePoem(editing.id);
      emitChange();
      note('poem deleted.', 'ok');
      editingId = null;
      renderPoemTab();
    });

    $('#poemForm', overlay).addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const title = f.title.value.trim();
      if (!title) { note('a poem needs a title.', 'warn'); f.title.focus(); return; }
      const patch = {
        title,
        epigraph: f.epigraph.value.trim(),
        video: f.video.value || (window.VIEW_VIDEOS && window.VIEW_VIDEOS.home) || '',
        bodyHtml: rt.getHtml()
      };
      if (editing) {
        if (editing.custom) Store.updatePoem(editing.id, patch);
        else Store.setOverride(editing.id, patch);
        emitChange();
        note('“' + title + '” saved.', 'ok');
        renderManageList();
      } else {
        const count = (window.POEMS ? window.POEMS.length : (window.POEMS_BUILTIN_COUNT || 6));
        Store.addPoem(Object.assign({
          number: String(count + 1).padStart(2, '0'),
          body: []
        }, patch));
        emitChange();
        note('“' + title + '” added to the index.', 'ok');
        f.reset();
        rt.setHtml('');
        renderManageList();
      }
    });

    renderManageList();
    requestAnimationFrame(() => { const b = $('#editorBody', overlay); if (b) b.scrollTop = 0; });
  }

  function renderManageList() {
    const wrap = $('#poemManage', overlay);
    if (!wrap) return;
    const all = window.POEMS || [];
    const overrides = Store.getOverrides();
    wrap.innerHTML = `
      <div class="ed-divider">all poems · tap to edit</div>
      <ul class="ed-list">
        ${all.map(p => `
          <li class="ed-list__item${p.id === editingId ? ' is-editing' : ''}" data-id="${esc(p.id)}">
            <span class="ed-list__num">№ ${esc(p.number)}</span>
            <span class="ed-list__title">${esc(p.title)}</span>
            ${p.custom ? '<span class="ed-list__tag">added</span>' : (overrides[p.id] ? '<span class="ed-list__tag">edited</span>' : '')}
            <button class="ed-list__edit" data-edit="${esc(p.id)}">edit</button>
          </li>`).join('')}
      </ul>`;
    wrap.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => { editingId = b.dataset.edit; renderPoemTab(); }));
  }

  // ===========================================================
  // Tab: Videos (landing pickers + library + import)
  // ===========================================================
  function renderVideosTab() {
    const body = $('#editorBody', overlay);
    const vv = Object.assign({}, window.VIEW_VIDEOS, Store.getViewVideos());
    body.innerHTML = `
      <div class="ed-section">
        <div class="ed-divider">background films</div>
        <div class="ed-row ed-row--wrap">
          <label class="ed-field ed-field--grow">
            <span class="ed-label">landing page</span>
            <select class="ed-input ed-select" id="viewHome">${videoOptions(vv.home || '')}</select>
          </label>
          <label class="ed-field ed-field--grow">
            <span class="ed-label">about page</span>
            <select class="ed-input ed-select" id="viewAbout">${videoOptions(vv.about || '')}</select>
          </label>
        </div>
      </div>

      <div class="ed-section">
        <div class="ed-divider">import a film loop</div>
        <div class="ed-import">
          <div class="ed-import__col">
            <span class="ed-label">link by URL</span>
            <input class="ed-input" id="impName" type="text" placeholder="name (e.g. harbor lights)" />
            <input class="ed-input" id="impURL" type="url" placeholder="https://…/clip.mp4" />
            <button class="btn btn--ghost ed-mini" id="impURLBtn">link video</button>
          </div>
          <div class="ed-import__div">or</div>
          <div class="ed-import__col">
            <span class="ed-label">upload a file <em>· stays in this browser</em></span>
            <input class="ed-file" id="impFile" type="file" accept="video/*" />
            <button class="btn btn--ghost ed-mini" id="impFileBtn">add file</button>
          </div>
        </div>
      </div>

      <div class="ed-section">
        <div class="ed-divider">your library</div>
        <div class="ed-grid" id="vidGrid"></div>
      </div>`;

    // view pickers
    $('#viewHome', overlay).addEventListener('change', e => { Store.setViewVideo('home', e.target.value); emitChange(); note('landing film updated.', 'ok'); });
    $('#viewAbout', overlay).addEventListener('change', e => { Store.setViewVideo('about', e.target.value); emitChange(); note('about film updated.', 'ok'); });

    // import by URL
    $('#impURLBtn', overlay).addEventListener('click', () => {
      const url = $('#impURL', overlay).value.trim();
      const name = $('#impName', overlay).value.trim();
      if (!url) { note('paste a video URL first.', 'warn'); return; }
      Store.addVideoURL(name, url);
      emitChange();
      note('video linked.', 'ok');
      renderVideosTab();
    });

    // import file
    $('#impFileBtn', overlay).addEventListener('click', async () => {
      const input = $('#impFile', overlay);
      const file = input.files && input.files[0];
      if (!file) { note('choose a video file first.', 'warn'); return; }
      const name = $('#impName', overlay).value.trim() || file.name;
      note('saving file…');
      try {
        await Store.addVideoFile(name, file);
        emitChange();
        note('file added to your library.', 'ok');
        renderVideosTab();
      } catch (err) { note('could not save file (too large?).', 'warn'); }
    });

    renderVideoGrid();
  }

  function renderVideoGrid() {
    const grid = $('#vidGrid', overlay);
    if (!grid) return;
    const lib = Store.getVideos();
    if (!lib.length) {
      grid.innerHTML = '<p class="ed-empty">Nothing imported yet. Link a URL or upload a file above — it becomes available to every poem and to the background pickers.</p>';
      return;
    }
    grid.innerHTML = lib.map(v => `
      <figure class="vid-cell" data-id="${esc(v.id)}">
        <div class="vid-cell__media"><video muted loop playsinline></video></div>
        <figcaption class="vid-cell__cap">
          <span class="vid-cell__name" title="${esc(v.name)}">${esc(v.name)}</span>
          <span class="vid-cell__kind">${v.kind === 'file' ? 'file' : 'link'}</span>
        </figcaption>
        <button class="vid-cell__del" data-del="${esc(v.id)}" aria-label="Delete">remove</button>
      </figure>`).join('');

    // resolve + attach previews
    lib.forEach(async v => {
      const cell = grid.querySelector(`.vid-cell[data-id="${CSS.escape(v.id)}"]`);
      if (!cell) return;
      const url = await Store.resolveRef('lib:' + v.id);
      const vid = cell.querySelector('video');
      if (url && vid) { vid.src = url; const p = vid.play(); if (p && p.catch) p.catch(() => {}); }
    });

    grid.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        await Store.removeVideo(b.dataset.del);
        emitChange();
        renderVideoGrid();
        note('video removed.', 'ok');
      }));
  }

  // ===========================================================
  // Export — generate a poems.js you can commit to the repo
  // ===========================================================
  function exportPoemsJS() {
    const lib = Store.getVideos();
    const fileRefs = [];

    // map a ref to an exportable URL; flag file-based refs (binary can't be inlined)
    function exportRef(ref) {
      if (!ref) return '';
      if (ref.indexOf('lib:') !== 0) return ref;
      const rec = lib.find(v => v.id === ref.slice(4));
      if (!rec) return '';
      if (rec.kind === 'url') return rec.url;
      fileRefs.push(rec.name);
      return ''; // uploaded file — cannot be exported as a URL
    }

    // window.POEMS is the merged list (built-ins + edits + custom), so this
    // captures everything the visitor currently sees.
    const imgNote = [];
    const all = (window.POEMS || []).map(p => {
      const o = {
        id: p.id, title: p.title, number: p.number,
        video: exportRef(p.video), poster: '', epigraph: p.epigraph || ''
      };
      if (p.bodyHtml) {
        if (/<img[^>]+src="data:/i.test(p.bodyHtml)) imgNote.push(p.title);
        o.bodyHtml = p.bodyHtml;
      } else {
        o.body = p.body || [];
      }
      return o;
    });

    const vv = Object.assign({}, window.VIEW_VIDEOS, Store.getViewVideos());
    const home = exportRef(vv.home), about = exportRef(vv.about);

    const notes = [];
    if (fileRefs.length) notes.push('// NOTE: uploaded video files (' + fileRefs.join(', ') + ') live only in your\n//       browser and cannot be embedded here. Host them at a URL and link instead.');
    if (imgNote.length) notes.push('// NOTE: ' + imgNote.join(', ') + ' contain embedded (pasted) images stored\n//       inline as data URLs — fine, but they enlarge this file.');

    const out =
`// Poetry in Motion — generated ${new Date().toISOString().slice(0, 10)}
// Commit this file to your repo to make these poems & videos permanent.
${notes.length ? notes.join('\n') + '\n' : ''}window.POEMS = ${JSON.stringify(all, null, 2)};

window.VIEW_VIDEOS = ${JSON.stringify({ home, about }, null, 2)};
`;

    const blob = new Blob([out], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'poems.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note(fileRefs.length ? 'exported — note: uploaded files were skipped.' : 'poems.js downloaded.', fileRefs.length ? 'warn' : 'ok');
  }

  // ===========================================================
  // Admin sign-in modal
  // ===========================================================
  let authOverlay;

  function ensureAuthModal() {
    if (authOverlay) return;
    authOverlay = document.createElement('div');
    authOverlay.className = 'auth-overlay';
    document.body.appendChild(authOverlay);
    authOverlay.addEventListener('click', e => { if (e.target === authOverlay) closeLogin(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && authOverlay.classList.contains('is-open')) closeLogin();
    });
  }

  function renderAuth() {
    const admin = Store && Store.isAdmin();
    authOverlay.innerHTML = `
      <div class="auth" role="dialog" aria-modal="true" aria-label="Editor sign-in">
        <button class="auth__close" aria-label="Close">✕</button>
        <div class="auth__mark${admin ? ' is-star' : ''}">${admin ? '★' : '◷'}</div>
        ${admin ? `
          <h3 class="auth__title">you're signed in</h3>
          <p class="auth__sub">editor mode is on — the new-poem, edit, and video controls are now visible across the site.</p>
          <button class="btn auth__go" id="authLogout">log out</button>
        ` : `
          <h3 class="auth__title">editor sign-in</h3>
          <p class="auth__sub">enter the passphrase to add &amp; edit poems.</p>
          <form id="authForm" autocomplete="off">
            <input class="ed-input auth__input" id="authPw" type="password" placeholder="passphrase" autocomplete="current-password" />
            <p class="auth__err" id="authErr"></p>
            <button class="btn auth__go" type="submit">sign in</button>
          </form>
        `}
      </div>`;

    authOverlay.querySelector('.auth__close').addEventListener('click', closeLogin);

    if (admin) {
      authOverlay.querySelector('#authLogout').addEventListener('click', () => {
        Store.logout();
        window.dispatchEvent(new CustomEvent('pim:authchanged'));
        closeLogin();
      });
    } else {
      const form = authOverlay.querySelector('#authForm');
      form.addEventListener('submit', e => {
        e.preventDefault();
        const pw = authOverlay.querySelector('#authPw').value;
        if (Store.login(pw)) {
          window.dispatchEvent(new CustomEvent('pim:authchanged'));
          closeLogin();
        } else {
          authOverlay.querySelector('#authErr').textContent = 'that isn’t the passphrase.';
          const card = authOverlay.querySelector('.auth');
          card.classList.remove('is-shake'); void card.offsetWidth; card.classList.add('is-shake');
        }
      });
      setTimeout(() => { const i = authOverlay.querySelector('#authPw'); if (i) i.focus(); }, 60);
    }
  }

  function openLogin() {
    ensureAuthModal();
    renderAuth();
    authOverlay.classList.add('is-open');
  }
  function closeLogin() {
    if (authOverlay) authOverlay.classList.remove('is-open');
  }

  window.PIMEditor = { open, edit, close, openLogin, closeLogin };
})();
