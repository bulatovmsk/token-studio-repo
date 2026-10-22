const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function node(id, modes = {}, children = []) {
  const item = {
    id, name: id, type: 'FRAME', explicitVariableModes: { ...modes }, children,
    removed: false, clearCalls: [],
    clearExplicitVariableModeForCollection(collection) {
      assert.equal(typeof collection, 'object');
      this.clearCalls.push(collection.id);
      delete this.explicitVariableModes[collection.id];
    },
    setExplicitVariableModeForCollection(collection, modeId) {
      this.explicitVariableModes[collection.id] = modeId;
    },
    get componentProperties() { throw new Error('Component set for node has existing errors'); },
    get componentPropertyDefinitions() { throw new Error('Cannot read variant definitions'); },
  };
  for (const child of children) child.parent = item;
  return item;
}

function makePlugin(roots, selected = roots, pageModes = {}) {
  const messages = [];
  const handlers = {};
  const variables = new Map();
  const styles = new Map();
  const page = node('page', pageModes, roots);
  page.type = 'PAGE';
  page.selection = selected;
  page.loadCalls = 0;
  page.loadAsync = async () => { page.loadCalls++; };
  const collections = new Map(['color', 'number'].map((id) => [id, {
    id, name: id, remote: id === 'number',
    modes: [{ modeId: 'main', name: 'Main' }, { modeId: 'old', name: 'Old' }],
    remove() { throw new Error('Collection deletion is forbidden'); },
    removeMode() { throw new Error('Mode deletion is forbidden'); },
  }]));
  const figma = {
    showUI() {},
    ui: { postMessage(message) { messages.push(message); } },
    on(event, handler) {
      assert.ok(['selectionchange', 'currentpagechange'].includes(event), `Unexpected event: ${event}`);
      handlers[event] = handler;
    },
    currentPage: page,
    get root() { throw new Error('Must not traverse the file'); },
    loadAllPagesAsync() { throw new Error('Must not load all pages'); },
    variables: {
      getVariableCollectionByIdAsync: async (id) => collections.get(id) || null,
      getVariableByIdAsync: async (id) => variables.get(id) || null,
      createVariableAlias: (variable) => ({ type: 'VARIABLE_ALIAS', id: variable.id }),
      setBoundVariableForPaint: (paint, field, variable) => ({ ...paint, boundVariables: {
        ...paint.boundVariables, [field]: { type: 'VARIABLE_ALIAS', id: variable.id },
      } }),
      setBoundVariableForEffect: (effect, field, variable) => ({ ...effect, boundVariables: {
        ...effect.boundVariables, [field]: { type: 'VARIABLE_ALIAS', id: variable.id },
      } }),
      setBoundVariableForLayoutGrid: (grid, field, variable) => ({ ...grid, boundVariables: {
        ...grid.boundVariables, [field]: { type: 'VARIABLE_ALIAS', id: variable.id },
      } }),
    },
    getStyleByIdAsync: async (id) => styles.get(id) || null,
    viewport: { scrollAndZoomIntoView(nodes) { figma.zoomedNodes = nodes; } },
  };
  const context = vm.createContext({ figma, __html__: '', console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'code.js'), 'utf8') +
    '\nglobalThis.testApi = { inspect, clearAssignments, prepareDetach, applyDetach, prepareRebind, applyRebind };', context);
  return {
    api: context.testApi, figma, page, handlers, messages, collections, variables, styles,
    inventory: () => messages.filter((message) => message.type === 'inventory').at(-1),
    result: () => messages.filter((message) => message.type === 'result').at(-1),
    preview: () => messages.filter((message) => message.type === 'detachPreview').at(-1),
  };
}

