# KidsLight: existing iris primitives for paired surface roles

All ordinary solid fills and gradient steps now reference existing primitives.
No computed semantic HEX or new primitives are introduced. Main background
remains cobalt200 (#E6E5F5); modal backgrounds are unchanged.

| Role | Solid | Glassy |
|---|---|---|
| primary | iris200 | iris200 at 92% |
| secondary | iris300 | iris400 at 49% |
| third | iris400 | iris400 at 92% |
| fourth | iris500 | No existing ordinary glassy fourth token |

Contrast against the main/modal background increases by role in both families.
Primary is deliberately close to the background. Solid/glassy pairs are
approximate: validation bounds maximum per-channel difference to 8/255 on main
and modal contexts, including hover. This is an RGB regression guard, not a
perceptual guarantee; visual approval belongs in Figma. Secondary is fitted
with a darker primitive at lower opacity; third uses higher opacity so nested
status text remains readable. Opacity need not be monotonic across roles.

Solid hover: iris200 → iris300, iris300 → iris400, iris400 → iris500.
Glassy hover overlays Rest: secondary iris500 0 → 50%; third iris600 0 → 45%.
All are 45 degrees; composite values and Step tokens match. Solid is opaque.
There is no ordinary glassy-primary hover token in the current schema.

## Foreground constraints

The stronger fourth and third-hover surfaces require primary/secondary text
for ordinary small labels. text-icon.third on solid fourth is about 4.23:1;
status text on fourth is also below 4.5:1. The validator reports these limits,
and checks tertiary text on the remaining supported surfaces. Primary,
secondary and accent text remain checked across the full surface palette.
Status text remains checked on non-fourth Rest surfaces; hover limits are
reported separately. These restrictions are new relative to the weaker scale.

Active border opacity increases from 80% to 85% (iris1100); focus uses iris1000
instead of iris900 to retain 3:1 contrast on the stronger fills. This does not
add outlines to components. Other text, status, inverse, button and shared
primitive tokens are unchanged.

Run scripts/check_kidslight_contrast.py and scripts/check_inverse_hover.py.
Checks cover hierarchy, pair matching, references, gradient steps, alpha,
nested surfaces, supported foregrounds, borders and focus. Arbitrary images,
disabled text and actual application rendering are outside this palette check.
