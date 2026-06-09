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
      t.addEventListener('click', () => switchTab(t.dataset.tab)));
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

  function open(tab) {
    ensureModal();
    overlay.classList.add('is-open');
    document.body.classList.add('editor-open');
    switchTab(tab || 'poem');
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('editor-open');
  }

  function note(msg, kind) {
    const n = $('#editorNote', overlay);
    if (!n) return;
    n.textContent = msg || '';
    n.className = 'editor__note' + (kind ? ' is-' + kind : '');
    if (msg) { clearTimeout(note._t); note._t = setTimeout(() => { n.textContent = ''; n.className = 'editor__note'; }, 4000); }
  }

  // ===========================================================
  // Tab: New poem
  // ===========================================================
  function renderPoemTab() {
    const body = $('#editorBody', overlay);
    body.innerHTML = `
      <form class="ed-form" id="poemForm" autocomplete="off">
        <label class="ed-field">
          <span class="ed-label">title</span>
          <input class="ed-input" name="title" type="text" placeholder="e.g. Tidewater" required />
        </label>
        <label class="ed-field">
          <span class="ed-label">epigraph <em>· the small line under the title</em></span>
          <input class="ed-input" name="epigraph" type="text" placeholder="after the storm, before the next" />
        </label>
        <label class="ed-field">
          <span class="ed-label">the poem <em>· one line per line; blank line = stanza break</em></span>
          <textarea class="ed-input ed-textarea" name="body" rows="9" placeholder="the sea forgets its grievances by morning,&#10;rehearses them again by dusk —"></textarea>
        </label>
        <div class="ed-field">
          <span class="ed-label">film loop <em>· plays behind the card &amp; full-screen when opened</em></span>
          <div class="ed-row">
            <select class="ed-input ed-select" name="video" id="poemVideoSel">${videoOptions('')}</select>
            <button type="button" class="btn btn--ghost ed-mini" id="poemAddVideo">+ import / link</button>
          </div>
        </div>
        <div class="ed-actions">
          <button type="submit" class="btn">Add poem →</button>
        </div>
      </form>
      <div class="ed-manage" id="poemManage"></div>`;

    $('#poemAddVideo', overlay).addEventListener('click', () => switchTab('videos'));

    $('#poemForm', overlay).addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const title = f.title.value.trim();
      if (!title) { note('a poem needs a title.', 'warn'); f.title.focus(); return; }
      const bodyLines = f.body.value.replace(/\r/g, '').split('\n');
      const count = Store.getPoems().length + (window.POEMS_BUILTIN_COUNT || 6);
      Store.addPoem({
        title,
        number: String(count + 1).padStart(2, '0'),
        epigraph: f.epigraph.value.trim(),
        video: f.video.value || (window.VIEW_VIDEOS && window.VIEW_VIDEOS.home) || '',
        body: bodyLines
      });
      emitChange();
      note('“' + title + '” added to the index.', 'ok');
      f.reset();
      renderManageList();
    });

    renderManageList();
  }

  function renderManageList() {
    const wrap = $('#poemManage', overlay);
    if (!wrap) return;
    const custom = Store.getPoems();
    if (!custom.length) {
      wrap.innerHTML = '<p class="ed-empty">No custom poems yet. The six built-in poems live in <code>poems.js</code>.</p>';
      return;
    }
    wrap.innerHTML = `
      <div class="ed-divider">your added poems</div>
      <ul class="ed-list">
        ${custom.map(p => `
          <li class="ed-list__item" data-id="${esc(p.id)}">
            <span class="ed-list__num">№ ${esc(p.number)}</span>
            <span class="ed-list__title">${esc(p.title)}</span>
            <button class="ed-list__del" data-del="${esc(p.id)}" aria-label="Delete">remove</button>
          </li>`).join('')}
      </ul>`;
    wrap.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => {
        Store.removePoem(b.dataset.del);
        emitChange();
        renderManageList();
        note('poem removed.', 'ok');
      }));
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
    const builtin = (window.POEMS_ORIGINAL || window.POEMS || []).filter(p => !p.custom);
    const custom = Store.getPoems();
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

    const all = builtin.concat(custom.map(p => ({
      id: p.id, title: p.title, number: p.number,
      video: exportRef(p.video), poster: '', epigraph: p.epigraph || '',
      body: p.body
    })));

    const vv = Object.assign({}, window.VIEW_VIDEOS, Store.getViewVideos());
    const home = exportRef(vv.home), about = exportRef(vv.about);

    const out =
`// Poetry in Motion — generated ${new Date().toISOString().slice(0, 10)}
// Commit this file to your repo to make these poems & videos permanent.
${fileRefs.length ? '// NOTE: uploaded files (' + fileRefs.join(', ') + ') live only in your browser\n//       and cannot be embedded here. Host them at a URL and link instead.\n' : ''}window.POEMS = ${JSON.stringify(all, null, 2)};

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

  window.PIMEditor = { open, close };
})();