async function main() {
  // Both properties that previously crashed the plugin throw on these nodes.
  // Overlapping selection must count and clear each node exactly once.
  const child = node('child', { color: 'old', number: 'main' });
  child.type = 'INSTANCE';
  const root = node('root', { color: 'old' }, [child]);
  const sibling = node('sibling', { color: 'old' });
  const plugin = makePlugin([root, sibling], [root, child], { color: 'main' });
  await plugin.api.inspect('selection');
  assert.equal(plugin.inventory().nodeCount, 2);
  assert.equal(plugin.inventory().assignmentCount, 3);
  assert.equal(plugin.page.loadCalls, 0);
  await plugin.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], plugin.inventory().auditId);
  assert.equal(root.explicitVariableModes.color, undefined);
  assert.equal(child.explicitVariableModes.color, undefined);
  assert.equal(child.explicitVariableModes.number, 'main');
  assert.equal(sibling.explicitVariableModes.color, 'old');
  assert.equal(plugin.page.explicitVariableModes.color, 'main');
  assert.equal(child.clearCalls.length, 1);
  assert.equal(plugin.inventory().assignmentCount, 1);
  assert.match(plugin.result().message, /Снято назначений: 2/);

  // Page scope includes the page itself and descendants, including remote modes.
  await plugin.api.inspect('page');
  assert.equal(plugin.page.loadCalls, 1);
  assert.equal(plugin.inventory().assignmentCount, 3);
  await plugin.api.clearAssignments([
    { collectionId: 'color', modeId: 'main' },
    { collectionId: 'color', modeId: 'old' },
    { collectionId: 'number', modeId: 'main' },
  ], plugin.inventory().auditId);
  assert.equal(plugin.inventory().assignmentCount, 0);

  // Empty selection never falls back to a whole-page or whole-file scan.
  const empty = makePlugin([node('outside', { color: 'old' })], []);
  await assert.rejects(empty.api.inspect('selection'), /Выделите/);
  await assert.rejects(empty.api.inspect('file'), /Выберите/);
  assert.equal(empty.page.loadCalls, 0);

  // Selection changes invalidate the report, even before an event is received.
  const target = node('target', { color: 'old' });
  const other = node('other', { color: 'old' });
  const changed = makePlugin([target, other], [target]);
  await changed.api.inspect('selection');
  const oldAuditId = changed.inventory().auditId;
  changed.page.selection = [other];
  await assert.rejects(changed.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], oldAuditId), /изменились/);
  assert.equal(target.clearCalls.length + other.clearCalls.length, 0);
  await changed.api.inspect('selection');
  changed.handlers.selectionchange();
  await assert.rejects(changed.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], changed.inventory().auditId), /Сначала/);
  await changed.api.inspect('page');
  changed.handlers.currentpagechange();
  await assert.rejects(changed.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], changed.inventory().auditId), /Сначала/);

  // Modes changed after the audit, moved-out nodes and new nodes are not cleared.
  const edited = node('edited', { color: 'old' });
  const moved = node('moved', { color: 'old' });
  const selectedRoot = node('selectedRoot', {}, [edited, moved]);
  const outside = node('outside');
  const stale = makePlugin([selectedRoot, outside], [selectedRoot]);
  await stale.api.inspect('selection');
  edited.explicitVariableModes.color = 'main';
  moved.parent = outside;
  selectedRoot.children = [edited];
  outside.children.push(moved);
  const added = node('added', { color: 'old' });
  added.parent = selectedRoot;
  selectedRoot.children.push(added);
  await stale.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], stale.inventory().auditId);
  assert.equal(edited.explicitVariableModes.color, 'main');
  assert.equal(moved.explicitVariableModes.color, 'old');
  assert.equal(added.explicitVariableModes.color, 'old');
  assert.match(stale.result().message, /Пропущено изменившихся: 2/);

  // A failed read is reported as a partial scan while descendants are inspected.
  const readable = node('readable', { color: 'main' });
  const broken = node('broken', {}, [readable]);
  Object.defineProperty(broken, 'explicitVariableModes', { get() { throw new Error('Unreadable'); } });
  const partial = makePlugin([broken]);
  await partial.api.inspect('selection');
  assert.equal(partial.inventory().warnings.length, 1);
  assert.equal(partial.inventory().assignmentCount, 1);

  // An individual clear error does not hide successful work or stop other nodes.
  const locked = node('locked', { color: 'old' });
  locked.clearExplicitVariableModeForCollection = () => { throw new Error('Cannot change'); };
  const editable = node('editable', { color: 'old' });
  const failures = makePlugin([locked, editable]);
  await failures.api.inspect('selection');
  await failures.api.clearAssignments([{ collectionId: 'color', modeId: 'old' }], failures.inventory().auditId);
  assert.equal(failures.result().errors.length, 1);
  assert.equal(editable.explicitVariableModes.color, undefined);
  assert.equal(locked.explicitVariableModes.color, 'old');
  assert.match(failures.result().message, /Снято назначений: 1/);
  console.log('Scoped assignment cleanup tests passed.');

  // Regression: no explicit modes, but 69 paint bindings still retain two old
  // snapshots of Color. Compare the library key, never collection names alone.
  const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
  const bound = (id, variableId, field = 'fills') => {
    const layer = node(id);
    Object.defineProperty(layer, 'boundVariables', { configurable: true, get() {
      const values = layer[field].flatMap((paint) => Object.values(paint.boundVariables || {}));
      return values.length ? { [field]: values } : {};
    } });
    layer[field] = [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 }, opacity: 1, boundVariables: { color: alias(variableId) } }];
    return layer;
  };
  const oldLayers = [
    ...Array.from({ length: 27 }, (_, i) => bound(`negative-${i}`, 'negative')),
    ...Array.from({ length: 27 }, (_, i) => bound(`border-${i}`, 'border', 'strokes')),
    ...Array.from({ length: 6 }, (_, i) => bound(`sber-fill-${i}`, 'sber-old')),
    ...Array.from({ length: 9 }, (_, i) => bound(`sber-stroke-${i}`, 'sber-middle', 'strokes')),
  ];
  const live = bound('live', 'primary');
  const excluded = bound('excluded', 'unavailable-outside');
  const diagnostic = makePlugin([...oldLayers, live, excluded], [...oldLayers, live]);
  for (const [id, names] of [
    ['current', ['Main', 'Kids']],
    ['old', ['Main', 'Meta', 'KidsTween', 'KidsBaby', 'Boys', 'Girls']],
    ['middle', ['Main', 'Meta', 'KidsTween']],
  ]) {
    diagnostic.collections.set(id, { id, key: 'same-library-key', name: 'Color', remote: true,
      modes: names.map((name) => ({ modeId: name, name })) });
  }
  for (const [id, cid] of [['negative', 'old'], ['border', 'old'], ['sber-old', 'old'], ['sber-middle', 'middle'], ['primary', 'current']]) {
    diagnostic.variables.set(id, { id, key: id, name: id, variableCollectionId: cid, valuesByMode: {} });
  }
  await diagnostic.api.inspect('selection');
  const data = diagnostic.inventory().diagnostics;
  assert.equal(diagnostic.inventory().assignmentCount, 0);
  assert.equal(diagnostic.inventory().warnings.length, 0);
  assert.equal(data.conflicts, 1);
  assert.equal(data.bindingCount, 70, 'node and paint aliases must not be double-counted');
  const oldVersions = data.groups[0].versions.filter((version) => version.id !== 'current');
  assert.equal(oldVersions.reduce((sum, version) => sum + version.variables.reduce((count, v) => count + v.uses.length, 0), 0), 69);
  assert.equal(data.unavailableVariables.length, 0, 'outside selection is not inspected');
  assert.ok(oldVersions.some((v) => v.modes.some((mode) => mode.name === 'Girls')));
  assert.ok(oldVersions[0].variables[0].uses[0].path.includes('page / negative-0'));
  assert.equal(oldLayers.reduce((count, n) => count + n.clearCalls.length, 0), 0, 'diagnostic is read-only');
  await diagnostic.figma.ui.onmessage({ type: 'revealNode', nodeId: 'negative-0', auditId: diagnostic.inventory().auditId });
  assert.equal(diagnostic.figma.zoomedNodes[0].id, 'negative-0');

  // Equal names with different keys are distinct collections, not old versions.
  diagnostic.collections.get('old').key = 'different-library-key';
  diagnostic.collections.get('middle').key = 'third-library-key';
  await diagnostic.api.inspect('selection');
  assert.equal(diagnostic.inventory().diagnostics.conflicts, 0);

  // Local token -> remote variable references (including cycles), unavailable
  // variables and collections, and bound variables inside a used style.
  const viaToken = bound('via-token', 'local-token');
  const viaStyle = node('via-style');
  viaStyle.fillStyleId = 'paint-style';
  const missing = bound('missing', 'missing-variable');
  const missingCollection = bound('missing-collection', 'orphan');
  const chain = makePlugin([viaToken, viaStyle, missing, missingCollection]);
  chain.styles.set('paint-style', { id: 'paint-style', name: 'Danger',
    paints: [{ boundVariables: { color: alias('remote-token') } }] });
  chain.variables.set('local-token', { id: 'local-token', key: 'local', name: 'Local token',
    variableCollectionId: 'number', valuesByMode: { main: alias('remote-token') } });
  chain.variables.set('remote-token', { id: 'remote-token', key: 'remote', name: 'Remote token',
    variableCollectionId: 'color', valuesByMode: { main: alias('local-token') } });
  chain.variables.set('orphan', { id: 'orphan', key: 'orphan', name: 'Orphan',
    variableCollectionId: 'deleted-or-inaccessible', valuesByMode: {} });
  await chain.api.inspect('selection');
  const report = chain.inventory().diagnostics;
  const remote = report.groups.find((g) => g.name === 'color').versions[0].variables[0];
  assert.ok(remote.uses.some((use) => use.nodeId === 'via-token' && use.via.includes('Local token')));
  assert.ok(remote.uses.some((use) => use.nodeId === 'via-style' && use.via.includes('Danger')));
  assert.equal(report.unavailableVariables[0].uses[0].nodeId, 'missing');
  assert.equal(report.groups.find((g) => g.key === 'deleted-or-inaccessible').versions[0].available, false);
  assert.ok(chain.inventory().warnings.some((w) => w.includes('Циклическая')));

  // Unreadable properties must produce a partial report instead of crashing;
  // variant definitions are never read, damaged instance properties are avoided.
  const variant = bound('variant', 'primary');
  variant.type = 'COMPONENT';
  const componentSet = node('set', {}, [variant]);
  componentSet.type = 'COMPONENT_SET';
  Object.defineProperty(componentSet, 'componentPropertyDefinitions', { value: {} });
  const brokenInstance = node('broken-instance');
  brokenInstance.type = 'INSTANCE';
  Object.defineProperty(brokenInstance, 'boundVariables', { get() { throw new Error('Cannot read bindings'); } });
  const guarded = makePlugin([componentSet, brokenInstance]);
  await guarded.api.inspect('selection');
  assert.equal(guarded.inventory().warnings.length, 1);
  assert.ok(guarded.inventory().warnings[0].includes('Cannot read bindings'));
  assert.equal(guarded.inventory().diagnostics.unavailableVariables[0].uses[0].nodeId, 'variant');
  console.log('Collection reference diagnostics tests passed.');

  // The diagnosed 69 old references can be frozen without touching the current
  // collection, the excluded sibling, or definitions in the library.
  const resolvedColor = { r: 0.8, g: 0.2, b: 0.1, a: 0.6 };
  for (const variable of diagnostic.variables.values()) variable.resolveForConsumer = () => ({ value: resolvedColor });
  const currentPaint = JSON.stringify(live.fills);
  await diagnostic.api.prepareDetach(['old', 'middle'], [], diagnostic.inventory().auditId);
  assert.equal(diagnostic.preview().propertyCount, 69);
  assert.equal(diagnostic.preview().issues.length, 0);
  assert.ok(oldLayers[0].fills[0].boundVariables, 'preview must not mutate');
  await diagnostic.api.applyDetach(diagnostic.preview().planId);
  assert.match(diagnostic.result().message, /Зафиксировано свойств: 69/);
  assert.match(diagnostic.result().message, /Осталось ссылок\/назначений: 0/);
  assert.equal(diagnostic.result().errors.length, 0);
  assert.equal(diagnostic.inventory().diagnostics.bindingCount, 1);
  assert.equal(oldLayers[0].fills[0].boundVariables, undefined);
  assert.equal(oldLayers[0].fills[0].color.r, resolvedColor.r);
  assert.equal(oldLayers[0].fills[0].opacity, resolvedColor.a);
  assert.equal(JSON.stringify(live.fills), currentPaint);
  assert.ok(excluded.fills[0].boundVariables);

  // Missing variables are detached using the concrete cached value. No import,
  // deletion or guessed replacement variable is necessary.
  const unavailableNode = bound('unavailable', 'missing');
  const unavailable = makePlugin([unavailableNode]);
  await unavailable.api.inspect('selection');
  await unavailable.api.prepareDetach([], ['missing'], unavailable.inventory().auditId);
  await unavailable.api.applyDetach(unavailable.preview().planId);
  assert.equal(unavailableNode.fills[0].color.r, 0.1);
  assert.equal(unavailableNode.fills[0].boundVariables, undefined);

  // Used styles are detached on the consuming layer only; the shared style and
  // other layers keep their original references.
  const styled = node('styled');
  styled.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }];
  styled.fillStyleId = 'style';
  styled.setFillStyleIdAsync = async (id) => { styled.fillStyleId = id; };
  const styleDetach = makePlugin([styled]);
  const sharedStyle = { id: 'style', name: 'Shared', paints: [
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, boundVariables: { color: alias('style-color') } },
  ] };
  styleDetach.styles.set('style', sharedStyle);
  styleDetach.variables.set('style-color', { id: 'style-color', name: 'Style color', variableCollectionId: 'color',
    valuesByMode: {}, resolveForConsumer: () => ({ value: resolvedColor }) });
  await styleDetach.api.inspect('selection');
  await styleDetach.api.prepareDetach(['color'], [], styleDetach.inventory().auditId);
  await styleDetach.api.applyDetach(styleDetach.preview().planId);
  assert.equal(styled.fillStyleId, '');
  assert.equal(styled.fills[0].color.r, 0.8);
  assert.ok(sharedStyle.paints[0].boundVariables);
  assert.match(styleDetach.result().message, /Осталось ссылок\/назначений: 0/);

  // Edits made after preview are skipped, not overwritten with cached paints.
  const stalePaint = bound('stale-paint', 'gone');
  const staleDetach = makePlugin([stalePaint]);
  await staleDetach.api.inspect('selection');
  await staleDetach.api.prepareDetach([], ['gone'], staleDetach.inventory().auditId);
  stalePaint.fills[0].color.r = 0.9;
  await staleDetach.api.applyDetach(staleDetach.preview().planId);
  assert.equal(stalePaint.fills[0].color.r, 0.9);
  assert.ok(stalePaint.fills[0].boundVariables);
  assert.match(staleDetach.result().message, /пропущено: 1/);
  // Alias chains detach the consumer without changing either token definition.
  const indirect = bound('indirect', 'local');
  const indirectPlugin = makePlugin([indirect]);
  indirectPlugin.variables.set('local', { id: 'local', name: 'Local', variableCollectionId: 'number',
    valuesByMode: { main: alias('remote') }, resolveForConsumer: () => ({ value: resolvedColor }) });
  indirectPlugin.variables.set('remote', { id: 'remote', name: 'Remote', variableCollectionId: 'color', valuesByMode: {} });
  await indirectPlugin.api.inspect('selection');
  await indirectPlugin.api.prepareDetach(['color'], [], indirectPlugin.inventory().auditId);
  await indirectPlugin.api.applyDetach(indirectPlugin.preview().planId);
  assert.equal(indirect.fills[0].boundVariables, undefined);
  assert.equal(indirectPlugin.variables.get('local').valuesByMode.main.id, 'remote');

  // Nested gradient stops and shadow offsets keep unrelated bindings.
  const effectNode = node('effects', { color: 'old' });
  effectNode.effects = [{ type: 'DROP_SHADOW', offset: { x: 8, y: 4 }, radius: 12,
    boundVariables: { offsetX: alias('old-offset'), radius: alias('keep-radius') } }];
  effectNode.fills = [{ type: 'GRADIENT_LINEAR', gradientStops: [{ position: 0,
    color: { r: 1, g: 0, b: 0, a: 1 }, boundVariables: { color: alias('old-color') } }] }];
  const effectsPlugin = makePlugin([effectNode]);
  effectsPlugin.variables.set('old-offset', { id: 'old-offset', name: 'Offset', variableCollectionId: 'color',
    valuesByMode: {}, resolveForConsumer: () => ({ value: 8 }) });
  effectsPlugin.variables.set('old-color', { id: 'old-color', name: 'Color', variableCollectionId: 'color',
    valuesByMode: {}, resolveForConsumer: () => ({ value: resolvedColor }) });
  effectsPlugin.variables.set('keep-radius', { id: 'keep-radius', name: 'Radius', variableCollectionId: 'number', valuesByMode: {} });
  await effectsPlugin.api.inspect('selection');
  await effectsPlugin.api.prepareDetach(['color'], [], effectsPlugin.inventory().auditId);
  await effectsPlugin.api.applyDetach(effectsPlugin.preview().planId);
  assert.equal(effectNode.effects[0].offset.x, 8);
  assert.equal(effectNode.effects[0].boundVariables.offsetX, undefined);
  assert.equal(effectNode.effects[0].boundVariables.radius.id, 'keep-radius');
  assert.equal(effectNode.fills[0].gradientStops[0].color.a, 0.6);
  assert.equal(effectNode.explicitVariableModes.color, undefined);

  // Incomplete scans must retain modes and explicitly report incomplete results.
  const partialNode = node('partial', { color: 'old' });
  Object.defineProperty(partialNode, 'boundVariables', { get() { throw new Error('Unreadable'); } });
  const partialPlugin = makePlugin([partialNode]);
  await partialPlugin.api.inspect('selection');
  await partialPlugin.api.prepareDetach(['color'], [], partialPlugin.inventory().auditId);
  await partialPlugin.api.applyDetach(partialPlugin.preview().planId);
  assert.equal(partialNode.explicitVariableModes.color, 'old');
  assert.match(partialPlugin.result().message, /Проверка частичная/);

  // Text ranges load fonts and preserve the concrete size when clearing aliases.
  const textNode = node('text');
  textNode.type = 'TEXT';
  let fontLoaded = false;
  const segment = { start: 0, end: 3, fills: [], fillStyleId: '', fontName: { family: 'Inter', style: 'Regular' },
    fontSize: 24, boundVariables: { fontSize: alias('size') } };
  textNode.getStyledTextSegments = () => [segment];
  textNode.getRangeFontSize = () => segment.fontSize;
  textNode.getRangeBoundVariable = (start, end, field) => segment.boundVariables[field];
  textNode.setRangeBoundVariable = (start, end, field) => { assert.ok(fontLoaded); delete segment.boundVariables[field]; };
  textNode.setRangeFontSize = (start, end, value) => { segment.fontSize = value; };
  const textPlugin = makePlugin([textNode]);
  textPlugin.figma.loadFontAsync = async () => { fontLoaded = true; };
  textPlugin.variables.set('size', { id: 'size', name: 'Size', variableCollectionId: 'number', valuesByMode: {} });
  await textPlugin.api.inspect('selection');
  await textPlugin.api.prepareDetach(['number'], [], textPlugin.inventory().auditId);
  await textPlugin.api.applyDetach(textPlugin.preview().planId);
  assert.equal(segment.fontSize, 24);
  assert.equal(segment.boundVariables.fontSize, undefined);
  assert.equal(textPlugin.result().errors.length, 0);
  console.log('Targeted collection detach tests passed.');

  // A same-key collection conflict can be migrated by exact variable name/type.
  // The current target may contain variables not yet used in the chosen layers.
  const migrate = bound('migrate', 'old-color');
  migrate.explicitVariableModes.oldVersion = 'old-main';
  const scalarLayer = node('scalar');
  scalarLayer.opacity = 0.5;
  scalarLayer.boundVariables = { opacity: alias('old-opacity') };
  scalarLayer.setBoundVariable = (field, variable) => { scalarLayer.boundVariables[field] = alias(variable.id); };
  const currentLayer = bound('current-layer', 'new-color');
  const untouched = bound('untouched', 'old-color');
  const migration = makePlugin([migrate, scalarLayer, currentLayer, untouched], [migrate, scalarLayer, currentLayer]);
  migration.collections.set('oldVersion', { id: 'oldVersion', key: 'shared-key', name: 'Palette',
    variableIds: ['old-color', 'old-opacity'], modes: [{ modeId: 'old-main', name: 'Main' }] });
  migration.collections.set('newVersion', { id: 'newVersion', key: 'shared-key', name: 'Palette',
    variableIds: ['new-color', 'new-opacity'], modes: [{ modeId: 'new-main', name: 'Main' }] });
  migration.variables.set('old-color', { id: 'old-color', key: 'old-key', name: 'color/primary',
    resolvedType: 'COLOR', variableCollectionId: 'oldVersion', valuesByMode: {} });
  migration.variables.set('new-color', { id: 'new-color', key: 'new-key', name: 'color/primary',
    resolvedType: 'COLOR', variableCollectionId: 'newVersion', valuesByMode: {} });
  migration.variables.set('old-opacity', { id: 'old-opacity', key: 'old-opacity', name: 'opacity',
    resolvedType: 'FLOAT', variableCollectionId: 'oldVersion', valuesByMode: {} });
  migration.variables.set('new-opacity', { id: 'new-opacity', key: 'new-opacity', name: 'opacity',
    resolvedType: 'FLOAT', variableCollectionId: 'newVersion', valuesByMode: {} });
  await migration.api.inspect('selection');
  assert.equal(migration.inventory().diagnostics.conflicts, 1);
  await migration.api.prepareRebind('oldVersion', 'newVersion', migration.inventory().auditId);
  const rebindPreview = migration.messages.filter((message) => message.type === 'rebindPreview').at(-1);
  assert.equal(rebindPreview.propertyCount, 2);
  assert.equal(rebindPreview.matches.length, 2);
  assert.equal(migrate.fills[0].boundVariables.color.id, 'old-color', 'preview is read-only');
  await migration.api.applyRebind(rebindPreview.planId);
  assert.equal(migrate.fills[0].boundVariables.color.id, 'new-color');
  assert.equal(scalarLayer.boundVariables.opacity.id, 'new-opacity');
  assert.equal(migrate.explicitVariableModes.oldVersion, undefined);
  assert.equal(migrate.explicitVariableModes.newVersion, 'new-main');
  assert.equal(untouched.fills[0].boundVariables.color.id, 'old-color');
  assert.match(migration.result().message, /Осталось старых ссылок\/назначений: 0/);
  migrate.explicitVariableModes.oldVersion = 'old-main';
  migration.collections.get('newVersion').modes[0].name = 'Different';
  await migration.api.inspect('selection');
  await assert.rejects(() => migration.api.prepareRebind('oldVersion', 'newVersion', migration.inventory().auditId),
    /не имеет однозначного соответствия/);

  // Ambiguous matches are reported and not changed.
  const ambiguous = bound('ambiguous', 'old-token');
  const ambiguity = makePlugin([ambiguous]);
  ambiguity.collections.set('old', { id: 'old', key: 'one-key', name: 'Colors', variableIds: ['old-token'], modes: [] });
  ambiguity.collections.set('new', { id: 'new', key: 'one-key', name: 'Colors', variableIds: ['new-a', 'new-b'], modes: [] });
  ambiguity.variables.set('old-token', { id: 'old-token', key: 'old-token', name: 'primary', resolvedType: 'COLOR', variableCollectionId: 'old', valuesByMode: {} });
  for (const id of ['new-a', 'new-b']) ambiguity.variables.set(id, { id, key: id, name: 'primary', resolvedType: 'COLOR', variableCollectionId: 'new', valuesByMode: {} });
  // One target binding makes the target collection visible in this scope.
  const targetVisible = bound('target-visible', 'new-a');
  targetVisible.parent = ambiguity.page;
  ambiguity.page.children.push(targetVisible);
  ambiguity.page.selection.push(targetVisible);
  await ambiguity.api.inspect('selection');
  await ambiguity.api.prepareRebind('old', 'new', ambiguity.inventory().auditId);
  const ambiguousPreview = ambiguity.messages.filter((message) => message.type === 'rebindPreview').at(-1);
  assert.equal(ambiguousPreview.propertyCount, 0);
  assert.ok(ambiguousPreview.issues.some((issue) => issue.includes('несколько совпадений')));
  await ambiguity.api.applyRebind(ambiguousPreview.planId);
  assert.equal(ambiguous.fills[0].boundVariables.color.id, 'old-token');
  console.log('Automatic variable rebind tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
