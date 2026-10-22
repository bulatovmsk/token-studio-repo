figma.showUI(__html__, { width: 660, height: 760, themeColors: true });
figma.skipInvisibleInstanceChildren = false;

let busy = false;
let audit = null;
let nextAuditId = 1;
let detachPlan = null;
let nextPlanId = 1;
let rebindPlan = null;
let nextRebindPlanId = 1;

function report(type, data = {}) {
  figma.ui.postMessage({ type, ...data });
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function scopeKey(scope) {
  const page = figma.currentPage;
  return JSON.stringify([page.id, scope,
    scope === 'selection' ? page.selection.map((node) => node.id).sort() : []]);
}

function invalidate(message = 'Область изменилась. Выполните проверку заново.') {
  audit = null;
  detachPlan = null;
  rebindPlan = null;
  report('invalidated', { message });
}

// Traverse only the chosen roots; the same node can be selected with its parent.
function collectAssignments(roots) {
  const entries = [];
  const nodes = [];
  const warnings = [];
  const visited = new Set();
  const stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop();
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    nodes.push(node);
    try {
      for (const [collectionId, modeId] of Object.entries(node.explicitVariableModes || {})) {
        entries.push({ node, collectionId, modeId });
      }
    } catch (error) {
      warnings.push(`${node.name || node.id}: не удалось прочитать назначения — ${errorMessage(error)}`);
    }
    try {
      if ('children' in node) {
        const children = node.children;
        for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
      }
    } catch (error) {
      warnings.push(`${node.name || node.id}: не удалось проверить вложенные слои — ${errorMessage(error)}`);
    }
  }
  return { entries, nodes, warnings, nodeCount: visited.size };
}

// Read plain binding data, never traverse arbitrary Figma node objects.
function visitAliases(value, visit, path = '') {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'VARIABLE_ALIAS' && typeof value.id === 'string') {
    visit(value.id, path);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitAliases(child, visit, path ? `${path}.${key}` : key);
  }
}

async function diagnoseBindings(nodes, explicitEntries, warnings) {
  const direct = new Map();
  const variableCache = new Map();
  const collectionCache = new Map();
  const styleCache = new Map();
  const records = new Map();
  const collections = new Map();
  const read = (item, field) => {
    try { return field in item ? item[field] : undefined; }
    catch (error) {
      warnings.push(`${item.name || item.id}, ${field}: ${errorMessage(error)}`);
      return undefined;
    }
  };
  const cached = async (cache, id, getter, label) => {
    if (!cache.has(id)) {
      cache.set(id, Promise.resolve().then(() => getter(id)).catch((error) => {
        warnings.push(`${label} ${id}: ${errorMessage(error)}`);
        return null;
      }));
    }
    return cache.get(id);
  };
  const getCollection = (id) => cached(collectionCache, id,
    (key) => figma.variables.getVariableCollectionByIdAsync(key), 'Коллекция');
  const getVariable = (id) => cached(variableCache, id,
    (key) => figma.variables.getVariableByIdAsync(key), 'Переменная');
  const registerCollection = async (id) => {
    if (!collections.has(id)) {
      const c = await getCollection(id);
      collections.set(id, {
        id, key: c ? c.key : null, name: c ? c.name : 'Недоступная коллекция',
        available: !!c, remote: c ? c.remote : null,
        modes: c ? c.modes.map((m) => ({ id: m.modeId, name: m.name })) : [],
        variables: [], assignments: [],
      });
    }
    return collections.get(id);
  };
  const nodePath = (node) => {
    const names = [];
    let parent = node;
    while (parent && parent.type !== 'DOCUMENT') {
      names.unshift(parent.name || parent.id);
      if (parent.type === 'PAGE') break;
      parent = parent.parent;
    }
    return names.join(' / ');
  };
  const add = (id, node, property, via = '') => {
    // boundVariables and paints may expose the same binding twice. Count one
    // variable/layer/property relation, retaining the style provenance if any.
    const key = JSON.stringify([id, node.id, property, via]);
    if (!direct.has(key)) direct.set(key, {
      variableId: id, nodeId: node.id, nodeName: node.name || node.id,
      path: nodePath(node), property, via,
    });
  };
  const scanObject = (item, node, via = '') => {
    visitAliases(read(item, 'boundVariables'), (id, path) => add(id, node, path.split('.')[0], via));
    for (const field of ['fills', 'strokes', 'backgrounds', 'paints', 'effects', 'layoutGrids']) {
      visitAliases(read(item, field), (id) => add(id, node, field, via));
    }
    // componentProperties can throw on damaged instances; node.boundVariables
    // already contains instance property bindings. Definitions require narrowing.
    if (item.type === 'COMPONENT_SET' ||
        (item.type === 'COMPONENT' && (!item.parent || item.parent.type !== 'COMPONENT_SET'))) {
      visitAliases(read(item, 'componentPropertyDefinitions'),
        (id, path) => add(id, node, `componentPropertyDefinitions.${path}`, via));
    }
  };
  for (const node of nodes) {
    scanObject(node, node);
    const styleIds = new Set();
    for (const field of ['fillStyleId', 'strokeStyleId', 'effectStyleId', 'gridStyleId', 'textStyleId']) {
      const id = read(node, field);
      if (typeof id === 'string' && id) styleIds.add(id);
    }
    if ((node.type === 'TEXT' || node.type === 'TEXT_PATH') && typeof node.getStyledTextSegments === 'function') {
      try {
        for (const segment of node.getStyledTextSegments(['fills', 'boundVariables', 'textStyleId', 'fillStyleId'])) {
          visitAliases(segment.boundVariables, (id, path) => add(id, node, path.split('.')[0]));
          visitAliases(segment.fills, (id) => add(id, node, 'textRangeFills'));
          for (const id of [segment.textStyleId, segment.fillStyleId]) {
            if (typeof id === 'string' && id) styleIds.add(id);
          }
        }
      } catch (error) {
        warnings.push(`${node.name || node.id}, текстовые диапазоны: ${errorMessage(error)}`);
      }
    }
    for (const id of styleIds) {
      const style = await cached(styleCache, id, (key) => figma.getStyleByIdAsync(key), 'Стиль');
      if (style) scanObject(style, node, `Стиль «${style.name}»`);
      else warnings.push(`${node.name || node.id}: стиль ${id} недоступен; его привязки не проверены.`);
    }
  }
  // Follow references between variables as well: a local component token may
  // hold a reference to an old remote collection in one of its modes.
  for (const source of direct.values()) {
    const stack = [{ id: source.variableId, via: source.via, chain: [] }];
    const reached = new Set();
    while (stack.length) {
      const entry = stack.pop();
      if (entry.chain.includes(entry.id)) {
        warnings.push(`Циклическая ссылка переменных у ${source.nodeName}: ${entry.id}`);
        continue;
      }
      if (reached.has(entry.id)) continue;
      reached.add(entry.id);
      if (entry.chain.length >= 64) {
        warnings.push(`Цепочка переменных у ${source.nodeName} длиннее 64: проверка неполная.`);
        continue;
      }
      const variable = await getVariable(entry.id);
      if (!records.has(entry.id)) {
        const record = {
          id: entry.id, key: variable ? variable.key : null,
          name: variable ? variable.name : 'Недоступная переменная', available: !!variable,
          collectionId: variable ? variable.variableCollectionId : null, uses: [],
        };
        records.set(entry.id, record);
        if (variable) (await registerCollection(variable.variableCollectionId)).variables.push(record);
      }
      records.get(entry.id).uses.push({ ...source, via: entry.via });
      if (variable) {
        const owner = await registerCollection(variable.variableCollectionId);
        for (const [mode, value] of Object.entries(variable.valuesByMode)) {
          const modeName = (owner.modes.find((item) => item.id === mode) || {}).name || mode;
          visitAliases(value, (id) => stack.push({ id,
            via: [entry.via, `«${variable.name}», режим ${modeName}`].filter(Boolean).join(' → '),
            chain: [...entry.chain, entry.id],
          }));
        }
      }
    }
  }
  for (const entry of explicitEntries) {
    (await registerCollection(entry.collectionId)).assignments.push({
      nodeId: entry.node.id, nodeName: entry.node.name || entry.node.id,
      path: nodePath(entry.node), modeId: entry.modeId,
    });
  }
  const families = new Map();
  for (const collection of collections.values()) {
    // Names are not identities; unrelated collections can share a name.
    const key = collection.key || collection.id;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(collection);
  }
  const groups = [...families].map(([key, versions]) => {
    return { key, name: versions[0].name, conflict: versions.length > 1, versions };
  }).sort((a, b) => Number(b.conflict) - Number(a.conflict) || a.name.localeCompare(b.name));
  return {
    bindingCount: direct.size, variableCount: records.size, groups,
    conflicts: groups.filter((group) => group.conflict).length,
    unavailableVariables: [...records.values()].filter((v) => !v.available),
  };
}

