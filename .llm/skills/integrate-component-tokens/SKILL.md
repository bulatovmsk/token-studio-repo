---
name: integrate-component-tokens
description: >-
  Привязать (проставить) компонентные токены `control.*` к компонентам Figma в дизайн-системе OKKO
  (Lib-iOS / Token Studio). Use when binding component tokens / Figma variables to a Figma component set —
  height, radius, padding, gap, icon-size, circle sizing. Триггеры: «привяжи компонентные токены»,
  «проставь токены к кнопке/компоненту», «bind component tokens», даётся ссылка на набор компонентов в Figma.
---

# Привязка компонентных токенов к компонентам Figma

Кодирует проверенную методику привязки `control.*` токенов к набору компонентов (Button-семейство) в файле
Lib-iOS. Дополнительный контекст и история — авто-память `component-token-integration-reference`.

## Главный принцип: токен — источник истины

Цель интеграции — **привести контролы к единому виду через токены**, а не законсервировать текущую геометрию.
Поэтому:

- Если кастомное (захардкоженное) значение свойства **не совпадает** с значением подходящего токена — **меняем
  на токен** (привязываем), даже если вид компонента при этом изменится. Токен побеждает кастом.
- НЕ подгоняем значение токена под макет, чтобы «сохранить вид». Обратная подгонка (правка JSON под макет)
  допустима ТОЛЬКО когда сам макет — согласованный источник истины и токен реально ошибочен; это отдельное
  явное решение пользователя, не дефолт.
- Вид компонента **может измениться** после привязки — это ожидаемо и правильно. Скриншот после аудита нужен,
  чтобы убедиться, что ничего не сломалось (контент не обрезан, не разъехался), а НЕ чтобы доказать
  идентичность.
- Исключение — **намеренные тематические оверрайды** (напр. тема Meta в TV: радиус-пилюля, увеличенные паддинги).
  Их не трогаем: значение задаётся токеном для конкретного мода, это фича.
- Если для компонента нет подходящего токена в нужном размер-классе — это решение пользователя: завести новый
  токен (JSON → Token Studio → bind) либо привязать к существующему (вид изменится). Не выбирать молча.

## 0. Prerequisites (обязательно)

1. **Сначала загрузить навык `figma-use`** из установленного Figma MCP/plugin — все привязки идут через
   `use_figma` (JS в Figma Plugin API). Без него — типовые трудноуловимые ошибки.
2. Нужен доступ на запись в файл. `fileKey` берётся из URL; для URL вида `/design/:fileKey/branch/:branchKey/...`
   использовать **branchKey**.
3. Работать **инкрементально**: дискавери (read-only) → привязка порциями → аудит. После ошибки `use_figma`
   НЕ повторять вслепую — скрипт атомарен, прочитать ошибку, поправить.

## 1. Дискавери (read-only `use_figma`)

```js
const cols = await figma.variables.getLocalVariableCollectionsAsync();      // найти коллекцию компонентных переменных (напр. "Component W&M")
const allVars = await figma.variables.getLocalVariablesAsync();
const map = {}; for (const v of allVars) if (v.name.startsWith('control/')) map[v.name] = v;  // name -> Variable
// семантик round (remote, библиотека Semantic W&M):
const round = await figma.variables.getVariableByIdAsync('VariableID:3c6d454e0aa64147df171d5a20ec5ed92ae58567/5511:854');
return { cols: cols.map(c=>({name:c.name,id:c.id,modes:c.modes.map(m=>m.name),n:c.variableIds.length})), controlCount: Object.keys(map).length, round: round && round.name };
```

Имена переменных в Figma — через `/`: `control/{size}/{type}/{prop}/{dim}`.

## 2. Классификация вариантов

Распарсить имя каждого `COMPONENT` в набор props (`Device, Shape, Size, Text, Style, State, Selected`).

- `{dim}`: **iPhone→`phone`, iPad→`tablet`** (desktop в iOS не используется).
- `{size}`: `Default→default, Small→small, Large→large, ExtraSmall→extra-small`.
- тип иконки: **`text-icon`** если `Shape=Rectangle & Text=True`, иначе **`icon-only`**.
- `Style/State/Selected` на размеры НЕ влияют (только цвет) — привязка одинаковая.
- Узлы в варианте: `icon` (INSTANCE), `Circle` (FRAME, у круглых с заливкой), `_compensation` (INSTANCE, у text-icon).

## 3. Правила привязки (по эталону Lib-Web `e72TWMOh7ibwauqgKwLnC9` / Button `26093:350409`)

Привязываем свойства, которыми владеет компонент. Значение токена может отличаться от кастома — тогда вид
меняется (см. «Главный принцип»). Карта «какое свойство → какой токен»:

