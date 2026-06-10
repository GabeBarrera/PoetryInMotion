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
      { cmd: 'justifyLeft',   label: '←', title: 'Align left' },
      { cmd: 'justifyCenter', label: '↔', title: 'Align center' },
      { cmd: 'justifyRight',  label: '→', title: 'Align right' }
    ],
    [
      { cmd: 'outdent', label: '⇥', title: 'Outdent' },
      { cmd: 'indent',  label: '⇥',  title: 'Indent' }
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
      </div>
      <div class="rt-area" contenteditable="true" spellcheck="true"></div>`;

    const toolbar = mount.querySelector('.rt-toolbar');
    const area = mount.querySelector('.rt-area');

    area.innerHTML = (initialHtml && initialHtml.trim()) ? initialHtml : '<p><br></p>';

    // inline styles for align so they survive serialization
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
