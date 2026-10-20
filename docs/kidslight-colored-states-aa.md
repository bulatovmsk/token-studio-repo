# KidsLight: opaque mixtures of existing primitives

The muted appearance approved in screenshot 1 is restored without new
primitives or literal semantic HEX values. Main background stays cobalt200.

Solid primary/secondary/third/fourth use a Tokens Studio `mix` modifier:
base `{primitives.cobalt200}`, mix color `{primitives.iris1100}`, sRGB amounts
0.04/0.08/0.12/0.16. Both inputs are opaque, so output alpha remains 1.
Resolved output: #DFDDF1 / #D7D5EC / #D0CDE8 / #C9C5E3.
These are calculated results, not hardcoded token values or new primitives.

Glassy retains iris1100 with alpha 4/8/12%. It matches the corresponding solid
on the main canvas within rounding. Modal-background appearance is approximate;
both role scales increase contrast from primary onward. A separate ordinary
glassy-fourth token does not exist and is not introduced.

Solid hover Step_1 references its solid Rest. Step_2 mixes that Rest with
iris1300 by 4/6/8% for primary/secondary/third. Gradient tokens reference their
Step tokens. Glassy hover remains an iris1300 overlay at 0–6% / 0–8%.

The rejected saturated iris200–500 scale and its extra foreground restrictions
are removed. Active border and focus return to their previous iris1100 80%
and iris900 values. Backgrounds, inverse and other semantic roles are unchanged.

## Tool support

Color Modifiers are a Tokens Studio Pro feature. Export to Figma produces
resolved colors, not live primitive aliases, because Figma cannot represent
mix expressions. Re-export after primitive changes. Plugin import/export has
not been tested in the user's session. Official documentation:
https://docs.tokens.studio/manage-tokens/token-types/color/modified

The formulas were checked using the official @tokens-studio/sd-transforms
modifyColor implementation, including nested references in gradient steps.
The local validator supports opaque sRGB mix with HEX rounding and rejects
unsupported modifier types rather than silently ignoring them.

Run scripts/check_kidslight_contrast.py and scripts/check_inverse_hover.py.
Checks retain the muted-scale hierarchy, paired Rest/hover matching on the
canvas, ordinary text on all tested surfaces, status text on normal surfaces,
references, opacity, borders and focus. Previously documented status-text hover
limitations remain reported. Arbitrary-image readability and visual approval
in Figma are not certified by these numerical checks.
