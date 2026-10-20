# KidsLight: original iris tint with a small opacity increase

The light iris100/300/400 experiment was rejected. Restore the original
iris1100 tint and iris1300 hover overlays. Only ordinary Rest alpha differs
from e52393d: primary 4% → 5%, secondary 8% → 9%, third 12% → 13%.

Hover remains a separate 45-degree overlay above Rest: secondary 0–6%,
third 0–8%, iris1300. Composite gradients and Step tokens match.
Backgrounds, solid fills, inverse fills, status colors and text are unchanged.

An 8/12/16% scale fails the existing nested ordinary-text contrast check.
6/10/14% passes ordinary text but fails offer text on nested normal surfaces.
5/9/13% passes the existing checks without changing foregrounds or backgrounds.

Run scripts/check_kidslight_contrast.py and scripts/check_inverse_hover.py.
The original validation scope is restored: configured light backgrounds,
nested surfaces, gradient steps, text, borders and focus. Existing status-text
hover limitations are reported separately. No arbitrary-image contrast claim
is made: these weak tints depend on the underlying image and are not sufficient
to guarantee readable text over every picture. No contour is required by this
revision; existing border-token checks do not imply contours on components.
