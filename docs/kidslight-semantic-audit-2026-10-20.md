# KidsLight semantic audit after manual fill selection

Input: main 1c13444 (`fill tokens`) and the refined iris primitives from 5c12c8d.
The entire `color.fill` subtree, all backgrounds, primitives and main button
are preserved. No new primitives or semantic tokens are created.

## Corrections

- text-icon.offer/warning: yellow1100 → yellow1200.
- text-icon.positive: green1100 → green1200.
- text-icon.negative: red1000 → red1100.
- gradient.fill.solid.hover-focus.inverse steps now match the manually chosen
  iris900 → iris600 composite, rather than stale iris1100 → iris1000.
- component.menu light endpoint iris600 → iris700, including its Step token,
  so white inverse text stays readable across the full gradient.

Run `python3 scripts/audit_kidslight_semantics.py` for the current palette.
This replaces the older checker's obsolete assumptions about ordered solid
roles and exact solid/glassy matching. It uses the same compositing/contrast
helpers. It asserts reference validity, matching gradient steps, paint opacity,
ordinary/status text >=4.5:1, meaningful borders/focus >=3:1 and supported inverse
pairings. Intermediate gradients and nested surfaces are included.

Results: primary text 9.03:1, secondary 7.07:1, third 5.05:1, accent 5.61:1;
status text 4.86–5.02:1; ordinary meaningful borders >=3.16:1; focus 3.52:1.
Inverse third text on menu now >=4.65:1.

## Manual-fill limitations, deliberately preserved

- glassy.inverse.fourth (iris1000 at 65%) with white text reaches only 3.98:1
  on white; inverse secondary/third are lower. Use it for decoration or larger
  text after a contextual check; it is not a universally readable small-text
  container. Contexts used in the audit are documented by the script.
- solid inverse hover ends at iris600: white text reaches 3.70:1 there. Its
  composite and Steps now agree; this fixes consistency, not contrast.
- solid.secondary uses iris300 and solid.third uses iris200. Thus secondary
  is more contrasted than third. The audit reports this ordering instead of
  changing the manually selected fills or asserting a false monotonic scale.

The inverse-hover legacy checker will report a contrast failure for the
manually selected iris600 endpoint. The current audit prints it as a limitation,
not as a passing pairing. No full-theme WCAG certification is claimed.
Arbitrary image/video backdrops, disabled colors, decorative brand labels and
actual application rendering remain outside this audit.