async function inspect(scope) {
  audit = null;
  detachPlan = null;
  rebindPlan = null;
  report('invalidated', { message: 'Проверяю назначения и ссылки на коллекции…' });
  if (scope !== 'selection' && scope !== 'page') throw new Error('Выберите выделение или текущую страницу.');
  const key = scopeKey(scope);
  const page = figma.currentPage;
  const roots = scope === 'selection' ? [...page.selection] : [page];
  if (!roots.length) throw new Error('Выделите компоненты или фреймы либо выберите «Текущая страница».');
  if (scope === 'page') await page.loadAsync();
  const result = collectAssignments(roots);
  const diagnostics = await diagnoseBindings(result.nodes, result.entries, result.warnings);
  const groups = new Map();
  for (const entry of result.entries) {
    if (!groups.has(entry.collectionId)) groups.set(entry.collectionId, new Map());
    const modes = groups.get(entry.collectionId);
    modes.set(entry.modeId, (modes.get(entry.modeId) || 0) + 1);
  }
  const collections = await Promise.all([...groups].map(async ([id, modes]) => {
    let collection = null;
    try {
      collection = await figma.variables.getVariableCollectionByIdAsync(id);
    } catch (error) {
      result.warnings.push(`Коллекция ${id}: ${errorMessage(error)}`);
    }
    return {
      id, name: collection ? collection.name : `Недоступная коллекция (${id})`,
      available: !!collection,
      modes: [...modes].map(([modeId, uses]) => {
        const mode = collection && collection.modes.find((item) => item.modeId === modeId);
        return { id: modeId, name: mode ? mode.name : modeId, uses };
      }),
    };
  }));
  if (scopeKey(scope) !== key) throw new Error('Выделение или страница изменились во время проверки. Повторите проверку.');
  audit = { id: nextAuditId++, scope, key, entries: result.entries, collections, diagnostics, warnings: [...new Set(result.warnings)],
    nodes: new Map(result.nodes.map((node) => [node.id, node])) };
  report('inventory', {
    auditId: audit.id, scope, nodeCount: result.nodeCount,
    assignmentCount: result.entries.length, warnings: [...new Set(result.warnings)], diagnostics,
    collections: collections.sort((a, b) => a.name.localeCompare(b.name)),
  });
}

