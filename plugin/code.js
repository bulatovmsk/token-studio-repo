figma.skipInvisibleInstanceChildren = false;

figma.showUI(__html__, { width: 300, height: 380, themeColors: false });

const THEMES = ['Main', 'Meta', 'Kids'];

function isThemeCollection(collection) {
  return THEMES.every((theme) => collection.modes.some((mode) => mode.name === theme));
}

const varCache = new Map();
const colCache = new Map();

async function getTargetRoots() {
  await figma.currentPage.loadAsync();
  const sel = figma.currentPage.selection;
  if (sel && sel.length > 0) return sel.slice();
  return figma.currentPage.children.slice();
}

function canSetExplicitMode(node) {
  return typeof node.setExplicitVariableModeForCollection === 'function';
}

function walk(node, visitor) {
  visitor(node);
  if ('children' in node) {
    for (const c of node.children) walk(c, visitor);
  }
}

function addAliasesFromBoundVariables(value, out) {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'VARIABLE_ALIAS' && value.id) {
    out.add(value.id);
    return;
  }
  for (const item of Object.values(value)) addAliasesFromBoundVariables(item, out);
}

function collectVariableIdsOnNode(node, out) {
  try { addAliasesFromBoundVariables(node.boundVariables, out); } catch (e) {}
  if (node.type === 'TEXT') {
    try {
      for (const segment of node.getStyledTextSegments(['boundVariables', 'fills'])) {
        addAliasesFromBoundVariables(segment.boundVariables, out);
        addAliasesFromBoundVariables(segment.fills, out);
      }
    } catch (e) { console.log('[theme-switcher] text scan failed', node.id, String(e)); }
  }

  for (const field of ['fills', 'strokes']) {
    let arr;
    try { arr = node[field]; } catch (e) { continue; }
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (p) {
        try { addAliasesFromBoundVariables(p.boundVariables, out); } catch (e) {}
      }
    }
  }

  let effects;
  try { effects = node.effects; } catch (e) {}
  if (Array.isArray(effects)) {
    for (const ef of effects) {
      if (ef) {
        try { addAliasesFromBoundVariables(ef.boundVariables, out); } catch (e) {}
      }
    }
  }

  let grids;
  try { grids = node.layoutGrids; } catch (e) {}
  if (Array.isArray(grids)) {
    for (const g of grids) {
      if (g) {
        try { addAliasesFromBoundVariables(g.boundVariables, out); } catch (e) {}
      }
    }
  }

}

function collectExplicitCollectionIds(node, out) {
  let emv;
  try { emv = node.explicitVariableModes; } catch (e) { return; }
  if (!emv || typeof emv !== 'object') return;
  for (const colId of Object.keys(emv)) out.add(colId);
}

async function resolveVariables(ids) {
  const need = [];
  for (const id of ids) if (!varCache.has(id)) need.push(id);
  if (need.length) {
    const fetched = await Promise.all(
      need.map((id) => figma.variables.getVariableByIdAsync(id).catch(() => null))
    );
    fetched.forEach((v, i) => varCache.set(need[i], v));
  }
  const out = [];
  for (const id of ids) {
    const v = varCache.get(id);
    if (v) out.push(v);
  }
  return out;
}

async function resolveCollections(ids) {
  const need = [];
  for (const id of ids) if (!colCache.has(id)) need.push(id);
  if (need.length) {
    const fetched = await Promise.all(
      need.map((id) => figma.variables.getVariableCollectionByIdAsync(id).catch(() => null))
    );
    fetched.forEach((c, i) => colCache.set(need[i], c));
  }
  const out = [];
  for (const id of ids) {
    const c = colCache.get(id);
    if (c) out.push(c);
  }
  return out;
}

