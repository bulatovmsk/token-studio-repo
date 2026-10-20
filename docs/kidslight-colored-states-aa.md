# KidsLight: matched solid and glassy role hierarchy

The production canvas remains cobalt200 (#E6E5F5). Ordinary fills now share
one scale: primary is least contrasted against the background, then secondary,
third and (solid only) fourth. This replaces the white solid-primary hierarchy.

| Role | Opaque solid | Glassy |
|---|---|---|
| primary | #DFDDF1 | iris1100 at 4% |
| secondary | #D7D5EC | iris1100 at 8% |
| third | #D0CDE8 | iris1100 at 12% |
| fourth | #C9C5E3 | No existing ordinary glassy fourth token |

Solid values are the rounded sRGB composite of the existing iris1100 primitive
at 4/8/12/16% over the unchanged main canvas. These semantic HEX values are not
new primitives. Do not substitute the former white/iris100/iris200 aliases:
they reverse the intended background-contrast hierarchy.

Glassy Rest and hover remain unchanged. Solid hover is opaque and recalculated:
its start matches its Rest; its end equals an iris1300 overlay of 4/6/8% for
primary/secondary/third. Separate Step tokens match the composite gradients.
For secondary/third, solid and glassy hover match over the main canvas within
one RGB code value, including sampled intermediate positions. There is no
existing glassy-primary hover token to pair with solid-primary hover.

The same solid/glassy role is calibrated to match on the main canvas. On the
modal background the glassy result follows that backdrop, so it is not an exact
match to solid. Both scales retain progressively stronger separation there.
No contours are required by this change. Identical opaque fills nested inside
each other remain identical; choose different roles for parent and child.

Backgrounds, fades, inverse, status, accent, selected, button, text and shared
primitive tokens are unchanged. This revision does not increase glassy alpha.

## Validation

Run scripts/check_kidslight_contrast.py and scripts/check_inverse_hover.py.
Checks cover increasing contrast by role on main/modal backgrounds, solid/glassy
Rest and hover matching on the main canvas, opaque solid paints, transparency,
gradient steps, nested surfaces, ordinary/status/inverse text and focus.
The former white-card-lift check is replaced by the explicitly requested role
hierarchy. Existing foreground checks remain intact, including their reported
status-text hover limitations. Arbitrary image backdrops and actual component
rendering are outside this palette check; the user will preview in Figma.