| Случай | Что привязать |
|---|---|
| **Rectangle text-icon** | container: `height`→`control.{s}.height.{d}`; 4 угла→`control.{s}.radius.{d}`; `paddingLeft/Right`→`control.{s}.text-icon.padding-horizontal.{d}`; `itemSpacing`→`control.{s}.text-icon.gap-horizontal.{d}`. icon w+h→`control.{s}.text-icon.icon-size.{d}` |
| **Rectangle icon-only** | container: `height`, 4 угла radius, `paddingLeft/Right`→`control.{s}.icon-only.padding-horizontal.{d}`, `layoutSizingHorizontal='HUG'`. icon w+h→`control.{s}.icon-only.icon-size.{d}`. (Progress-состояние: `itemSpacing` icon↔спиннер → `control.{s}.text-icon.gap-horizontal.{d}`) |
| **Круг со слоем «Circle»** | Circle: w+h→`control.{s}.height.{d}`; 4 угла→`corner-radius/round`. container `itemSpacing`: Circle →`…gap-horizontal`, Circle ↓ →`…gap-vertical`. icon w+h→`control.{s}.icon-only.icon-size.{d}` |
| **Контейнер-круг (нет слоя «Circle»), Text=False** | container сам круг: w+h→`control.{s}.height.{d}`; 4 угла→`corner-radius/round`. icon→`control.{s}.icon-only.icon-size.{d}` |
| **Контейнер-круг Text=True (Ghost, вертик.)** | container: только `width`→`control.{s}.height.{d}` (диаметр), `itemSpacing`→`…gap-vertical`; height НЕ вяжем (hug). icon→icon-only icon-size |
| **compensation** (`_compensation`) | РАСПРИВЯЗАТЬ: `setBoundVariable('width', null)` → хардкод 4px |

**Перед привязкой w/h любого узла:** `if('constrainProportions' in n) n.constrainProportions=false;` — иначе привязка
одной оси сбрасывает другую. Если узел не FIXED по нужной оси, выставить `layoutSizing* = 'FIXED'` до bind.

## 4. Применение

Через `use_figma`, **порциями ≤120–130 узлов на вызов** (большие наборы рвут соединение), идемпотентно
(skip если уже привязано к нужной локальной переменной), всегда `return { done, remaining, missing, errors }`.
Шаблон одной группы:

```js
const SIZE={Default:'default',Small:'small',ExtraSmall:'extra-small',Large:'large'};
const allVars=await figma.variables.getLocalVariablesAsync();
const map={}; for(const v of allVars) if(v.name.startsWith('control/')) map[v.name]=v;
const set=await figma.getNodeByIdAsync('SET_NODE_ID');
let done=0, remaining=0, missing=new Set(), errors=[]; const LIMIT=130;
for(const c of set.children){
  if(c.type!=='COMPONENT') continue;
  const p=Object.fromEntries(c.name.split(', ').map(s=>s.split('=')));
  // ... фильтр группы по p.Shape/p.Text ...
  if(done>=LIMIT){ remaining++; continue; }
  const dim=p.Device==='iPhone'?'phone':'tablet'; const s=SIZE[p.Size];
  const v=map[`control/${s}/.../${dim}`]; if(!v){ missing.add(...); continue; }
  try{ /* constrainProportions=false; setBoundVariable(...) */ done++; }catch(e){ errors.push(c.id+': '+e.message); }
}
return { done, remaining, missing:[...missing], errors };
```

Привязка одной переменной: `node.setBoundVariable('height'|'width'|'itemSpacing'|'paddingLeft'|'paddingRight'|'topLeftRadius'|'topRightRadius'|'bottomLeftRadius'|'bottomRightRadius', variable)`. Радиус = 4 угла отдельно (единого `cornerRadius` для bind нет).

## 5. Аудит (обязательный финал)

Проверяет ПОЛНОТУ привязок per-variant И отсутствие remote-привязок (bound id не в локальном наборе),
кроме намеренного `corner-radius/round`. **Явно проверять привязку самого контейнера у контейнер-кругов** —
иначе хардкод-контейнеры с привязанной иконкой проскочат.

```js
const local=new Set((await figma.variables.getLocalVariablesAsync()).map(v=>v.id));
const set=await figma.getNodeByIdAsync('SET_NODE_ID');
const problems={}; const add=(t,n)=>(problems[t]=problems[t]||[]).push(n);
for(const c of set.children){ if(c.type!=='COMPONENT')continue;
  const p=Object.fromEntries(c.name.split(', ').map(s=>s.split('=')));
  const cb=c.boundVariables||{}, icon=c.findOne(n=>n.name==='icon'), circle=c.findOne(n=>n.name==='Circle');
  const comp=c.findOne(n=>n.name==='_compensation'), hasLabel=c.children.length>=2;
  if(icon){const ib=icon.boundVariables||{}; if(!(ib.width&&ib.height))add('iconUnbound',c.name); else if(!local.has(ib.width.id))add('iconRemote',c.name);}
  if(comp&&comp.boundVariables&&comp.boundVariables.width) add('compStillBound',c.name);
  if(p.Shape==='Rectangle'){ if(!cb.height)add('rectNoHeight',c.name); if(!cb.topLeftRadius)add('rectNoRadius',c.name);
    if(!cb.paddingLeft)add('rectNoPadding',c.name); if(p.Text==='True'&&!cb.itemSpacing)add('rectNoGap',c.name);
    if(p.Text==='False'&&c.layoutSizingHorizontal!=='HUG')add('iconOnlyNotHug',c.name); }
  else { if(circle){const sb=circle.boundVariables||{}; if(!(sb.width&&sb.height))add('circleNoWH',c.name);
      if(!sb.topLeftRadius)add('circleNoRadius',c.name); if(hasLabel&&!cb.itemSpacing)add('circleNoGap',c.name); }
    else { if(p.Text==='False'){ if(!(cb.width&&cb.height))add('ccNoWH',c.name); if(!cb.topLeftRadius)add('ccNoRadius',c.name); }
      else { if(!cb.width)add('ccTrueNoWidth',c.name); if(hasLabel&&!cb.itemSpacing)add('ccTrueNoGap',c.name); } } }
}
return { ok:Object.keys(problems).length===0, problems:Object.fromEntries(Object.entries(problems).map(([k,v])=>[k,{n:v.length,ex:v.slice(0,2)}])) };
```

