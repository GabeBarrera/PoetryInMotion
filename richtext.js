/* ===========================================================
   Poetry in Motion — minimal rich-text editor
   A contenteditable surface + typewriter-styled toolbar.
   Usage:
     const rt = PIMRichText.create(mountEl, initialHtml);
     rt.getHtml();  rt.focus();
   =========================================================== */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // toolbar definition — groups separated for layout
  const GROUPS = [
    [
      { cmd: 'bold',      label: 'B',  title: 'Bold (Ctrl+B)',   cls: 'is-bold' },
      { cmd: 'italic',    label: 'I',  title: 'Italic (Ctrl+I)', cls: 'is-italic' },
      { cmd: 'underline', label: 'U',  title: 'Underline',       cls: 'is-underline' }
    ],
    [
      { block: 'H1', label: 'H1', title: 'Heading 1' },
      { block: 'H2', label: 'H2', title: 'Heading 2' },
      { block: 'H3', label: 'H3', title: 'Heading 3' },
      { block: 'P',  label: '¶',  title: 'Body text' }
    ],
    [
      { cmd: 'justifyLeft',   label: '⇤', title: 'Align left' },
      { cmd: 'justifyCenter', label: '↔', title: 'Align center' },
      { cmd: 'justifyRight',  label: '⇥', title: 'Align right' }
    ],
    [
      { cmd: 'outdent', label: '⇧⇥', title: 'Outdent' },
      { cmd: 'indent',  label: '⇥',  title: 'Indent / tab' }
    ],
    [
      { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
      { cmd: 'insertOrderedList',   label: '1.', title: 'Numbered list' }
    ]
  ];

  function create(mount, initialHtml) {
    mount.classList.add('rt');
    mount.innerHTML = `
      <div class="rt-toolbar" role="toolbar" aria-label="Formatting">
        ${GROUPS.map(group => `
          <div class="rt-group">
            ${group.map(b => `
              <button type="button" class="rt-btn ${b.cls || ''}"
                ${b.cmd ? `data-cmd="${b.cmd}"` : ''}
                ${b.block ? `data-block="${b.block}"` : ''}
                title="${esc(b.title)}" tabindex="-1">${b.label}</button>`).join('')}
          </div>`).join('')}
        <div class="rt-group">
          <select class="rt-select" data-size title="Font size" tabindex="-1">
            <option value="">size</option>
            <option value="2">small</option>
            <option value="3">normal</option>
            <option value="4">large</option>
            <option value="5">x-large</option>
            <option value="6">huge</option>
          </select>
        </div>
        <div class="rt-group rt-group--img">
          <button type="button" class="rt-btn" data-img title="Embed a picture" tabindex="-1">⊞ image</button>
        </div>
      </div>
      <div class="rt-imgbar" hidden>
        <input type="url" class="rt-imgurl" placeholder="paste image URL…" />
        <span class="rt-imgor">or</span>
        <label class="rt-imgfile-label">choose file
          <input type="file" class="rt-imgfile" accept="image/*" hidden />
        </label>
        <button type="button" class="rt-imgins">insert</button>
        <button type="button" class="rt-imgcancel" aria-label="Cancel">✕</button>
      </div>
      <div class="rt-area" contenteditable="true" spellcheck="true"></div>`;

    const toolbar = mount.querySelector('.rt-toolbar');
    const area = mount.querySelector('.rt-area');
    const imgbar = mount.querySelector('.rt-imgbar');

    area.innerHTML = (initialHtml && initialHtml.trim()) ? initialHtml : '<p><br></p>';

    // inline styles for align/size so they survive serialization
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}

    function exec(cmd, val) {
      area.focus();
      try { document.execCommand(cmd, false, val); } catch (_) {}
      refreshState();
    }

    // keep selection when clicking the toolbar
    toolbar.addEventListener('mousedown', e => {
      if (e.target.closest('button, select')) e.preventDefault();
    });

    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('.rt-btn');
      if (!btn) return;
      if (btn.dataset.cmd) exec(btn.dataset.cmd);
      else if (btn.dataset.block) exec('formatBlock', btn.dataset.block);
      else if (btn.hasAttribute('data-img')) toggleImgBar();
    });

    const sizeSel = toolbar.querySelector('[data-size]');
    sizeSel.addEventListener('change', () => {
      if (sizeSel.value) exec('fontSize', sizeSel.value);
      sizeSel.value = '';
    });

    // ---- image embedding ----
    function toggleImgBar() {
      imgbar.hidden = !imgbar.hidden;
      if (!imgbar.hidden) imgbar.querySelector('.rt-imgurl').focus();
    }
    let savedRange = null;
    area.addEventListener('mouseup', saveRange);
    area.addEventListener('keyup', saveRange);
    function saveRange() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && area.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
    }
    function insertImage(src) {
      if (!src) return;
      area.focus();
      const sel = window.getSelection();
      if (savedRange) { sel.removeAllRanges(); sel.addRange(savedRange); }
      const img = document.createElement('img');
      img.src = src;
      img.className = 'rt-embed';
      const range = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (range) {
        range.collapse(false);
        range.insertNode(img);
        // move caret after image
        range.setStartAfter(img); range.collapse(true);
        sel.removeAllRanges(); sel.addRange(range);
      } else {
        area.appendChild(img);
      }
      imgbar.hidden = true;
      imgbar.querySelector('.rt-imgurl').value = '';
    }
    imgbar.querySelector('.rt-imgins').addEventListener('click', () => {
      const url = imgbar.querySelector('.rt-imgurl').value.trim();
      if (url) insertImage(url);
    });
    imgbar.querySelector('.rt-imgcancel').addEventListener('click', () => { imgbar.hidden = true; });
    imgbar.querySelector('.rt-imgfile').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => insertImage(reader.result);
      reader.readAsDataURL(file);
    });

    // ---- Tab key = indent (typewriter tabbing) ----
    area.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        exec(e.shiftKey ? 'outdent' : 'indent');
      }
    });

    // ---- reflect active formatting on buttons ----
    function refreshState() {
      ['bold', 'italic', 'underline'].forEach(cmd => {
        const btn = toolbar.querySelector(`[data-cmd="${cmd}"]`);
        if (!btn) return;
        let on = false;
        try { on = document.queryCommandState(cmd); } catch (_) {}
        btn.classList.toggle('is-on', on);
      });
    }
    area.addEventListener('keyup', refreshState);
    area.addEventListener('mouseup', refreshState);

    return {
      area,
      focus() { area.focus(); },
      getHtml() {
        const html = area.innerHTML.trim();
        // treat an empty editor as truly empty
        if (html === '<p><br></p>' || html === '<br>' || html === '') return '';
        return html;
      },
      setHtml(h) { area.innerHTML = (h && h.trim()) ? h : '<p><br></p>'; }
    };
  }

  // Convert a built-in poem's line array into editable HTML.
  // Blank line ("") = stanza break -> new paragraph.
  function linesToHtml(lines) {
    if (!lines || !lines.length) return '';
    const stanzas = [];
    let cur = [];
    lines.forEach(l => {
      if (String(l).trim() === '') { if (cur.length) { stanzas.push(cur); cur = []; } }
      else cur.push(l);
    });
    if (cur.length) stanzas.push(cur);
    return stanzas.map(s => '<p>' + s.map(esc).join('<br>') + '</p>').join('');
  }

  window.PIMRichText = { create, linesToHtml };
})();
