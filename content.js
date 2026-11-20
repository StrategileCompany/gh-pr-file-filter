// GitHub PR File Filter
// Nas telas de diff do GitHub que têm árvore de arquivos lateral, clicar num
// item da árvore mostra somente os diffs daquele arquivo ou daquela pasta.
//
// Páginas suportadas (experiência nova, React):
//   - PR:     /owner/repo/pull/N/changes (e /files, /commits/<sha>)
//   - Commit: /owner/repo/commit/<sha>
//
// Estrutura do DOM:
//   árvore: [role=tree] [role=treeitem]  id = caminho ("docs/app.js");
//           folhas não têm aria-expanded; cada item tem <a href="...#diff-<hash>">
//   diffs:  div[role=region], um por arquivo, envolvido por um wrapper (o pai).
//           No PR o region tem id="diff-<hash>"; no commit não tem id, então o
//           arquivo é identificado pelo caminho: [data-file-path] dentro do
//           region ou o texto do cabeçalho (aria-labelledby).
//
// O filtro marca o wrapper com data-ghpff-hidden e um <style> o esconde. Um
// MutationObserver reaplica a marcação quando o React redesenha ou carrega
// mais diffs (a lista é virtualizada/carregada aos poucos).

(() => {
  if (window.__ghPrFileFilter) return;
  window.__ghPrFileFilter = true;

  const STYLE_ID = 'gh-pr-file-filter-style';
  const BAR_ID = 'gh-pr-file-filter-bar';
  const HIDDEN_ATTR = 'data-ghpff-hidden';
  const REGIONS = 'div[role="region"][id^="diff-"], #diff-content-parent div[role="region"]';
  const LEAF = '[role="tree"] [role="treeitem"]:not([aria-expanded])';

  // { path, isFolder, paths:Set, hashes:Set, pathname }
  let active = null;

  const isChangesPage = () =>
    /\/pull\/\d+\/(changes|files|commits)|\/commit\/[0-9a-f]{7,40}/.test(location.pathname);

  const hashOf = (treeItem) => {
    const href = treeItem.querySelector('a[href*="#diff-"]')?.getAttribute('href') || '';
    return href.split('#')[1] || null;
  };

  // Arquivos selecionados: o próprio item, ou todas as folhas sob a pasta.
  // Para pastas usa o prefixo do caminho, porque pastas recolhidas podem não
  // ter os filhos renderizados dentro delas.
  function leavesFor(treeItem) {
    if (!treeItem.hasAttribute('aria-expanded')) return [treeItem];
    const prefix = treeItem.id + '/';
    const byPrefix = [...document.querySelectorAll(LEAF)].filter((l) => l.id.startsWith(prefix));
    return byPrefix.length
      ? byPrefix
      : [...treeItem.querySelectorAll('[role="treeitem"]:not([aria-expanded])')];
  }

  // Caminho do arquivo de um diff. Em renomeações o cabeçalho traz
  // "antigo novo"; o caminho novo (o da árvore) é o último.
  function pathOf(region) {
    const fp = region.querySelector('[data-file-path]')?.dataset.filePath;
    if (fp) return fp;
    const label = document.getElementById(region.getAttribute('aria-labelledby') || '');
    const txt = (label?.textContent || region.getAttribute('aria-label') || '')
      .replace(/[‎‏]/g, ' ')
      .trim();
    return txt.split(/\s+/).pop() || null;
  }

  const matches = (region) =>
    active.hashes.has(region.id) || active.paths.has(pathOf(region));

  function applyFilter() {
    for (const region of document.querySelectorAll(REGIONS)) {
      const wrapper = region.parentElement;
      if (!wrapper) continue;
      const hide = !!active && !matches(region);
      if (hide !== wrapper.hasAttribute(HIDDEN_ATTR)) wrapper.toggleAttribute(HIDDEN_ATTR, hide);
    }
  }

  function render() {
    let style = document.getElementById(STYLE_ID);
    if (!active) {
      style?.remove();
      document.getElementById(BAR_ID)?.remove();
      applyFilter();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      [${HIDDEN_ATTR}] { display: none !important; }
      [role="treeitem"]#${CSS.escape(active.path)} > div:first-child {
        box-shadow: inset 3px 0 0 var(--fgColor-accent, #0969da);
        background: var(--bgColor-accent-muted, rgba(84,174,255,.2));
      }`;
    applyFilter();
    renderBar();
  }

  function renderBar() {
    let bar = document.getElementById(BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.style.cssText = [
        'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:9999', 'display:flex', 'gap:12px', 'align-items:center',
        'padding:8px 12px', 'border-radius:8px', 'font-size:13px',
        'background:var(--bgColor-emphasis, #24292f)', 'color:var(--fgColor-onEmphasis, #fff)',
        'box-shadow:0 4px 16px rgba(0,0,0,.25)',
      ].join(';');
      const label = document.createElement('span');
      const btn = document.createElement('button');
      btn.textContent = 'Mostrar todos (Esc)';
      btn.style.cssText = 'all:unset;cursor:pointer;text-decoration:underline;opacity:.9';
      btn.addEventListener('click', clear);
      bar.append(label, btn);
      document.body.appendChild(bar);
    }
    const n = active.paths.size;
    bar.firstChild.textContent =
      `${active.isFolder ? '📁' : '📄'} ${active.path}` +
      (active.isFolder ? ` — ${n} arquivo${n === 1 ? '' : 's'}` : '');
  }

  function clear() {
    active = null;
    render();
  }

  function scrollToFirst() {
    const first = [...document.querySelectorAll(REGIONS)].find(
      (r) => r.parentElement && !r.parentElement.hasAttribute(HIDDEN_ATTR)
    );
    first?.parentElement.scrollIntoView({ block: 'start' });
  }

  const lastClick = { item: null, at: 0 };

  document.addEventListener(
    'click',
    (e) => {
      if (!isChangesPage()) return;
      // Ignora cliques com modificador (abrir em nova aba etc.)
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      // closest() pega o item mais interno: clique num arquivo dentro de uma pasta é o arquivo
      const item = e.target.closest('[role="tree"] [role="treeitem"]');
      if (!item) return;
      // Na página de commit o GitHub repassa o clique do item para o link
      // interno, gerando dois eventos seguidos; o segundo é ignorado.
      const now = performance.now();
      if (lastClick.item === item && now - lastClick.at < 400) return;
      lastClick.item = item;
      lastClick.at = now;
      const leaves = leavesFor(item);
      if (!leaves.length) return;
      // Segundo clique no mesmo item desliga o filtro
      if (active && active.path === item.id) {
        clear();
        return;
      }
      active = {
        path: item.id,
        isFolder: item.hasAttribute('aria-expanded'),
        paths: new Set(leaves.map((l) => l.id)),
        hashes: new Set(leaves.map(hashOf).filter(Boolean)),
        pathname: location.pathname,
      };
      render();
      // Deixa o GitHub fazer seu scroll/expand e depois alinha no 1º diff visível
      setTimeout(scrollToFirst, 50);
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !active) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    clear();
  });

  // ---- Expansão automática das linhas de contexto ----
  // Opção salva em chrome.storage.sync (popup da extensão):
  //   expandMode = 'collapsed' (padrão do GitHub: só os hunks) | 'expanded' (arquivo inteiro)
  // Usa o botão nativo do cabeçalho de cada arquivo:
  //   button[data-file-path][aria-label="Expand all lines: <path>"]  ↔  "Collapse non-diff lines: <path>"
  const EXPAND_BTN = 'button[data-file-path][aria-label^="Expand all lines"]';
  const COLLAPSE_BTN = 'button[data-file-path][aria-label^="Collapse non-diff lines"]';

  let expandMode = 'collapsed';
  // Arquivos que a extensão já expandiu nesta página. Cada um é expandido uma
  // vez só, para respeitar quem recolher manualmente depois.
  const expandedPaths = new Set();
  let expandTimer = null;

  function scheduleExpand() {
    if (expandMode !== 'expanded' || !isChangesPage() || expandTimer) return;
    expandTimer = setTimeout(() => {
      expandTimer = null;
      expandPending();
    }, 200);
  }

  function expandPending() {
    if (expandMode !== 'expanded' || !isChangesPage()) return;
    for (const btn of document.querySelectorAll(EXPAND_BTN)) {
      const path = btn.dataset.filePath;
      if (expandedPaths.has(path)) continue;
      expandedPaths.add(path);
      btn.click();
    }
  }

  // Voltou para "colapsado": recolhe o que a extensão tinha expandido.
  function collapseExpanded() {
    for (const btn of document.querySelectorAll(COLLAPSE_BTN)) {
      if (expandedPaths.has(btn.dataset.filePath)) btn.click();
    }
    expandedPaths.clear();
  }

  if (globalThis.chrome?.storage?.sync) {
    chrome.storage.sync.get({ expandMode: 'collapsed' }, (v) => {
      expandMode = v.expandMode;
      scheduleExpand();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.expandMode) return;
      expandMode = changes.expandMode.newValue;
      if (expandMode === 'expanded') scheduleExpand();
      else collapseExpanded();
    });
  }

  // Navegação SPA: limpa o filtro ao sair da página e reaplica filtro e
  // expansão aos diffs que vão sendo carregados (o GitHub carrega aos poucos).
  let lastPath = location.pathname;
  let filterFrame = 0;
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      expandedPaths.clear();
      if (active && active.pathname !== lastPath) clear();
    }
    if (active && !filterFrame) {
      filterFrame = requestAnimationFrame(() => {
        filterFrame = 0;
        if (active) applyFilter();
      });
    }
    scheduleExpand();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
