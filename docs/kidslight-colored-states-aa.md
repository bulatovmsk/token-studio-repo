# KidsLight: iris surfaces and transparent fills

All backgrounds and fades remain unchanged. Primary is cobalt200 (#E6E5F5),
secondary is violet200 (#E3DFFE). The Kids button, label colors, text, borders
and all solid fills are unchanged by this glassy revision.

## Glassy roles

| Token | Base | Alpha | Foreground |
|---|---|---:|---|
| primary | iris1100 | 4% | regular dark text |
| secondary | iris1100 | 8% | regular dark text |
| third | iris1100 | 12% | regular dark text |
| hover-focus.secondary | iris1100 | 10% | regular dark text |
| hover-focus.third | iris1100 | 14% | regular dark text |
| inverse.primary | iris1200 | 92% | inverse light text |
| inverse.third | iris1200 | 84% | inverse light text |
| inverse.fourth | iris1200 | 76% | inverse light text |
| negative | red1000 | 8% | text-icon.negative |
| warning | yellow1100 | 8% | text-icon.warning |

Ordinary fills form one subtle darkening scale. Primary no longer whitens the
parent. These are alternative strengths on a parent, not mandatory nesting
levels. A raised white card uses solid.primary. Alpha accumulates when fills
are nested; deeper nesting and arbitrary images need contextual checks.

Hover replaces the normal paint, not an extra paint above it. Both stops are
identical to retain the existing gradient-token schema without introducing an
unnecessary gradient. Focus still requires border.focus.

Inverse now consistently means a dark surface for light text. This changes
inverse.third/fourth from weak overlays to readable dark containers. Components
using those tokens as subtle scrims must instead use the appropriate overlay
role; this repository does not contain application bindings. They should not
continue using regular dark text on these newly dark surfaces.

Status fills are subtle signals, paired with semantic text/icons or meaningful
borders. They are not standalone contrast-bearing state indicators.

## Retained palette

Solid secondary/third/fourth use iris100/200/300; selected iris800; accent/focus
iris900; accent text iris1100. Indigo is reserved for the unchanged dark-Kids
button: amethyst800 → iris800 → iris800 → indigo700 at 0/16/82/100%, 135deg.
Continuum uses iris700 and Lighthouse amethyst700, one step lighter than Kids.
Shared primitive values remain unchanged.

## Validation

`python3 scripts/check_kidslight_contrast.py` checks all references, composite
and split gradients, transparency throughout glassy, parent composition,
normal/inverse/status text, borders and focus. Ordinary glassy levels darken a
common parent progressively; hover increases density. The 1.05:1 neighboring
level floor is a custom design regression guard, not a WCAG requirement.
Solid surfaces retain their separate 1.10:1 hierarchy guard.

Across checked combinations, normal readable text is at least 4.60:1;
inverse text on glassy inverse surfaces is at least 6.90:1. Status text on
tinted fills is at least 5.06:1. White button text remains 5.00:1.

The tests cover the main and modal backgrounds, optional solid/glassy primary
islands and secondary cards, controls and hover, including cumulative alpha.
They do not certify arbitrary image/video backdrops, deeper nesting,
disabled/decorative colors or application behavior. Identical opaque fills
nested together still need another role or contour.

References: [Radix role separation](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale),
[WCAG meaningful UI contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
