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
| hover-focus.secondary | iris1300 | 0% → 16% | regular dark text |
| hover-focus.third | iris1300 | 0% → 20% | regular dark text |
| inverse.primary | iris1200 | 92% | inverse light text |
| inverse.third | iris1200 | 84% | inverse light text |
| inverse.fourth | iris1200 | 76% | inverse light text |
| negative | red1000 | 8% | text-icon.negative |
| warning | yellow1100 | 8% | text-icon.warning |

Ordinary fills form one subtle darkening scale. Primary no longer whitens the
parent. These are alternative strengths on a parent, not mandatory nesting
levels. A raised white card uses solid.primary. Alpha accumulates when fills
are nested; deeper nesting and arbitrary images need contextual checks.

Hover matches the user reference Figma 41945:35375: 45deg iris1300,
transparent at the first stop and 20% at the second for third. Secondary uses
0–16%. The normal fill is disabled/replaced, not stacked underneath. The first
edge intentionally merges with the parent. Focus uses its dedicated border.

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
common parent progressively. Hover endpoints match the approved reference;
there is no requirement to brighten or darken the entire surface uniformly.
The 1.05:1 neighboring Rest-level floor is a custom design guard, not WCAG.
Solid surfaces retain their separate 1.10:1 hierarchy guard.

Ordinary primary/secondary/third/accent text passes 4.5:1 on checked hover
surfaces. Status text is checked on normal and status-specific surfaces.
Limitation: status/offer text on deeply nested approved hover can fall below
4.5:1 (about 3.9:1). Use ordinary primary text for these buttons; do not claim
that all status text works on this hover. The validator reports this limitation.
Inverse text on glassy inverse surfaces remains at least 6.90:1.

The tests cover the main and modal backgrounds, optional solid/glassy primary
islands and secondary cards, controls and hover, including cumulative alpha.
They do not certify arbitrary image/video backdrops, deeper nesting,
disabled/decorative colors or application behavior. Identical opaque fills
nested together still need another role or contour.

References: [Radix role separation](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale),
[WCAG meaningful UI contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Solid hover gradients now preserve opaque role hierarchy: primary white →
iris100, secondary iris100 → iris200, third iris200 → iris300 (45deg, 100%
opacity at both stops). Glassy hover keeps the approved transparent iris1300
ramps: secondary 0–16%, third 0–20%. Rest glassy primary/secondary/third remain
4/8/12%; there is no separate glassy-primary hover token in the current schema.

## Overlay correction (current behavior)

Hover is an additional paint ABOVE Rest, not a replacement. This supersedes
all earlier replacement-style hover descriptions in this document.
Both solid and glassy hover paints are transparent iris1300 gradients at 45deg:
solid primary 0–4%, secondary 0–6%, third 0–8%; glassy secondary 0–6%, third 0–8%.
The solid/glassy names describe the underlying Rest family, not hover opacity.
Reduced overlay alpha accounts for the existing Rest tint. Figma components
must retain their Rest paint beneath the hover style/layer. Applying the hover
style as the sole fill does not demonstrate the intended result.

The validator now composes parent → matching Rest → hover → foreground,
including nested containers, and checks transparent endpoints preserve Rest.
Existing status-text limitations are reported explicitly. No background,
Rest, button or unrelated token values changed in this correction.
