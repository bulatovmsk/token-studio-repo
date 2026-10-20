# Inverse hover across themes

New semantic paints: color.fill.solid.hover-focus.inverse and
color.fill.glassy.hover-focus.inverse. Matching gradient.fill.* Step_1/Step_2
values support Figma style bindings. No existing token values changed.

Solid is opaque: Main/Kids/Meta gray200 → gray300; KidsLight iris1100 → iris1000.
Glassy is an overlay: Main/Meta black 0–8%; Kids iris1300 0–8%;
KidsLight iris100 0–8%. All gradients are 45deg.

Use solid hover on solid.inverse. Keep glassy.inverse.primary below its hover
layer. Selected/accent backgrounds require their own state choice; they do not
become inverse merely because their text is light.

Run python3 scripts/check_inverse_hover.py. Primary and secondary inverse text
pass 4.5:1 across the gradients after Rest composition on both root backgrounds.
Existing inverse.third text in dark themes does not always reach 4.5:1 on
translucent inverse surfaces; the script reports it. Weak inverse.third/fourth
surfaces in those themes and image backdrops require contextual validation.

After the light Iris palette revision, KidsLight solid inverse-hover uses
iris900 → iris800, with both the composite and split gradient updated.
The brighter iris600 is no longer an endpoint under light inverse text.
See [Iris palette](iris-palette.md) for the current primitives and semantic remaps.

Figma creation was blocked by an MCP access denial for the source design file.
The JSON definitions are ready for Tokens Studio import; new Figma variables
and paint styles have not been created by this change.
