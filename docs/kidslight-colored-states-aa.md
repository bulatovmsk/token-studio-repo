# KidsLight: hierarchy of backgrounds, surfaces and controls

The production canvas stays `cobalt200` / `#E6E5F5`. Modal, dialog and sheet
backgrounds stay `violet200` / `#E3DFFE` (glassy: 88%).

## Why the previous palette flattened the UI

The Figma comparison at node `41920:125304` uses fill.primary for the large
island and again for a nested sample. Identical opaque fills cannot separate
from themselves. The previous secondary and third fills were also almost white.
Text contrast passed, but this did not establish a useful surface hierarchy.

This revision applies role separation from
[Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
and [Material color roles](https://m3.material.io/styles/color/roles): backgrounds,
containers, interactive fills, states and borders are separate decisions.
The numerical palette is custom to Okko; it is not a copied Radix scale.

## Surface roles

| Role | Solid | Glassy | Purpose |
|---|---|---|---|
| Primary | white | white 92% | Bright cards and large islands |
| Secondary | lavender100 / #EEEDF2 | cobalt1300 6% | Subtle nested surfaces |
| Third | lavender200 / #DEDAE4 | cobalt1300 16% | Denser controls and unselected segments |
| Fourth | lavender300 / #CDC8D7 | — | Local stronger fill; avoid large areas |

The definitive hex values for lavender100–300 are in Primitives.json. They are
opaque mixes of cobalt1300 (#301A59) over white at 8%, 16% and 24%, respectively.
Glassy variants retain alpha and adapt to the parent. Their solid counterparts
are reference colors on white, not exact matches on every background.

Solid hover: primary uses violet100 → lavender100; secondary uses lavender200;
third uses lavender300. Existing two-stop gradient tokens are retained even
when both stops match, preserving the Tokens Studio/Figma schema.
Glassy hover: secondary uses cobalt1300 at 12% → 16%; third uses 18%.
Hover replaces the normal fill rather than stacking another paint over it.

Ordinary meaningful borders: solid gray800; glassy gray900 85%.
Decorative card contours: cobalt1300 22%. Active and focus remain purple.
The focus ring is 3 px; a white 2 px gap against accent fills is an application
component requirement. Selected keeps violet700 with opaque white text.

## Limits and validation

Do not nest the same opaque fill inside itself and expect a visible boundary.
Use secondary/third inside a primary card, or a contour where the same role is
necessary. A token value cannot change an existing component's role binding.
The linked Figma sample that nests primary inside primary will still merge.

`python3 scripts/check_kidslight_contrast.py` checks 19 parent contexts, alpha
composition, gradient stops, references, focus widths and the fixed canvas.
It also checks a custom 1.10:1 separation floor for card/root and successive
control levels inside cards. This is a design regression guard, not WCAG.

Minimum ratios over tested normal/hover surfaces and supported nesting:

| Pair | Minimum |
|---|---:|
| Primary text | 9.99:1 |
| Secondary text | 7.66:1 |
| Third text | 5.61:1 |
| Accent text | 4.69:1 |
| Status text | 4.61:1 |
| Ordinary solid / glassy boundary | 3.39:1 / 3.89:1 |
| Active boundary | 3.54:1 |
| Focus | 3.67:1 |
| White text on selected / CTA gradient | 5.22:1 |

[WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
requires 3:1 for meaningful UI cues, not every decorative surface pair.
Normal text uses the 4.5:1 threshold. Disabled/decorative colors, arbitrary
images, videos, deeper nesting and actual application interaction are outside
this palette check. It is not an application-wide WCAG certification.

Only KidsLight consumes the three newly added lavender primitives. Other theme
values and the production main background are unchanged.