function inAuditScope(node, current) {
  if (node.removed || scopeKey(current.scope) !== current.key) return false;
  const roots = new Set(current.scope === 'selection'
    ? figma.currentPage.selection.map((item) => item.id) : [figma.currentPage.id]);
  let parent = node;
  while (parent && !roots.has(parent.id)) parent = parent.parent;
  return !!parent;
}

const snapshotValue = (value) => JSON.parse(JSON.stringify(value));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function prepareRebind(sourceId, targetId, auditId) {
  const current = audit;
  rebindPlan = null;
  if (!current || current.id !== auditId || scopeKey(current.scope) !== current.key) {
    throw new Error('Сначала проверьте выбранную область.');
  }
  const group = current.diagnostics.groups.find((item) =>
    item.versions.some((version) => version.id === sourceId) &&
    item.versions.some((version) => version.id === targetId));
  if (!group || !group.conflict || sourceId === targetId) {
    throw new Error('Выберите две разные версии одной коллекции из отчёта.');
  }
  const sourceVersion = group.versions.find((version) => version.id === sourceId);
  const targetVersion = group.versions.find((version) => version.id === targetId);
  const sourceCollection = await figma.variables.getVariableCollectionByIdAsync(sourceId);
  const targetCollection = await figma.variables.getVariableCollectionByIdAsync(targetId);
  if (!sourceCollection || !targetCollection) throw new Error('Одна из коллекций недоступна. Используйте отвязку.');
  for (const entry of current.entries.filter((item) => item.collectionId === sourceId)) {
    const oldMode = sourceCollection.modes.find((mode) => mode.modeId === entry.modeId);
    const mapped = targetCollection.modes.filter((mode) => oldMode && mode.name === oldMode.name);
    if (mapped.length !== 1) {
      throw new Error(`У слоя «${entry.node.name}» режим ${oldMode ? `«${oldMode.name}»` : entry.modeId} не имеет однозначного соответствия. Перепривязка остановлена.`);
    }
    const existing = (entry.node.explicitVariableModes || {})[targetId];
    if (existing && existing !== mapped[0].modeId) {
      throw new Error(`У слоя «${entry.node.name}» уже назначен другой режим актуальной коллекции. Перепривязка остановлена.`);
    }
  }
  const issues = [];
  const candidates = [];
  for (const id of targetCollection.variableIds || []) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (variable && variable.variableCollectionId === targetId) candidates.push(variable);
    } catch (error) { issues.push(`Целевая переменная ${id}: ${errorMessage(error)}`); }
  }
  const replacements = new Map();
  const matches = [];
  for (const record of sourceVersion.variables) {
    try {
      const oldVariable = await figma.variables.getVariableByIdAsync(record.id);
      if (!oldVariable) { issues.push(`${record.name}: исходная переменная недоступна.`); continue; }
      let found = candidates.filter((item) => item.key && item.key === oldVariable.key && item.resolvedType === oldVariable.resolvedType);
      if (!found.length) found = candidates.filter((item) => item.name === oldVariable.name && item.resolvedType === oldVariable.resolvedType);
      if (found.length !== 1) {
        issues.push(`${oldVariable.name}: ${found.length ? 'несколько совпадений' : 'нет совпадения'} по имени и типу.`);
        continue;
      }
      replacements.set(record.id, found[0]);
      matches.push({ from: oldVariable.name, to: found[0].name, fromId: record.id, toId: found[0].id });
    } catch (error) { issues.push(`${record.name}: ${errorMessage(error)}`); }
  }
  const oldIds = new Set(sourceVersion.variables.map((variable) => variable.id));
  const aliasFor = (variable) => figma.variables.createVariableAlias(variable);
  const actions = [];
  const add = (node, label, before, read, write) => actions.push({
    node, label, before: snapshotValue(before), read, write,
  });
  const replaceAliases = (value) => {
    if (!value || typeof value !== 'object') return { value, changed: false };
    if (value.type === 'VARIABLE_ALIAS') {
      const replacement = replacements.get(value.id);
      return { value: replacement ? aliasFor(replacement) : value, changed: !!replacement };
    }
    let copy = Array.isArray(value) ? [] : { ...value };
    let changed = false;
    for (const [key, child] of Object.entries(value)) {
      const result = replaceAliases(child);
      copy[key] = result.value;
      changed = changed || result.changed;
    }
    if (value.boundVariables && !Array.isArray(value)) {
      for (const [field, alias] of Object.entries(value.boundVariables)) {
        const replacement = alias && replacements.get(alias.id);
        if (!replacement) continue;
        if (value.type === 'SOLID' && field === 'color') {
          copy = figma.variables.setBoundVariableForPaint(copy, field, replacement);
        } else if (['DROP_SHADOW', 'INNER_SHADOW', 'LAYER_BLUR', 'BACKGROUND_BLUR', 'NOISE', 'TEXTURE', 'GLASS', 'SHADER'].includes(value.type)) {
          copy = figma.variables.setBoundVariableForEffect(copy, field, replacement);
        } else if (['GRID', 'ROWS', 'COLUMNS'].includes(value.pattern)) {
          copy = figma.variables.setBoundVariableForLayoutGrid(copy, field, replacement);
        }
      }
    }
    return { value: copy, changed };
  };
  for (const node of current.nodes.values()) {
    if (!inAuditScope(node, current)) { issues.push(`Слой ${node.id} перемещён или удалён.`); continue; }
    try {
      const bindings = node.boundVariables || {};
      for (const [field, alias] of Object.entries(bindings)) {
        if (field === 'componentProperties' || ['fills', 'strokes', 'backgrounds', 'effects', 'layoutGrids', 'textRangeFills'].includes(field)) continue;
        if (node.type === 'TEXT' || node.type === 'TEXT_PATH') {
          if (['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent'].includes(field)) continue;
        }
        const replacement = alias && replacements.get(alias.id);
        if (!replacement) continue;
        add(node, field, alias, () => (node.boundVariables || {})[field],
          () => node.setBoundVariable(field, replacement));
      }
      for (const [name, alias] of Object.entries(bindings.componentProperties || {})) {
        const replacement = alias && replacements.get(alias.id);
        if (!replacement) continue;
        try {
          const before = node.componentProperties[name];
          add(node, `свойство ${name}`, before, () => node.componentProperties[name],
            () => node.setProperties({ [name]: aliasFor(replacement) }));
        } catch (error) { issues.push(`${node.name}, свойство ${name}: ${errorMessage(error)}`); }
      }
    } catch (error) { issues.push(`${node.name}, свойства слоя: ${errorMessage(error)}`); }
    for (const field of ['fills', 'strokes', 'backgrounds', 'effects', 'layoutGrids']) {
      if (!(field in node) || ((node.type === 'TEXT' || node.type === 'TEXT_PATH') && field === 'fills')) continue;
      try {
        const before = node[field];
        if (!Array.isArray(before)) continue;
        const after = replaceAliases(before);
        if (!after.changed) continue;
        const styleInfo = {
          fills: ['fillStyleId', 'setFillStyleIdAsync'], strokes: ['strokeStyleId', 'setStrokeStyleIdAsync'],
          effects: ['effectStyleId', 'setEffectStyleIdAsync'], layoutGrids: ['gridStyleId', 'setGridStyleIdAsync'],
        }[field];
        const styleId = styleInfo && node[styleInfo[0]];
        add(node, field, { value: before, styleId: styleId || null },
          () => ({ value: node[field], styleId: (styleInfo && node[styleInfo[0]]) || null }),
          async () => {
            if (styleId) {
              if (typeof node[styleInfo[1]] !== 'function') throw new Error('Нельзя снять связь со стилем.');
              await node[styleInfo[1]]('');
            }
            node[field] = after.value;
          });
      } catch (error) { issues.push(`${node.name}, ${field}: ${errorMessage(error)}`); }
    }
    if (node.type === 'TEXT' || node.type === 'TEXT_PATH') {
      try {
        const segments = node.getStyledTextSegments(['fills', 'fillStyleId', 'boundVariables', 'fontName']);
        const loadedFonts = new Set();
        for (const segment of segments) {
          const { start, end } = segment;
          const paints = replaceAliases(segment.fills);
          if (paints.changed) {
            add(node, `заливка текста [${start}:${end}]`, { fills: segment.fills, styleId: segment.fillStyleId || '' },
              () => ({ fills: node.getRangeFills(start, end), styleId: node.getRangeFillStyleId(start, end) || '' }),
              async () => {
                if (segment.fillStyleId) await node.setRangeFillStyleIdAsync(start, end, '');
                node.setRangeFills(start, end, paints.value);
              });
          }
          for (const [field, alias] of Object.entries(segment.boundVariables || {})) {
            const replacement = alias && replacements.get(alias.id);
            if (!replacement) continue;
            const fontKey = JSON.stringify(segment.fontName);
            if (!loadedFonts.has(fontKey)) { await figma.loadFontAsync(segment.fontName); loadedFonts.add(fontKey); }
            add(node, `${field} [${start}:${end}]`, alias,
              () => node.getRangeBoundVariable(start, end, field),
              () => node.setRangeBoundVariable(start, end, field, replacement));
          }
        }
      } catch (error) { issues.push(`${node.name}, текстовые диапазоны: ${errorMessage(error)}`); }
    }
    if (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET'))) {
      try {
        for (const [name, definition] of Object.entries(node.componentPropertyDefinitions)) {
          const alias = (definition.boundVariables || {}).defaultValue;
          const replacement = alias && replacements.get(alias.id);
          if (!replacement) continue;
          add(node, `значение по умолчанию ${name}`, definition, () => node.componentPropertyDefinitions[name],
            () => node.editComponentProperty(name, { defaultValue: aliasFor(replacement) }));
        }
      } catch (error) { issues.push(`${node.name}, определения свойств: ${errorMessage(error)}`); }
    }
  }
  for (const variable of sourceVersion.variables) {
    for (const use of variable.uses) {
      if (!oldIds.has(use.variableId) && use.via) issues.push(`${use.path}: ссылка через другую переменную (${variable.name}); перепривяжите токен отдельно.`);
      if (use.via && use.via.startsWith('Стиль')) issues.push(`${use.path}: общий стиль «${use.via}» содержит старую ссылку.`);
    }
  }
  if (audit !== current || scopeKey(current.scope) !== current.key) throw new Error('Область изменилась. Повторите проверку.');
  rebindPlan = { id: nextRebindPlanId++, current, sourceId, targetId, sourceCollection, targetCollection,
    sourceVersion, targetVersion, actions, matches, issues: [...new Set(issues)] };
  report('rebindPreview', { planId: rebindPlan.id, sourceId, targetId, matches,
    propertyCount: actions.length, layerCount: new Set(actions.map((action) => action.node.id)).size,
    issues: rebindPlan.issues, assignmentCount: sourceVersion.assignments.length });
}

