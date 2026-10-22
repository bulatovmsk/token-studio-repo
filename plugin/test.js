const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const calls = [];
const notices = [];
const collections = [
  { id: 'old', key: 'color', modes: ['Main', 'Meta', 'KidsTween'] },
  { id: 'new', key: 'color', modes: ['Main', 'Kids'] },
  { id: 'text', key: 'typography', modes: ['Main', 'Large'] },
].map(c => ({ ...c, name: c.key, modes: c.modes.map(name => ({ name, modeId: name })) }));
function node(id, children = []) {
  return {
    id, type: 'FRAME', children, explicitVariableModes: { old: 'Main', new: 'Main', text: 'Large' },
    setExplicitVariableModeForCollection(c, mode) { calls.push(['set', id, c.id, mode]); },
    clearExplicitVariableModeForCollection(c) {
      calls.push(['clear', id, c.id]);
      if (id === 'fails' && c.id === 'old') throw Error('cannot clear');
    },
  };
}
const hidden = { ...node('hidden'), visible: false };
const instance = { ...node('instance', [hidden]), type: 'INSTANCE' };
const text = { ...node('rich-text'), type: 'TEXT', getStyledTextSegments: () => [
  { boundVariables: { fontSize: { type: 'VARIABLE_ALIAS', id: 'range-variable' } } },
] };
const root = node('root', [instance, text, node('fails')]);
const sibling = node('sibling');
const page = { ...node('page', [root, sibling]), selection: [root, instance], loadAsync: async () => {} };
const figma = {
  currentPage: page, showUI() {}, on() {}, notify(message) { notices.push(message); },
  ui: { postMessage() {} },
  variables: {
    getVariableCollectionByIdAsync: async id => collections.find(c => c.id === id),
    getVariableByIdAsync: async id => ({ id, variableCollectionId: 'new' }),
  },
};
const context = vm.createContext({ figma, __html__: '', console: { log() {} }, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(`${__dirname}/code.js`, 'utf8'), context);
(async () => {
  assert.equal(figma.skipInvisibleInstanceChildren, false);
  const ids = vm.runInContext('const ids = new Set(); collectVariableIdsOnNode(figma.currentPage.children[0].children[1], ids); Array.from(ids)', context);
  assert.deepEqual(Array.from(ids), ['range-variable']);
  await vm.runInContext('applyTheme("Kids")', context);
  for (const id of ['root', 'instance', 'hidden', 'rich-text', 'fails']) {
    for (const col of ['old', 'new']) {
      assert.equal(calls.filter(c => c[0] === 'set' && c[1] === id && c[2] === col && c[3] === 'Kids').length, 1);
    }
  }
  assert(calls.every(c => !['page', 'sibling'].includes(c[1]) && c[2] !== 'text'));
  assert(notices.at(-1).includes('ошибок: 1'));
  calls.length = 0;
  await vm.runInContext('resetCollections()', context);
  assert(calls.every(c => c[0] === 'clear' && c[2] !== 'text'));
  assert(calls.some(c => c[1] === 'fails' && c[2] === 'new')); // continue after one source fails
  assert(calls.some(c => c[1] === 'hidden'));
  calls.length = 0;
  page.selection = [];
  await vm.runInContext('applyTheme("Meta")', context);
  assert(calls.some(c => c[0] === 'set' && c[1] === 'page'));
  assert(calls.some(c => c[0] === 'set' && c[1] === 'sibling'));
  console.log('PASS: nested/hidden instances, rich text, source snapshots, selection scope, overlapping selection, full-page scope, reset errors');
})().catch(e => { console.error(e); process.exitCode = 1; });
