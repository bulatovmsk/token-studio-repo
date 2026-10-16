# KidsLight: iris-based surfaces

All background tokens are unchanged from commit 422c727. In particular,
background.solid.primary remains cobalt200 (#E6E5F5); background.glassy.primary
and every fade token are unchanged. Secondary remains violet200 (#E3DFFE).

## Roles

- Solid primary: white; secondary/third/fourth: iris100/200/300.
- Glassy primary: white 92%; secondary/third: iris1200 at 6%/16%.
- Glassy hover: iris1200 at 12–16% for secondary, 18% for third.
- Solid hover: iris100 → iris100; iris200; iris300.
- Selected: iris800. Accent/focus: iris900. Accent text: iris1100.
- Solid inverse and promo: iris1200. Glassy inverse primary: iris1200 92%.
- Weak inverse third/fourth remain 30%/10% layers: use dark regular text on them,
  not white inverse text. These are not standalone dark surfaces.
- Readable inverse text: white 100%/98%/96%; fourth (40%) is disabled/decorative.
- Ordinary borders: iris1200 opaque/85%; contour: iris1200 22%.
- Technical placeholder: iris100. Skeleton background and loading tint use
  iris1200; white shimmer/materials remain neutral.
- Status colors, named decorative label palettes, brand progress gradient and
  partner colors retain their purpose. Static black/white stay theme invariant.
- Shadows and decorative focus use iris. Decorative gradients do not replace
  the dedicated contrast-bearing focus indicator.

The main button is copied exactly from dark Kids, including its four split
stops: 135deg, amethyst800 0%, iris800 16%, iris800 82%, indigo700 100%.

No shared primitive values are changed. Earlier lavender primitives remain for
compatibility but are no longer consumed by KidsLight. No new primitives added.

## Audit and validation

`python3 scripts/check_kidslight_contrast.py` resolves all 228 semantic tokens,
checks every composite/split gradient (including borders, fades and components),
alpha composition across 19 supported contexts, normal and inverse text,
status pairs, ordinary/active/status borders, focus and surface hierarchy.
The previously mismatched decorative focus gradient and split stops are fixed.

Normal readable text reaches at least 4.56:1 in checked surface combinations.
Inverse text reaches at least 4.75:1 on checked dark/accent surfaces.
Opaque white text on the imported Kids button reaches 5.00:1 across the gradient.
Ordinary borders: at least 5.28:1; active border: 3.88:1; focus: 3.87:1.
Status fills require the checked foreground: dark primary on positive/negative/
warning; white inverse primary on live. Low-alpha status borders are decorative.

The 1.10:1 surface hierarchy floor is a design regression guard, not a WCAG
criterion. Identical opaque primary fills nested inside themselves still need
a different role or contour. Arbitrary images/video, deeper nesting,
disabled/decorative colors and application behavior need contextual validation.
This is not application-wide WCAG certification.

References: [Radix role separation](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale),
[WCAG meaningful UI contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Continuum and Lighthouse follow dark Kids with one lighter step: iris700 and
amethyst700 (instead of 800). Opaque white label text is contrast-tested.
Indigo is used only in the unchanged Kids button. All backgrounds stay unchanged.