async function applyRebind(planId) {
  const plan = rebindPlan;
  if (!plan || plan.id !== planId || audit !== plan.current || scopeKey(plan.current.scope) !== plan.current.key) {
    throw new Error('План устарел. Выполните проверку заново.');
  }
  rebindPlan = null;
  let changed = 0;
  let skipped = 0;
  let modesChanged = 0;
  const errors = [...plan.issues];
  for (const action of plan.actions) {
    try {
      if (!inAuditScope(action.node, plan.current) || !sameValue(action.read(), action.before)) { skipped++; continue; }
      await action.write();
      changed++;
    } catch (error) { errors.push(`${action.node.name} (${action.node.id}), ${action.label}: ${errorMessage(error)}`); }
  }
  if (scopeKey(plan.current.scope) !== plan.current.key) {
    invalidate('Область изменилась. Повторите проверку.');
    report('result', { message: `Перепривязано свойств: ${changed}. Область изменилась; остатки не проверены.`, errors });
    return;
  }
  try { await inspect(plan.current.scope); }
  catch (error) {
    invalidate('Не удалось проверить остатки. Повторите проверку.');
    report('result', { message: `Перепривязано свойств: ${changed}. Остатки не проверены.`, errors: [...errors, errorMessage(error)] });
    return;
  }
  const old = audit.diagnostics.groups.flatMap((group) => group.versions).find((version) => version.id === plan.sourceId);
  const oldBindings = old ? old.variables.reduce((sum, variable) => sum + variable.uses.length, 0) : 0;
  if (!oldBindings && !errors.length && !skipped && !audit.warnings.length) {
    for (const entry of plan.current.entries.filter((item) => item.collectionId === plan.sourceId)) {
      try {
        if (!inAuditScope(entry.node, plan.current) || entry.node.explicitVariableModes[plan.sourceId] !== entry.modeId) { skipped++; continue; }
        const oldMode = plan.sourceCollection.modes.find((mode) => mode.modeId === entry.modeId);
        const targetModes = plan.targetCollection.modes.filter((mode) => oldMode && mode.name === oldMode.name);
        if (targetModes.length !== 1) { errors.push(`${entry.node.name}: режим ${oldMode ? oldMode.name : entry.modeId} не найден в целевой коллекции.`); continue; }
        const existingTargetMode = entry.node.explicitVariableModes[plan.targetId];
        if (existingTargetMode && existingTargetMode !== targetModes[0].modeId) {
          errors.push(`${entry.node.name}: у актуальной коллекции уже назначен другой режим.`);
          continue;
        }
        entry.node.setExplicitVariableModeForCollection(plan.targetCollection, targetModes[0].modeId);
        entry.node.clearExplicitVariableModeForCollection(plan.sourceCollection);
        modesChanged++;
      } catch (error) { errors.push(`${entry.node.name}: ${errorMessage(error)}`); }
    }
    if (modesChanged) {
      try { await inspect(plan.current.scope); }
      catch (error) {
        invalidate('Не удалось проверить остатки. Повторите проверку.');
        report('result', { message: `Перепривязано свойств: ${changed}. Режимов: ${modesChanged}. Остатки не проверены.`, errors: [...errors, errorMessage(error)] });
        return;
      }
    }
  }
  const remaining = audit.diagnostics.groups.flatMap((group) => group.versions).filter((version) => version.id === plan.sourceId)
    .reduce((sum, version) => sum + version.assignments.length + version.variables.reduce((n, variable) => n + variable.uses.length, 0), 0);
  report('result', { message: `Перепривязано свойств: ${changed}. Перенесено режимов: ${modesChanged}. Осталось старых ссылок/назначений: ${remaining}.${audit.warnings.length ? ' Проверка частичная.' : ''}${skipped ? ` Пропущено изменившихся: ${skipped}.` : ''}`, errors });
}

