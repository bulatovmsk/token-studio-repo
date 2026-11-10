# Замена legacy-токенов Web

Сопоставление обновлено 10 ноября 2026 года. Пути указаны как в конфиге Token Studio. Таблица описывает миграцию; изменения в код Web ещё не внесены.

| Текущий Web-токен / контекст | Токен из конфига | Короткое пояснение |
|---|---|---|
| `--color-gradient-featured` | `color.component.rail.card.fade.bottom.third` | Фейд карточки, максимум 50%. |
| `--color-gradient-featured-kids` | `color.component.rail.card.fade.bottom.third` | В Kids — чёрный, в KidsLight — iris1300. |
| `--color-vertical-gradient-banner` | `color.fill.fade.bottom.secondary` | Обычный фейд баннера, адаптируется к теме. |
| `--color-horizontal-gradient-banner` | `color.fill.fade.left.secondary` | Обычный фейд баннера, адаптируется к теме. |
| `--color-vertical-gradient-banner-light` | `color.fill.fade.bottom.secondary` | Светло-фиолетовый фейд в KidsLight. |
| `--color-horizontal-gradient-banner-light` | `color.fill.fade.left.secondary` | Светло-фиолетовый фейд в KidsLight. |
| `--color-fill-decorative-on-light-skeleton` | `color.fill.technical.skeleton` + `color.fill.technical.skeletonbg` | Блик и подложка состояния загрузки. |
| `--image-placeholder-gradient` | `color.fill.technical.placeholder` | Когда контент отсутствует. Если это состояние загрузки — использовать `color.fill.technical.skeleton` + `color.fill.technical.skeletonbg`. |
| `--image-placeholder-blueberries-light-gradient` | `color.fill.technical.placeholder` | То же разделение состояний, в теме KidsLight. |
| `--color-fill-solid-on-light-third` — secondary-кнопка | `color.component.control.fill.secondary` + `color.component.control.border.secondary` | Заливка и обводка кнопки. |
| `--color-fill-solid-on-light-third` — выбранный фильтр | `color.component.control.fill.selected` | Заливка выбранного состояния. |
| `--color-fill-solid-on-light-third` — строка действия в светлом меню | `color.fill.solid.primary` | Использовать светлый контекст темы. |
| `--color-fill-solid-on-light-third` — контейнер способа оплаты | `color.fill.solid.primary` | Использовать светлый контекст темы. |
| `--color-fill-solid-on-light-positive` | `color.fill.solid.positive` | Унификация положительного статуса. |
| `--color-fill-solid-on-light-negative` | `color.fill.solid.negative` | Унификация отрицательного статуса. |
| `--color-background-sber-primary` | `brand.partners.sber` | Однотонная брендовая заливка вместо старого градиента. |
| `--color-brand-partners-linear-gradient` | `color.component.sber-gradient` | Если вариант используется. Иначе удалить legacy-ветку после проверки потребителей. |

## Правила применения

- Градиенты применять через `background` / `background-image`, не через `background-color`.
- Featured использует компонентный `color.component.rail.card.fade.*`; баннеры — обычные `color.fill.fade.*`. В KidsLight цвет фейда зависит от выбранной роли и отличается от чёрного в тёмных темах.
- Skeleton обозначает загрузку; placeholder — fallback, когда контент отсутствует. Если старый класс используется в обоих состояниях, разделить применение.
- Старый белый токен не заменять глобально одним алиасом: выбирать роль по контексту из таблицы. Цвет текста и иконок согласовать с итоговой заливкой и темой.
- Использовать составные токены градиентов. `Step_*` — вспомогательные цвета для Figma, не ссылки для градиентов в коде.
