# Сопоставление оставшихся legacy-токенов Web

26 октября 2026 года. Три согласованных статичных фейда добавлены в конфигурацию всех четырёх цветовых тем. Существующие значения, mappings и код продукта не изменены; экспорт новых токенов в Figma не выполнялся.

Основание: четыре предоставленных скриншота, актуальная рабочая копия `themes/`, локальная копия Web `/Users/r.bulatov/web-dev@76164bab906/apps/web`, вычисленные стили и видимая детская витрина https://okko.tv/kids, первый вопрос https://okko.tv/quiz/quiz-ff-volshebnye-slova.

Прямое чтение Figma-файлов из документов репозитория недоступно по правам; наличие и значения предлагаемых существующих токенов подтверждены JSON, а не свежим чтением Figma. На проде профиль уже авторизован. Открытие https://okko.tv/ перенаправляет в Kids; основная витрина отдельно не проверена. Ответы в квизе, покупка, СберПрайм, мобильные размеры и применение новых токенов на проде не проверялись.

## Правило миграции

Выбирать по роли и контексту темы. Совпадение HEX в одной теме не делает токены взаимозаменяемыми. Картинка с белой метой, фейд в фон страницы, заглушка изображения и выбранный контрол — разные роли.

Имена ниже — пути Token Studio. При экспорте в Figma точки становятся разделителями групп. Три новых `color.static.fade.black.*` и цвета их точек уже добавлены в JSON. Число новых ролей не включает вспомогательные переменные цветов шагов градиента.

## Полное сопоставление: 14 старых токенов

| Старый CSS-токен | Предложение | Условия / отличия |
| --- | --- | --- |
| `--color-gradient-featured` | `color.static.fade.black.bottom.fourth` | Чёрный фейд во всех темах. Максимум alpha 24%; проверить читаемость меты на светлых обложках. |
| `--color-gradient-featured-kids` | `color.static.fade.black.bottom.fourth` | Чёрный фейд сохраняется в светлой и тёмной темах. Локальное переключение темы слоя не требуется. |
| `--color-vertical-gradient-banner` | `color.static.fade.black.bottom.secondary` | Чёрный фейд под светлым текстом. Максимум alpha 80%; геометрия соответствующего Main secondary сохранена. |
| `--color-horizontal-gradient-banner` | `color.static.fade.black.left.secondary` | Чёрный фейд под светлым текстом. Максимум alpha 80%; геометрия соответствующего Main secondary сохранена. |
| `--color-vertical-gradient-banner-light` | Белый текст: `color.static.fade.black.bottom.secondary`; тёмный текст: `color.fill.fade.bottom.secondary` в KidsLight | Выбор определяется оформлением текста баннера. |
| `--color-horizontal-gradient-banner-light` | Белый текст: `color.static.fade.black.left.secondary`; тёмный текст: `color.fill.fade.left.secondary` в KidsLight | Выбор определяется оформлением текста баннера. |
| `--color-fill-decorative-on-light-skeleton` | Существующий `color.fill.technical.skeleton`; подложка — `color.fill.technical.skeletonbg` | Для состояния загрузки. Не заменять на placeholder. Если этот же CSS-фон остаётся при отсутствии контента, выделить отдельное fallback-состояние с `technical.placeholder`. |
| `--image-placeholder-gradient` | Разделить по состоянию: загрузка → `color.fill.technical.skeleton` / `skeletonbg`; нет контента → `color.fill.technical.placeholder` | Имя старой переменной не доказывает fallback-роль. Например, у аватара класс фона назначается постоянно, поэтому виден и до загрузки, и при отсутствии изображения. Нужен выбор по состоянию, а не общий алиас. |
| `--image-placeholder-blueberries-light-gradient` | То же разделение состояний, мод KidsLight | Отдельный детский градиент не нужен, если оформление состояний унифицируется. В загрузке использовать skeleton, в fallback — placeholder. |
| `--color-fill-solid-on-light-third` | Разделить вызовы между существующими ролями | Secondary-кнопка → `color.component.control.fill.secondary` + `border.secondary`; выбранная роль фильтра → `color.component.control.fill.selected`; строки меню «+» → обычная заливка пункта/айленда `color.fill.solid.primary`; контейнер способа оплаты → `color.fill.solid.primary` в светлом контексте. Не назначать один новый алиас всем вызовам. |
| `--color-fill-solid-on-light-positive` | Существующий `color.fill.solid.positive` | Согласовано: унифицировать со статусной палитрой темы. Отдельный токен квиза не нужен. |
| `--color-fill-solid-on-light-negative` | Существующий `color.fill.solid.negative` | Согласовано: унифицировать со статусной палитрой темы, включая более тёмный negative в Main. Отдельный токен квиза не нужен. |
| `--color-background-sber-primary` | Существующий `brand.partners.sber` | По уточнению пользователя использовать брендовый токен Сбера. Значение `#148F2B`: вместо отдельного тёмно-зелёного градиента будет однотонная брендовая заливка. Новый токен не нужен. |
| `--color-brand-partners-linear-gradient` | Если вариант используется: существующий `color.component.sber-gradient`. Если не используется: удалить legacy-ветку после проверки потребителей | Новый радужный токен не нужен. В локальном Web есть CSS-вызовы и enum-вариант `SBER_BUTTON_GRADIENT`, но статических потребителей варианта не найдено. Это кандидат на удаление, а не доказанно мёртвый CSS. |