После аудита — `node.screenshot()` для визуального контроля: убедиться, что **ничего не сломалось** (контент не
обрезан, не разъехался). Вид при этом МОЖЕТ измениться (геометрия подтянулась к токену) — это норма, не ошибка.

## 6. Грабли

- **Remote-переменные библиотеки без суффикса** (`control/default/height` вместо `…/phone`) — их НЕТ в
  `getLocalVariablesAsync()`. Идемпотентный skip «уже привязано» их не перебивает → принудительно
  перепривязать к локальным `…/{dim}`. Ловить аудитом (bound id не в локальном наборе).
- **`constrainProportions=true`** → привязка одной оси сбрасывает другую; снять до bind.
- **Контейнер-круги** (нет слоя «Circle») легко пропустить — проверять привязку самого контейнера.
- Набор может НЕ содержать токен (напр. `extra-small … gap-vertical` отсутствует намеренно — нет инстансов) →
  не считать пробелом, логировать в `missing`, не падать.
- **Обводка фокуса (focus ring) с per-side weight**: у колец обычно индивидуальные веса сторон. Единый
  `setBoundVariable('strokeWeight', v)` молча НЕ срабатывает (без ошибки, без эффекта). Привязывать
  `strokeTopWeight/strokeRightWeight/strokeBottomWeight/strokeLeftWeight` по отдельности.
- **Высота HUG-фрейма**: если контейнер — HORIZONTAL auto-layout с HUG по вертикали, привязать `height` нельзя
  «как есть». Сначала `c.counterAxisSizingMode='FIXED'` (вертикаль = counter axis у горизонтального layout),
  затем `c.setBoundVariable('height', …)`. На top-level варианте набора `layoutSizingVertical` использовать
  нельзя (он ребёнок COMPONENT_SET).
- **Вертикальные паддинги при привязанной высоте**: когда `height` привязан к токену и выравнивание `CENTER`,
  верх/низ паддинги (`paddingTop/paddingBottom`) избыточны — обнулять (=0). Высота фиксированная, контент
  центрируется, вид не меняется. (Правило введено пользователем для TV.)

## 6a. Специфика TV-файла (`YuzCoGu1w129EUjEuK8DPF`)

- Коллекция компонентных переменных: **«Component TV»** `VariableCollectionId:42771:8`, моды
  **Main / Meta / KidsTween** (мода KidsBaby в Figma НЕТ, хотя файл `KidsBaby.json` существует).
- TV-токены **НЕ разбиты по phone/tablet/desktop** — одно значение на мод. Имя без суффикса размерности:
  `control/{size}/{type}/{prop}` (напр. `control/default/text-icon/padding-horizontal`, `control/default/height`).
- Слои в варианте: иконка — **«Иконка»** (кириллица), кольцо фокуса — инстанс **«Focus»** или
  **«Base - Focus Frame»**, компенсация — **«.icon-compensation-padding»**.
- Круги без отдельного слоя «Circle» (сам контейнер круглый): радиус → remote
  `corner-radius/round` (`VariableID:cb104acf6d16c3dfcfef6636080f3f5d4ea92681/3610:855`, =9999).
- Кольцо фокуса круга → `control/focus/round/radius` (=9999); прямоугольное → `control/focus/{size}/radius`;
  ширина обводки у всех → `control/focus/{size}/width`.
- Workflow заведения новых токенов: правка JSON в `themes/Component/TV/*.json` → **коммит+push прямо в main, без
  PR** → пользователь сам реэкспортирует через Token Studio (создаёт Figma-переменную) → только потом привязка.

## 7. Другие компоненты

Таблицы выше — для группы `control.*` (Button-семейство). Для иных групп (`rail.*`, `label.*`, cards) метод тот же,
меняется только карта «свойство слоя → группа токена». Зафиксировать новую карту (по эталону Lib-Web) перед привязкой.