async function collectUsedCollections(roots) {
  varCache.clear();
  colCache.clear();
  const varIds = new Set();
  const explicitColIds = new Set();
  for (const r of roots) walk(r, (n) => {
    collectVariableIdsOnNode(n, varIds);
    collectExplicitCollectionIds(n, explicitColIds);
  });

  const vars = await resolveVariables(varIds);
  const collectionIds = new Set(explicitColIds);
  for (const v of vars) collectionIds.add(v.variableCollectionId);

  const resolved = await resolveCollections(collectionIds);
  const collections = new Map();
  for (const col of resolved) collections.set(col.id, col);

  // Remote snapshots may expose different modes for the same published key.
  const byKey = new Map();
  for (const col of collections.values()) {
    const key = col.key || col.id;
    if (!byKey.has(key)) byKey.set(key, { id: col.id, name: col.name, sources: [], modes: [] });
    const group = byKey.get(key);
    group.sources.push(col);
    for (const mode of col.modes) {
      if (!group.modes.some((m) => m.name === mode.name)) {
        group.modes.push({ ...mode, collection: col });
      }
    }
  }
  return Array.from(byKey.values()).filter(isThemeCollection);
}

function collectNodes(roots, predicate) {
  const out = new Map();
  for (const r of roots) walk(r, (n) => {
    if (predicate(n)) out.set(n.id, n);
  });
  return Array.from(out.values());
}

function getModeTargets(roots) {
  // A selection must not change modes on the page or its siblings.
  return collectNodes(figma.currentPage.selection.length ? roots : [figma.currentPage], canSetExplicitMode);
}

function clearModes(node, collection) {
  const errors = [];
  for (const source of collection.sources) {
    try { node.clearExplicitVariableModeForCollection(source); }
    catch (e) { errors.push({ node: node.id, collection: source.id, message: String(e) }); }
  }
  return errors;
}

async function sendState(forceScan) {
  await figma.currentPage.loadAsync();
  const sel = figma.currentPage.selection;
  const hasSelection = sel && sel.length > 0;
  const scope = hasSelection ? 'selection' : 'page';

  if (!hasSelection && !forceScan) {
    figma.ui.postMessage({
      type: 'state',
      scope,
      rootsCount: 0,
      themes: THEMES,
      collections: [],
      needsScan: true,
    });
    return;
  }

  const roots = hasSelection ? sel.slice() : figma.currentPage.children.slice();
  const collections = await collectUsedCollections(roots);
  figma.ui.postMessage({
    type: 'state',
    scope,
    rootsCount: roots.length,
    themes: THEMES,
    collections: collections.map((c) => ({ id: c.id, name: c.name })),
    needsScan: false,
  });
}

async function warmupCollectionSubscription(col) {
  if (!col || !Array.isArray(col.variableIds) || col.variableIds.length === 0) return;
  try {
    const v = await figma.variables.getVariableByIdAsync(col.variableIds[0]);
    if (v && v.key) {
      await figma.variables.importVariableByKeyAsync(v.key);
    }
  } catch (e) {}
}

function describeNode(n) {
  if (!n) return 'unknown';
  if (n.type === 'PAGE') return 'page';
  return n.type + ':' + (n.name || '?');
}

async function trySetMode(node, col, modeId) {
  try {
    node.setExplicitVariableModeForCollection(col, modeId);
    return { ok: true, warmed: false };
  } catch (e) {
    try {
      await warmupCollectionSubscription(col);
      node.setExplicitVariableModeForCollection(col, modeId);
      return { ok: true, warmed: true };
    } catch (e2) {
      return { ok: false, error: (e2 && e2.message) || String(e2) };
    }
  }
}

function postProgress(stage, current, total, label) {
  figma.ui.postMessage({ type: 'progress', stage, current, total, label });
  return new Promise((r) => setTimeout(r, 0));
}