## Добавленные статичные фейды

В Main, Kids, KidsLight и Meta добавлены три одинаковых составных градиента:

- `color.static.fade.black.bottom.fourth`: 0deg, максимум alpha 24%.
- `color.static.fade.black.bottom.secondary`: 0deg, максимум alpha 80%.
- `color.static.fade.black.left.secondary`: 90deg, максимум alpha 80%.

В каждом градиенте 16 точек. Составные значения напрямую используют `{primitives.black}` с заданной прозрачностью. Отдельные `gradient.static.fade.black.<direction>.<level>.Step_*` предназначены только для Figma и повторяют цвета точек; составные градиенты на них не ссылаются. Углы, позиции и alpha-кривая совпадают с соответствующими фейдами Main на момент добавления. Ссылок на адаптивную семантику нет; KidsLight сохраняет чёрный фейд без локального переключения темы.

Эти фейды предназначены для светлого текста поверх изображения/видео. Для светлого баннера с тёмным текстом сохраняется адаптивный `color.fill.fade.*` в KidsLight. Новые градиенты и точки добавлены только в JSON; синхронизация с Figma и миграция Web ещё не выполнены.

## Квиз: согласована унификация

Решение пользователя: использовать существующие `color.fill.solid.positive` и `color.fill.solid.negative`. Отдельные компонентные токены квиза не добавлять; значения общей палитры не изменять. Для белого текста вертикальный фейд баннера унифицирован на новом `color.static.fade.black.bottom.secondary`; СберПрайм использует существующий брендовый токен. Остальные предложения по градиентам рассматриваются отдельно.

| Старый CSS-токен | Замена |
| --- | --- |
| `--color-fill-solid-on-light-positive` | `color.fill.solid.positive` |
| `--color-fill-solid-on-light-negative` | `color.fill.solid.negative` |

Итоговые цвета зависят от выбранного контекста темы:

| Тема | Positive | Negative |
| --- | --- | --- |
| Main / Kids / Meta | `#12B77C` | `#94000A` |
| KidsLight | `#6FCA9D` | `#DD453B` |

Первый экран прод-квиза имеет самостоятельную фиолетовую подложку и белые подписи, а CSS-переменные `positive/negative-v2` наследуют KidsLight. При миграции явно учитывать выбранный контекст. Более тёмный negative в Main — принимаемое следствие унификации. `color.component.control.fill.negative` для этой замены не использовать: он полупрозрачный и описывает другую роль.

Цвет текста результата подобрать к заливке. Для непрозрачного positive в Main белый/96% даёт 2.50:1, чёрный/96% — 7.82:1; для negative в Main белый/96% даёт 8.59:1. В KidsLight чёрный/96% даёт 10.17:1 на positive и 4.87:1 на negative. Существующие роли: Main positive → `text-icon.inverse.primary`, Main negative → `text-icon.primary`; KidsLight оба результата → `text-icon.primary`. Белые подписи default-состояния механически не менять.

Эти числа относятся к сплошным заливкам. Полупрозрачную подсветку картинки, pulse-анимацию и `bgAbove` проверить на итоговом наложении при реализации.

## Баннер и Featured: статичные фейды

Под белым текстом использовать `color.static.fade.black.bottom.secondary` либо `color.static.fade.black.left.secondary` по направлению баннера. Под белой метой Featured — `color.static.fade.black.bottom.fourth`. Значения чёрные во всех четырёх модах; отдельно проверить переход с картинки на видео.

Текущий светлый детский баннер в Web использует тёмную мету и описание (`MetaVariant.Blueberry` и `.metaBlueberryLight .promoText`). Для такого оформления подходит адаптивный светлый `color.fill.fade.*` в KidsLight. Перевод этого оформления на статичный чёрный фейд требует согласованного светлого текста и подходящих контролов.

Принимается кривая существующего Main вместо старых плато, смещённых точек и диагонали горизонтального градиента. Читаемость текста на реальных обложках проверить после миграции на mobile и tablet/desktop. Проверка произвольных изображений не покрывается валидацией JSON.

## Заглушка и скелетон

