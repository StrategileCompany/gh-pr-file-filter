// GitHub PR File Filter
// Na tela "Files changed" (rota /pull/N/changes), clicar num item da árvore
// mostra somente os diffs daquele arquivo ou dos arquivos daquela pasta.
//
// Estrutura do DOM (experiência nova, React):
//   árvore:  [role=treeitem]  id = caminho ("docs/app.js"); folhas não têm aria-expanded;
//            cada item tem um <a href="...#diff-<hash>">
//   diffs:   div[role=region][id="diff-<hash>"], filho de um wrapper "diffEntry__*"
//
// O filtro é aplicado via <style> (não via estilo inline), para sobreviver
// aos re-renders do React e à virtualização da lista de diffs.

(() => {
  if (window.__ghPrFileFilter) return;
  window.__ghPrFileFilter = true;

  const STYLE_ID = 'gh-pr-file-filter-style';
  const BAR_ID = 'gh-pr-file-filter-bar';
  const ENTRY = '[class*="diffEntry"]';
  const REGION = 'div[role="region"][id^="diff-"]';

  let active = null; // { path, isFolder, hashes, pathname }

  const isChangesPage = () => /\/pull\/\d+\/(changes|files)/.test(location.pathname);

  const hashOf = (treeItem) => {
    const href = treeItem.querySelector('a[href*="#diff-"]')?.getAttribute('href') || '';
    return href.split('#')[1] || null;
  };

  // Folhas (arquivos) sob um item da árvore; o próprio item se for arquivo.
  const leavesOf = (treeItem) =>
    treeItem.hasAttribute('aria-expanded')
      ? [...treeItem.querySelectorAll('[role="treeitem"]:not([aria-expanded])')]
      : [treeItem];

  // Para pastas, usa o caminho em vez do DOM: pastas recolhidas podem não ter
  // os filhos renderizados. Coleta todas as folhas cujo id começa com "pasta/".
  const hashesFor = (treeItem) => {
    const isFolder = treeItem.hasAttribute('aria-expanded');
    let leaves;
    if (isFolder) {
      const prefix = treeItem.id + '/';
      leaves = [...document.querySelectorAll('[role="treeitem"]:not([aria-expanded])')]
        .filter((l) => l.id.startsWith(prefix));
      if (!leaves.length) leaves = leavesOf(treeItem);
    } else {
      leaves = [treeItem];
    }
    return leaves.map(hashOf).filter(Boolean);
  };

  function render() {
    let style = document.getElementById(STYLE_ID);
    if (!active) {
      style?.remove();
      document.getElementById(BAR_ID)?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    const keep = active.hashes.map((h) => `:not(:has(> #${CSS.escape(h)}))`).join('');
    const sel = CSS.escape(active.path);
    style.textContent = `
      ${ENTRY}:has(> ${REGION})${keep} { display: none !important; }
      [role="treeitem"]#${sel} > div:first-child {
        box-shadow: inset 3px 0 0 var(--fgColor-accent, #0969da);
        background: var(--bgColor-accent-muted, rgba(84,174,255,.2));
      }`;
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
      btn.style.cssText =
        'all:unset;cursor:pointer;text-decoration:underline;opacity:.9';
      btn.addEventListener('click', clear);
      bar.append(label, btn);
      document.body.appendChild(bar);
    }
    const n = active.hashes.length;
    bar.firstChild.textContent =
      `${active.isFolder ? '📁' : '📄'} ${active.path}` +
      (active.isFolder ? ` — ${n} arquivo${n === 1 ? '' : 's'}` : '');
  }

  function clear() {
    active = null;
    render();
  }

  function scrollToFirst() {
    const first = document.getElementById(active?.hashes[0]);
    first?.closest(ENTRY)?.scrollIntoView({ block: 'start' });
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!isChangesPage()) return;
      // Ignora cliques com modificador (abrir em nova aba etc.)
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const item = e.target.closest('[role="tree"] [role="treeitem"]');
      if (!item) return;
      // closest() pega o item mais interno: clique num arquivo dentro de uma pasta é o arquivo
      const hashes = hashesFor(item);
      if (!hashes.length) return;
      // Segundo clique no mesmo item desliga o filtro
      if (active && active.path === item.id) {
        clear();
        return;
      }
      active = {
        path: item.id,
        isFolder: item.hasAttribute('aria-expanded'),
        hashes,
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

  // Navegação SPA: limpa o filtro ao sair da página/PR.
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

  // Navegação SPA: limpa o filtro ao sair da página/PR e reaplica a expansão
  // aos diffs que vão sendo carregados (o GitHub carrega aos poucos).
  let lastPath = location.pathname;
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      expandedPaths.clear();
      if (active && active.pathname !== lastPath) clear();
    }
    scheduleExpand();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