async function applyTheme(themeName) {
  if (!THEMES.includes(themeName)) return;
  await postProgress('start', 0, 1, 'Сканирую макет…');
  const roots = await getTargetRoots();
  const collections = await collectUsedCollections(roots);
  const page = figma.currentPage;
  if (collections.length === 0) {
    figma.notify('Нет используемых коллекций со всеми режимами Main / Meta / Kids. Проверьте обновления библиотек.', { timeout: 6000 });
    await postProgress('done', 0, 0, '');
    return;
  }
  const targets = getModeTargets(roots);
  let applied = 0;
  const errors = [];
  const total = collections.length * targets.length;
  let current = 0;
  for (const col of collections) {
    const mode = col.modes.find((m) => m.name === themeName);
    for (const node of targets) {
      errors.push(...clearModes(node, col));
      // Each remote snapshot can be referenced by different descendants.
      for (const source of col.sources) {
        const ownMode = source.modes.find((m) => m.name === themeName);
        const result = await trySetMode(node, source, ownMode ? ownMode.modeId : mode.modeId);
        if (result.ok) applied++;
        else errors.push({ node: node.id, collection: source.id, message: result.error });
      }
      current++;
      if (current % 50 === 0) await postProgress('apply', current, total, col.name);
    }
  }
  if (errors.length) console.log('[theme-switcher] apply errors', errors);
  figma.notify(`Тема «${themeName}»: ${applied} назначений на ${targets.length} элементах` +
    (errors.length ? ` • ошибок: ${errors.length}, подробности в консоли` : ''), { timeout: 6000 });
  await postProgress('done', total, total, '');
}

async function resetCollections() {
  await postProgress('start', 0, 1, 'Сканирую макет…');
  const roots = await getTargetRoots();
  const collections = await collectUsedCollections(roots);
  const nodes = getModeTargets(roots);
  const errors = [];
  let current = 0;
  const total = collections.length * nodes.length;
  for (const col of collections) {
    for (const node of nodes) {
      errors.push(...clearModes(node, col));
      current++;
      if (current % 50 === 0) await postProgress('reset', current, total, col.name);
    }
  }
  if (errors.length) console.log('[theme-switcher] reset errors', errors);
  figma.notify(collections.length ? `Сброс тем: ${collections.length} коллекций на ${nodes.length} элементах` +
    (errors.length ? ` • ошибок: ${errors.length}, подробности в консоли` : '') :
    'Не найдено используемых коллекций с темами Main / Meta / Kids', { timeout: 6000 });
  await postProgress('done', total, total, '');
}

async function diagnose() {
  const roots = await getTargetRoots();
  const collections = await collectUsedCollections(roots);

  console.log('[theme-switcher][diag] used collections in macro:', collections.length);
  for (const col of collections.flatMap((group) => group.sources)) {
    let firstVar = null;
    try {
      if (col.variableIds && col.variableIds[0]) {
        firstVar = await figma.variables.getVariableByIdAsync(col.variableIds[0]);
      }
    } catch (e) {}
    console.log(
      '[theme-switcher][diag]',
      col.name,
      '\n  id:', col.id,
      '\n  key:', col.key || 'no-key',
      '\n  remote:', col.remote,
      '\n  libraryName:', col.libraryName || '(n/a)',
      '\n  modes:', col.modes.map((m) => m.modeId + ':' + m.name).join(' | '),
      '\n  variableCount:', (col.variableIds && col.variableIds.length) || 0,
      '\n  firstVar.name:', firstVar ? firstVar.name : '(n/a)',
      '\n  firstVar.key:', firstVar ? firstVar.key : '(n/a)'
    );
  }

  try {
    const libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    console.log('[theme-switcher][diag] teamLibrary collections:', libCols.length);
    for (const lc of libCols) {
      console.log(
        '[theme-switcher][diag][lib]',
        lc.name,
        '| libraryName:', lc.libraryName,
        '| key:', lc.key
      );
    }
  } catch (e) {
    console.log('[theme-switcher][diag] teamLibrary error:', (e && e.message) || e);
  }

  figma.notify('Диагностика: смотрите вывод в консоли (Plugins → Development → Open Console)', { timeout: 4000 });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'refresh') {
    await sendState();
  } else if (msg.type === 'scanPage') {
    await sendState(true);
  } else if (msg.type === 'apply' && msg.themeName) {
    await applyTheme(msg.themeName);
    await sendState(true);
  } else if (msg.type === 'reset') {
    await resetCollections();
    await sendState(true);
  } else if (msg.type === 'diagnose') {
    await diagnose();
  } else if (msg.type === 'close') {
    figma.closePlugin();
  }
};

let selectionDebounce = null;
figma.on('selectionchange', () => {
  clearTimeout(selectionDebounce);
  selectionDebounce = setTimeout(() => { sendState(); }, 250);
});

sendState();