Уточнение владельца дизайн-системы от 26 октября: `color.fill.technical.placeholder` — fallback, когда контент не пришёл; это не подложка состояния загрузки. `color.fill.technical.skeleton` — оформление загрузки, `color.fill.technical.skeletonbg` — его подложка. Новые токены для этих ролей не нужны.

| Состояние | Роль |
| --- | --- |
| Контент загружается | `technical.skeleton` и, при необходимости, `technical.skeletonbg` |
| Контента нет / загрузка завершилась без контента | `technical.placeholder` |
| Контент успешно загружен | Контент; фон состояния загрузки убрать |

Старые классы местами не различают эти состояния. В `CardPicture` фон контейнера назначается независимо от наличия изображения и убирается после onLoad только при `useTransparentBackground`; у `ProfileAvatar` класс placeholder назначен постоянно, а изображение добавляется отдельно. Поэтому по одному CSS-вызову нельзя установить, что это исключительно загрузка или исключительно fallback. При миграции разделить состояния компонента.

Описание `technical.placeholder` в текущем Main JSON говорит о загружаемом контенте и расходится с уточнённым назначением. Его следует актуализировать отдельно; в рамках этого предложения JSON не изменён. У `technical.skeleton` в Main первые две точки стоят на 0%; production-анимацию отдельно проверить, сохраняя саму skeleton-роль.

## Особенности белой заливки

В KidsLight `control.fill.secondary` — белый/92% с компонентной обводкой; `control.fill.selected` — `iris800 / #5B40ED`; обычный `fill.solid.primary` — непрозрачный белый. Это три разных роли, хотя старый код местами использовал одну белую переменную. Цвет текста и hover должны мигрировать вместе с заливкой; выбранный фильтр в KidsLight станет акцентным с inverse-текстом. В тёмной Main выбранная заливка остаётся белой с тёмным inverse-текстом.

Светлые меню/покупка могут существовать как локальные светлые острова в тёмном продукте. Их нельзя переключить на Main `fill.solid.primary = #101011`, сохранив старый тёмный текст. Сначала назначить контекст и текстовые пары. У `color.component.menu.fill.container` другая роль — контейнер всего меню, не отдельная белая строка действия.

## Сбер

Для `--color-background-sber-primary` использовать существующий `brand.partners.sber = {primitives.external.sber1} / #148F2B` из `themes/Brand.json`. Это унификация фона на однотонном фирменном зелёном, а не сохранение старого тёмного градиента `#3A7166 → #072721`. Отдельный компонентный фон и новые external-примитивы не нужны. Подписи и изображения карточки проверить на новой заливке при реализации.

В той же группе уже есть `brand.partners.sber-gradient` для радужной заливки; не путать его с однотонным `brand.partners.sber`.

Существующий `color.component.sber-gradient` разрешается в `100deg, #A1D809 2%, #30B916 36%, #0C9C0C 66%, #129FE3 100%`. Это фирменная замена радужного legacy-градиента, а не точное совпадение с его семью HSL-точками и углом 110°. В предыдущем аудите репозитория Figma-стиль назывался `color/partners/sber-gradient`; актуальное имя/геометрию в Figma сегодня подтвердить не удалось.

Для объявления legacy-кода мёртвым статического поиска по Web недостаточно: проверить внешних потребителей UI-kit и возможный выбор варианта из конфигурации. Новую копию радуги в любом случае не заводить.

## Источники для реализации

- `themes/Semantic/Colors/{Main,Kids,KidsLight,Meta}.json`, `themes/Brand.json`, `themes/Primitives.json`.
- Web `packages/ui-kit/src/tokens/colors.css`: исходная геометрия градиентов и legacy-значения.
- Web `packages/shared-components/src/featured-element-wrapper/featured-element-wrapper.css`: `.cardFade` занимает нижнюю половину карточки, `.videoFade` — нижние 75%.
- Web `packages/shared-components/src/banner-content/banner-content.css`: разные mobile/tablet-градиенты и светлые переопределения.
- Web `packages/ui-kit/src/quiz-button/components/base-button/base-button.css`: состояния correct/wrong, pulse, `bgAbove`.
- Web `packages/ui-kit/src/button/button.css`, `packages/filter/components/filter-common/components/role-item/role-item.css`, `packages/shared-components/src/more-button/components/content/content.css`, `packages/ui/kit/purchase-modal/product-selector/collapse.css`: различные роли старого белого токена.
- Web `packages/ui/kit/profile-avatar/profile-avatar.css` и остальные перечисленные на скриншотах потребители placeholder.

Проверены существование всех указанных текущих путей, разрешённые значения нужных цветов во всех четырёх темах и контраст названных непрозрачных статусных заливок. Предложение не является проверкой уже мигрированного интерфейса. `themes/$themes.json`, идентификаторы и mappings не изменялись.
