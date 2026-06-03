# Design Tokens

Дизайн-токены продукта в формате [Token Studio](https://docs.tokens.studio/). Синхронизируются с Figma Variables через Token Studio Figma plugin.

## Файловое дерево

```
themes/
├── $themes.json              # Список тем и привязок к Figma-коллекциям/модам
├── $metadata.json            # tokenSetOrder — порядок применения наборов
├── Primitives.json           # Атомы: палитра, базовые scale-значения
├── Brand.json                # Бренды (okko/partners/social), ссылается на Primitives
├── Semantic/                 # Продуктовая семантика — используется в вёрстке фич
│   ├── Colors/
│   │   ├── Main.json
│   │   ├── KidsTween.json
│   │   ├── KidsBaby.json
│   │   └── Meta.json
│   └── Numbers/
│       ├── WebMobile/{Main,KidsTween,KidsBaby,Meta}.json
│       └── TV/{Main,KidsTween,KidsBaby,Meta}.json
├── Component/                # Токены компонентов ДС — только внутри ДС-компонентов
│   ├── WebMobile/{Main,KidsTween,KidsBaby,Meta}.json
│   └── TV/{Main,KidsTween,KidsBaby,Meta}.json
├── Technical(iOS)/           # Типографика и spec'ы под iPhone/iPad
├── Technical(Android M)/     # То же под Android (Phone/Tablet P/L)
├── Technical(TV)/            # То же под TV
└── Microcopy/                # Локализованные тексты экранов
    ├── RU.json
    └── ID.json
```

## Слои токенов

Цепочка наследования (каждый следующий слой ссылается на предыдущий):

```
Primitives → Brand → Semantic → Component
                          └──► Technical (платформенные уточнения)
```

| Слой | Что внутри | Потребитель |
|---|---|---|
| **Primitives** | Атомарные цвета (`white`, `gray1000`, `electric600`, …), базовые scale-значения (`corner-radius.base`, `spacing.base`) | Не используется напрямую — только через Brand/Semantic |
| **Brand** | Бренд-уровневые алиасы поверх Primitives | Не используется напрямую |
| **Semantic / Colors** | Палитра по темам: `text-icon.primary`, `background.solid.primary`, `border.focus`, градиенты, технические цвета | Вёрстка фич |
| **Semantic / Numbers** | Шкалы `corner-radius.*`, `spacing.*`, `screen-padding.*`. Отдельные шкалы для Web&Mobile и TV (разные продукты) | Вёрстка фич |
| **Component** | Размеры и отступы конкретных компонентов ДС: `control.*.{height,padding,gap,radius}`, `label.*` | Только внутри ДС-компонентов |
| **Technical** | Типографика и spec'ы под устройства | Платформенный код |
| **Microcopy** | Локализованные строки | UI-копии |

## Темы

В каждой из 5 коллекций (см. ниже) присутствуют **четыре** темы с одинаковыми именами:

| Тема | Описание |
|---|---|
| `Main` | Основная тёмная тема продукта |
| `KidsTween` | Детский продукт, тёмная палитра |
| `KidsBaby` | Детский продукт, светлая палитра |
| `Meta` | Глобальный редизайн (закруглённые контролы, `control.*.radius=999`) |

Каждая тема существует во всех слоях. На Semantic/Component-слоях Kids- и Meta-варианты пока являются клонами Main (placeholder) — дизайнер заполнит значения позже.

## Figma-коллекции

5 коллекций Figma Variables, каждая хранит свои 4 мода (по числу тем):

| Группа в `$themes.json` | `$figmaCollectionId` | Что внутри |
|---|---|---|
| **Color** | `32029:3918` | Палитра тем (Semantic/Colors/*) |
| **Semantic W&M** | `2286:157338` | Числовые шкалы для Web/Mobile (Semantic/Numbers/WebMobile/*) |
| **Semantic TV** | `859:9314` | Числовые шкалы для TV (Semantic/Numbers/TV/*) |
| **Component W&M** | `45163:17134` | Размеры ДС-компонентов для Web/Mobile (Component/WebMobile/*) |
| **Component TV** | новая на push | Размеры ДС-компонентов для TV (Component/TV/*) |

## `$themes.json` и `$metadata.json`

- **`$themes.json`** — массив тем. Каждая запись содержит: `name`, `group`, `selectedTokenSets` (какие файлы включены/source-only/disabled), `$figmaCollectionId`, `$figmaModeId`, `$figmaVariableReferences` (mapping `token.path → Figma variable id`). Этот файл генерируется/обновляется Token Studio plugin при синке с Figma.
- **`$metadata.json`** — `tokenSetOrder`: порядок применения token-sets. Важен, поскольку зависимости через `{primitives.white}` резолвятся в этом порядке.

Оба файла критичны для плагина — править руками только осознанно.

## Контракт `Color/Main` — не трогать

Запись `Color/Main` в `themes/$themes.json` имеет:
- `$figmaCollectionId: "VariableCollectionId:32029:3918"`,
- `$figmaModeId: "32029:4"`,
- **180** `$figmaVariableReferences` (mapping token-путей на конкретные Figma-переменные).

Эти поля **нельзя менять**. Любое изменение приведёт к тому, что Token Studio plugin при push пересоздаст все 180 цветовых переменных в Figma как новые, и вся вёрстка фич, использующая Main-Dark цвета, отвалится.

Аналогично нельзя менять пути ключей внутри `themes/Semantic/Colors/Main.json` (`color.text-icon.primary` → удалить или переименовать = поломать var-ref в `$themes.json`).

## Workflow

1. **Pull**: открыть Figma → Token Studio plugin → Sync → Pull from GitHub. Плагин зальёт в Figma актуальные значения переменных и стили.
2. **Edit**: править токены либо в плагине (UI), либо напрямую в JSON через PR.
3. **Push**: из плагина → Push to GitHub → создать ветку → PR. Плагин обновит `$themes.json` (новые `$figmaModeId` / `$figmaVariableReferences` при необходимости).
4. **Review**: проверить diff. Для записи `Color/Main` `$figma*` поля **должны быть нулевыми** в diff.
5. **Merge**: после ревью смерджить в `main`.

## Как добавить новый токен

1. Определить **слой**:
   - Используется в вёрстке фичи? → `Semantic/Colors/` или `Semantic/Numbers/`.
   - Используется только внутри компонента ДС? → `Component/{WebMobile,TV}/`.
2. Открыть JSON-файлы соответствующего слоя **во всех 4 темах** и добавить токен с одинаковым путём (`color.fill.solid.new-token`).
3. Значения задать через ссылки на Primitives/Brand (`{primitives.electric600}`).
4. Push через плагин → Figma создаст новую переменную, обновит `$figmaVariableReferences` в нужных записях `$themes.json`.

## Как добавить новую тему

1. Создать 5 новых json-файлов — по одному в каждой коллекции — как клоны соответствующих Main:
   - `themes/Semantic/Colors/<NewTheme>.json`
   - `themes/Semantic/Numbers/{WebMobile,TV}/<NewTheme>.json`
   - `themes/Component/{WebMobile,TV}/<NewTheme>.json`
2. В `themes/$themes.json` добавить 5 записей `<NewTheme>` — по одной в каждой из 5 групп. Скопировать `$figmaCollectionId` и `$figmaVariableReferences` из Main соответствующей группы; `$figmaModeId: ""` — плагин создаст новый мод на push.
3. Добавить пути новых файлов в `themes/$metadata.json` → `tokenSetOrder`.
4. Push в Figma — плагин создаст новый мод в каждой коллекции.