async function prepareDetach(collectionIds, unavailableVariableIds, auditId) {
  const current = audit;
  detachPlan = null;
  if (!current || current.id !== auditId || scopeKey(current.scope) !== current.key) {
    throw new Error('Сначала проверьте выбранную область.');
  }
  if (!Array.isArray(collectionIds) || !Array.isArray(unavailableVariableIds)) throw new Error('Некорректный список ссылок.');
  const selected = new Set(collectionIds);
  const versions = current.diagnostics.groups.flatMap((group) => group.versions);
  if ([...selected].some((id) => !versions.some((version) => version.id === id))) throw new Error('Коллекция отсутствует в отчёте.');
  const missing = current.diagnostics.unavailableVariables.filter((variable) => unavailableVariableIds.includes(variable.id));
  if (missing.length !== new Set(unavailableVariableIds).size) throw new Error('Переменная отсутствует в отчёте.');
  if (!selected.size && !missing.length) throw new Error('Отметьте устаревшие коллекции или недоступные переменные.');
  const targets = new Map();
  for (const variable of [...versions.filter((v) => selected.has(v.id)).flatMap((v) => v.variables), ...missing]) {
    for (const use of variable.uses) {
      if (!targets.has(use.nodeId)) targets.set(use.nodeId, new Set());
      // For an alias chain detach the consuming property, never edit the shared
      // variable's values or a shared style used outside the selected scope.
      targets.get(use.nodeId).add(use.variableId);
    }
  }
  const actions = [];
  const issues = [];
  const variableCache = new Map();
  const fontCache = new Map();
  const getVariable = async (id) => {
    if (!variableCache.has(id)) variableCache.set(id, figma.variables.getVariableByIdAsync(id));
    return variableCache.get(id);
  };
  const freeze = async (id, node, fallback) => {
    const variable = await getVariable(id);
    const value = variable ? variable.resolveForConsumer(node).value : fallback;
    if (value === undefined || typeof value === 'symbol' || (value && value.type === 'VARIABLE_ALIAS')) {
      throw new Error(`Не удалось получить текущее значение ${id}`);
    }
    return snapshotValue(value);
  };
  const add = (node, label, before, read, write) => actions.push({
    node, label, before: snapshotValue(before), read, write,
  });
  const attempt = async (node, label, task) => {
    try { await task(); }
    catch (error) { issues.push(`${node.name || node.id} (${node.id}), ${label}: ${errorMessage(error)}`); }
  };
  // Paints, gradient stops, effects and grids are plain immutable values. Remove
  // only selected aliases and write resolved values before dropping the binding.
  const strip = async (value, node, ids) => {
    if (!value || typeof value !== 'object') return { value, changed: false };
    const copy = Array.isArray(value) ? [] : { ...value };
    let changed = false;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'boundVariables') continue;
      const nested = await strip(child, node, ids);
      copy[key] = nested.value;
      changed = changed || nested.changed;
    }
    if (value.boundVariables) {
      const bindings = { ...value.boundVariables };
      for (const [field, alias] of Object.entries(bindings)) {
        if (!alias || !ids.has(alias.id)) continue;
        const fallback = field === 'offsetX' ? value.offset.x : field === 'offsetY' ? value.offset.y : value[field];
        const resolved = await freeze(alias.id, node, fallback);
        if (field === 'offsetX' || field === 'offsetY') {
          copy.offset = { ...copy.offset, [field === 'offsetX' ? 'x' : 'y']: resolved };
        } else if (field === 'color' && value.type === 'SOLID') {
          copy.color = { r: resolved.r, g: resolved.g, b: resolved.b };
          if (typeof resolved.a === 'number') copy.opacity = resolved.a;
        } else copy[field] = resolved;
        delete bindings[field];
        changed = true;
      }
      if (Object.keys(bindings).length) copy.boundVariables = bindings;
      else delete copy.boundVariables;
    }
    return { value: copy, changed };
  };
  for (const [nodeId, ids] of targets) {
    const node = current.nodes.get(nodeId);
    if (!node || !inAuditScope(node, current)) { issues.push(`Слой ${nodeId} перемещён или удалён.`); continue; }
    const text = node.type === 'TEXT' || node.type === 'TEXT_PATH';
    if (text) {
      let fontsReady = true;
      await attempt(node, 'шрифты', async () => {
        try {
          for (const segment of node.getStyledTextSegments(['fontName'])) {
            const key = JSON.stringify(segment.fontName);
            if (!fontCache.has(key)) fontCache.set(key, figma.loadFontAsync(segment.fontName));
            await fontCache.get(key);
          }
        } catch (error) { fontsReady = false; throw error; }
      });
      if (!fontsReady) continue;
    }
    for (const field of ['fills', 'strokes', 'backgrounds', 'effects', 'layoutGrids']) {
      if (!(field in node) || (text && field === 'fills')) continue;
      await attempt(node, field, async () => {
        const before = node[field];
        if (!Array.isArray(before)) return;
        const styleInfo = {
          fills: ['fillStyleId', 'paints', 'setFillStyleIdAsync'],
          strokes: ['strokeStyleId', 'paints', 'setStrokeStyleIdAsync'],
          effects: ['effectStyleId', 'effects', 'setEffectStyleIdAsync'],
          layoutGrids: ['gridStyleId', 'layoutGrids', 'setGridStyleIdAsync'],
        }[field];
        const styleId = styleInfo && node[styleInfo[0]];
        let after = await strip(before, node, ids);
        if (!after.changed && typeof styleId === 'string' && styleId) {
          const style = await figma.getStyleByIdAsync(styleId);
          if (style && Array.isArray(style[styleInfo[1]])) after = await strip(style[styleInfo[1]], node, ids);
        }
        if (after.changed) add(node, field, { value: before, styleId: styleId || null },
          () => ({ value: node[field], styleId: (styleInfo && node[styleInfo[0]]) || null }),
          async () => {
            if (styleId && styleInfo && typeof node[styleInfo[2]] === 'function') await node[styleInfo[2]]('');
            node[field] = after.value;
          });
      });
    }
    if (text) await attempt(node, 'текстовые диапазоны', async () => {
      const textFields = ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent'];
      const segments = node.getStyledTextSegments(['fills', 'fillStyleId', 'boundVariables', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent']);
      for (const segment of segments) {
        const { start, end } = segment;
        const paints = await strip(segment.fills, node, ids);
        if (paints.changed) add(node, `fills [${start}:${end}]`, { fills: segment.fills, styleId: segment.fillStyleId || '' },
          () => ({ fills: node.getRangeFills(start, end), styleId: node.getRangeFillStyleId(start, end) || '' }),
          async () => {
            if (segment.fillStyleId) await node.setRangeFillStyleIdAsync(start, end, '');
            node.setRangeFills(start, end, paints.value);
          });
        const fonts = textFields.filter((field) => ['fontFamily', 'fontStyle', 'fontWeight'].includes(field) &&
          ids.has(((segment.boundVariables || {})[field] || {}).id));
        if (fonts.length) {
          const before = { font: segment.fontName, bindings: Object.fromEntries(fonts.map((field) => [field, segment.boundVariables[field]])) };
          add(node, `font [${start}:${end}]`, before,
            () => ({ font: node.getRangeFontName(start, end), bindings: Object.fromEntries(fonts.map((field) => [field, node.getRangeBoundVariable(start, end, field)])) }),
            () => { for (const field of fonts) node.setRangeBoundVariable(start, end, field, null); node.setRangeFontName(start, end, segment.fontName); });
        }
        for (const field of textFields.filter((field) => !['fontFamily', 'fontStyle', 'fontWeight'].includes(field))) {
          const alias = (segment.boundVariables || {})[field];
          if (!alias || !ids.has(alias.id)) continue;
          const suffix = field[0].toUpperCase() + field.slice(1);
          const getter = `getRange${suffix}`;
          const setter = `setRange${suffix}`;
          if (typeof node[getter] !== 'function' || typeof node[setter] !== 'function') {
            issues.push(`${node.name}, ${field}: API не поддерживает фиксацию значения.`); continue;
          }
          const value = snapshotValue(segment[field]);
          add(node, `${field} [${start}:${end}]`, { value, alias },
            () => ({ value: node[getter](start, end), alias: node.getRangeBoundVariable(start, end, field) }),
            () => { node.setRangeBoundVariable(start, end, field, null); node[setter](start, end, value); });
        }
      }
    });
    await attempt(node, 'свойства слоя', async () => {
      const bindings = node.boundVariables || {};
      const scalar = Object.entries(bindings).filter(([, alias]) => alias && alias.type === 'VARIABLE_ALIAS' && ids.has(alias.id));
      const dimensions = scalar.filter(([field]) => field === 'width' || field === 'height');
      if (dimensions.length) {
        const before = { width: node.width, height: node.height, bindings: Object.fromEntries(dimensions) };
        const horizontal = node.layoutSizingHorizontal;
        const vertical = node.layoutSizingVertical;
        add(node, 'размеры', before,
          () => ({ width: node.width, height: node.height, bindings: Object.fromEntries(dimensions.map(([field]) => [field, (node.boundVariables || {})[field]])) }),
          () => {
            for (const [field] of dimensions) node.setBoundVariable(field, null);
            node.resize(before.width, before.height);
            if (horizontal) node.layoutSizingHorizontal = horizontal;
            if (vertical) node.layoutSizingVertical = vertical;
          });
      }
      for (const [field, alias] of scalar.filter(([field]) => field !== 'width' && field !== 'height' &&
        !(text && ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent'].includes(field)))) {
        await attempt(node, field, async () => {
          const value = snapshotValue(node[field]);
          add(node, field, { value, alias }, () => ({ value: node[field], alias: (node.boundVariables || {})[field] }),
            () => { node.setBoundVariable(field, null); node[field] = value; });
        });
      }
      const properties = bindings.componentProperties || {};
      for (const [name, alias] of Object.entries(properties)) {
        if (!ids.has(alias.id)) continue;
        await attempt(node, `свойство ${name}`, async () => {
          const value = await freeze(alias.id, node, node.componentProperties[name].value);
          const before = node.componentProperties[name];
          add(node, `свойство ${name}`, before, () => node.componentProperties[name], () => node.setProperties({ [name]: value }));
        });
      }
    });
    if (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET'))) {
      await attempt(node, 'определения свойств', async () => {
        for (const [name, definition] of Object.entries(node.componentPropertyDefinitions)) {
          const alias = (definition.boundVariables || {}).defaultValue;
          if (!alias || !ids.has(alias.id)) continue;
          const value = await freeze(alias.id, node, definition.defaultValue);
          add(node, `значение по умолчанию ${name}`, definition, () => node.componentPropertyDefinitions[name],
            () => node.editComponentProperty(name, { defaultValue: value }));
        }
      });
    }
  }
  if (audit !== current || scopeKey(current.scope) !== current.key) throw new Error('Область изменилась. Повторите проверку.');
  detachPlan = { id: nextPlanId++, current, selected, unavailableVariableIds, actions, issues };
  report('detachPreview', {
    planId: detachPlan.id, propertyCount: actions.length,
    layerCount: new Set(actions.map((action) => action.node.id)).size,
    names: current.diagnostics.groups.flatMap((group) => group.versions.filter((v) => selected.has(v.id))
      .map((v) => `${group.name} (${v.id}): ${v.modes.map((m) => m.name).join(', ')}`)),
    missingCount: missing.length, issues,
  });
}

async function applyDetach(planId) {
  const plan = detachPlan;
  if (!plan || plan.id !== planId || audit !== plan.current || scopeKey(plan.current.scope) !== plan.current.key) {
    throw new Error('План устарел. Выполните проверку заново.');
  }
  detachPlan = null;
  let changed = 0;
  let skipped = 0;
  const errors = [...plan.issues];
  for (const action of plan.actions) {
    try {
      if (!inAuditScope(action.node, plan.current) || !sameValue(action.read(), action.before)) { skipped++; continue; }
      await action.write();
      changed++;
    } catch (error) { errors.push(`${action.node.name} (${action.node.id}), ${action.label}: ${errorMessage(error)}`); }
  }
  // Re-scan before clearing modes: unresolved bindings keep their modes, so a
  // failed unbind cannot unexpectedly change the remaining objects' appearance.
  if (scopeKey(plan.current.scope) !== plan.current.key) {
    invalidate('Область изменилась. Проверьте исходные слои заново.');
    report('result', { message: `Зафиксировано свойств: ${changed}. Пропущено: ${skipped}. Область изменилась; остатки не проверены.`, errors });
    return;
  }
  try { await inspect(plan.current.scope); }
  catch (error) {
    invalidate('Не удалось проверить остатки. Повторите проверку.');
    report('result', { message: `Зафиксировано свойств: ${changed}. Остатки не проверены.`, errors: [...errors, errorMessage(error)] });
    return;
  }
  const remainingVersions = audit.diagnostics.groups.flatMap((group) => group.versions).filter((v) => plan.selected.has(v.id));
  const hasBindings = remainingVersions.some((v) => v.variables.some((variable) => variable.uses.length));
  let modesCleared = 0;
  if (!hasBindings && !errors.length && !skipped && !audit.warnings.length) {
    for (const entry of plan.current.entries.filter((entry) => plan.selected.has(entry.collectionId))) {
      try {
        if (!inAuditScope(entry.node, plan.current) || entry.node.explicitVariableModes[entry.collectionId] !== entry.modeId) continue;
        const collection = await figma.variables.getVariableCollectionByIdAsync(entry.collectionId);
        if (!collection) { errors.push(`Коллекция ${entry.collectionId} недоступна: явное назначение осталось.`); continue; }
        if (!inAuditScope(entry.node, plan.current)) { skipped++; continue; }
        entry.node.clearExplicitVariableModeForCollection(collection);
        modesCleared++;
      } catch (error) { errors.push(`${entry.node.name}: ${errorMessage(error)}`); }
    }
    if (modesCleared) {
      try { await inspect(plan.current.scope); }
      catch (error) {
        invalidate('Не удалось проверить остатки. Повторите проверку.');
        report('result', { message: `Зафиксировано свойств: ${changed}. Снято режимов: ${modesCleared}. Остатки не проверены.`, errors: [...errors, errorMessage(error)] });
        return;
      }
    }
  }
  const remaining = audit.diagnostics.groups.flatMap((g) => g.versions).filter((v) => plan.selected.has(v.id))
    .reduce((sum, v) => sum + v.variables.reduce((n, variable) => n + variable.uses.length, 0) + v.assignments.length, 0) +
    audit.diagnostics.unavailableVariables.filter((v) => plan.unavailableVariableIds.includes(v.id)).reduce((n, v) => n + v.uses.length, 0);
  report('result', { message: `Зафиксировано свойств: ${changed}. Снято режимов: ${modesCleared}. Осталось ссылок/назначений: ${remaining}.${audit.warnings.length ? ' Проверка частичная: могут остаться непрочитанные ссылки.' : ''}${skipped ? ` Изменившихся свойств пропущено: ${skipped}.` : ''}`, errors });
}

async function clearAssignments(items, auditId) {
  const current = audit;
  if (!current || current.id !== auditId) throw new Error('Сначала проверьте выбранную область.');
  if (scopeKey(current.scope) !== current.key) {
    invalidate();
    throw new Error('Выделение или страница изменились. Повторите проверку.');
  }
  if (!Array.isArray(items) || !items.length) throw new Error('Выберите назначения режимов.');
  const selected = new Set();
  for (const item of items) {
    if (!item || typeof item.collectionId !== 'string' || typeof item.modeId !== 'string') {
      throw new Error('Некорректный список назначений.');
    }
    const collection = current.collections.find((entry) => entry.id === item.collectionId && entry.available);
    if (!collection || !collection.modes.some((mode) => mode.id === item.modeId)) {
      throw new Error('Назначения изменились. Повторите проверку.');
    }
    selected.add(JSON.stringify([item.collectionId, item.modeId]));
  }
  const entries = current.entries.filter((entry) => selected.has(JSON.stringify([entry.collectionId, entry.modeId])));
  const collections = new Map(await Promise.all([...new Set(entries.map((entry) => entry.collectionId))]
    .map(async (id) => [id, await figma.variables.getVariableCollectionByIdAsync(id)])));
  if (audit !== current || scopeKey(current.scope) !== current.key) {
    throw new Error('Область изменилась. Повторите проверку.');
  }
  let cleared = 0;
  let skipped = 0;
  const errors = [];
  const rootIds = new Set(current.scope === 'selection'
    ? figma.currentPage.selection.map((node) => node.id) : [figma.currentPage.id]);
  for (const entry of entries) {
    try {
      const collection = collections.get(entry.collectionId);
      // The report is a fixed list: newly assigned modes and newly added nodes
      // are never cleared by a command based on an older audit.
      if (entry.node.removed || !collection ||
          entry.node.explicitVariableModes[entry.collectionId] !== entry.modeId) {
        skipped++;
        continue;
      }
      // A node may have been moved outside the audited area since the scan.
      let ancestor = entry.node;
      while (ancestor && !rootIds.has(ancestor.id)) ancestor = ancestor.parent;
      if (!ancestor) { skipped++; continue; }
      entry.node.clearExplicitVariableModeForCollection(collection);
      cleared++;
    } catch (error) {
      errors.push(`${entry.node.name || entry.node.id}: ${errorMessage(error)}`);
    }
  }
  audit = null;
  try {
    await inspect(current.scope);
  } catch (error) {
    invalidate('Повторите проверку, чтобы обновить список.');
    errors.push(`Не удалось обновить список: ${errorMessage(error)}`);
  }
  report('result', {
    message: `Снято назначений: ${cleared}.${skipped ? ` Пропущено изменившихся: ${skipped}.` : ''}`,
    errors,
  });
}

figma.on('selectionchange', () => {
  if (audit && audit.scope === 'selection') invalidate();
});
figma.on('currentpagechange', () => invalidate());

figma.ui.onmessage = async (message) => {
  if (!message || busy) return;
  busy = true;
  try {
    if (message.type === 'audit') await inspect(message.scope);
    else if (message.type === 'reset') invalidate('Выберите область и нажмите «Проверить».');
    else if (message.type === 'prepareDetach') await prepareDetach(message.collectionIds, message.unavailableVariableIds || [], message.auditId);
    else if (message.type === 'applyDetach') await applyDetach(message.planId);
    else if (message.type === 'prepareRebind') await prepareRebind(message.sourceId, message.targetId, message.auditId);
    else if (message.type === 'applyRebind') await applyRebind(message.planId);
    else if (message.type === 'clearAssignments') await clearAssignments(message.items, message.auditId);
    else if (message.type === 'revealNode') {
      const node = audit && audit.id === message.auditId && audit.nodes.get(message.nodeId);
      if (!node || node.removed) throw new Error('Слой недоступен. Повторите проверку.');
      const targets = node.type === 'PAGE' ? [...node.children] : [node];
      if (!targets.length) throw new Error('На странице нет слоёв для приближения.');
      figma.viewport.scrollAndZoomIntoView(targets);
    }
  } catch (error) {
    report('error', { message: errorMessage(error) });
  } finally {
    busy = false;
    report('idle');
  }
};
