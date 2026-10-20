# KidsLight: increased glassy opacity with a lighter primitive

Ordinary Rest fills now use iris600 at 8/16/24%, replacing the original
iris1100 at 4/8/12% (e52393d). The intermediate 5/9/13% experiment is superseded.
The primitive is lighter to compensate for doubled alpha. Existing iris shades
were compared by squared sRGB channel error after compositing over both solid
primary and secondary backgrounds, with at least doubled alpha. iris600 gives
the closest fit under that constraint. This is a numeric fit, not visual QA.

| Role | New primitive / alpha | Original on main canvas | New on main canvas |
|---|---|---|---|
| primary | iris600 / 8% | #DFDDF1 | #DEDCF5 |
| secondary | iris600 / 16% | #D7D5EC | #D6D3F5 |
| third | iris600 / 24% | #D0CDE8 | #CECAF5 |

Brightness stays close and surface separation improves slightly on both main
and modal backgrounds. The new result is more violet, especially third; exact
appearance preservation across backgrounds is impossible with changed alpha.
Only existing primitives are used. No contour is introduced.

Hover and its Step tokens retain iris1300 at 0–6% for secondary and 0–8% for
third, 45 degrees, layered above Rest. Backgrounds, solid/inverse/status fills,
text and shared primitives are unchanged.

Run scripts/check_kidslight_contrast.py and scripts/check_inverse_hover.py.
The checks cover configured light backgrounds, nested surfaces, gradient
steps, text, borders and focus. Existing status-text hover limitations are
reported separately. Image transmission drops from 96/92/88% to 92/84/76%,
but these remain translucent tints; text contrast over arbitrary images is not
guaranteed. Component rendering and visual approval remain separate checks.
