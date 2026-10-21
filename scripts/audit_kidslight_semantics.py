#!/usr/bin/env python3
"""Audit semantic colors against the user-selected KidsLight fills.

The fill palette is input, not an optimization target. Report its limitations
without rewriting its roles or weakening mandatory foreground checks.
"""
import check_kidslight_contrast as c

semantic = c.read_tokens('themes/Semantic/Colors/KidsLight.json')
for path in semantic:
    c.resolve(path)
print(f'PASS {len(semantic)} token references')
for path in semantic:
    if not path.startswith('color.') or not str(c.resolve(path)).startswith('linear-gradient('):
        continue
    split = 'gradient.' + path[len('color.'):]
    if '.fill.fade.' in path:
        split = 'gradient.fill.fade.' + path.rsplit('.', 1)[1]
    if path == 'color.border.decorative.assistant-gradient':
        split = 'gradient.border.decorative.assistant'
    keys = sorted((k for k in semantic if k.startswith(split + '.')),
                  key=lambda k: int(k.rsplit('_', 1)[1]))
    expected = [c.rgba(color) for color, _ in c.STOP.findall(c.resolve(path))]
    assert keys and [c.rgba(c.resolve(k)) for k in keys] == expected, path
print('PASS every gradient matches its Step variables')

roots = [c.samples('color.background.solid.' + r)[0] for r in ('primary', 'secondary')]
modal = c.samples('color.background.glassy.secondary')[0]
roots += [c.composite(modal, b) for b in (roots[0], c.rgba('#FFFFFF'))]
contexts = set(roots)
for root in roots:
    islands = [c.composite(c.samples(f'color.fill.{f}.primary')[0], root) for f in ('solid', 'glassy')]
    contexts.update(islands)
    for parent in (root, *islands):
        for f in ('solid', 'glassy'):
            contexts.add(c.composite(c.samples(f'color.fill.{f}.secondary')[0], parent))
paths = [f'color.fill.solid.{r}' for r in ('primary', 'secondary', 'third', 'fourth')]
paths += [f'color.fill.glassy.{r}' for r in ('primary', 'secondary', 'third')]
paths += [f'color.fill.{f}.hover-focus.{r}' for f, roles in
          [('solid', ('primary', 'secondary', 'third')), ('glassy', ('secondary', 'third'))] for r in roles]
pairs = {(surface, surface) for surface in contexts}
for path in paths:
    for parent in contexts:
        rest = c.composite(c.samples(path.replace('.hover-focus', ''))[0], parent) if 'hover-focus' in path else parent
        pairs.update((c.composite(paint, rest), parent) for paint in c.samples(path))
    if '.solid.' in path:
        assert all(p[3] == 1 for p in c.samples(path)), path
    else:
        assert all(0 <= p[3] < 1 for p in c.samples(path)), path
palette = {p for p, _ in pairs}
for role in ('primary', 'secondary', 'third', 'accent', 'offer', 'positive', 'negative', 'warning'):
    c.require(f'text-icon.{role} / Rest, hover and nested fills',
              c.minimum(c.samples('color.text-icon.' + role), palette), 4.5)
# Solid/Glassy are supplemental structural island outlines.
for role in ('solid', 'glassy'):
    outline = c.samples('color.border.' + role)[0]
    ratios = [c.contrast(outline, surface) for surface in palette]
    print(f'INFO structural border.{role} / own surface: {min(ratios):.2f}–{max(ratios):.2f}:1; excluded from control-boundary checks')
solid_border = c.samples('color.border.solid')[0]
active_border = c.samples('color.border.active')[0]
assert solid_border[3] == active_border[3] == 1
assert all(c.contrast(active_border, surface) > c.contrast(solid_border, surface) for surface in palette)
print('PASS active island border is stronger than solid')
for role in ('active', 'negative', 'warning'):
    paint = c.samples('color.border.' + role)[0]
    worst = min(c.contrast(c.composite(paint, under), adjacent)
                for surface, parent in pairs for under in (surface, parent) for adjacent in (surface, parent))
    c.require('border.' + role, worst, 3)
c.require('focus / all ordinary fills', c.minimum(c.samples('color.border.focus'), palette), 3)
for role in ('primary', 'secondary', 'third'):
    text = c.samples('color.text-icon.inverse.' + role)
    for path in ('color.fill.solid.inverse', 'color.component.control.fill.selected', 'color.fill.solid.accent',
                 'color.component.control.fill.primary', 'color.component.menu'):
        c.require(f'inverse.{role} / {path}', c.minimum(text, c.samples(path)), 4.5)
    for fill_role in ('primary', 'third', 'fourth'):
        bgs = [c.composite(c.samples('color.fill.glassy.inverse.' + fill_role)[0], bg)
               for bg in (*contexts, c.rgba('#FFFFFF'))]
        result = c.minimum(text, bgs)
        if fill_role == 'fourth':
            print(f'LIMITATION inverse.{role} / glassy.inverse.fourth: {result:.2f}:1; manual fill preserved')
        else:
            c.require(f'inverse.{role} / glassy.inverse.{fill_role}', result, 4.5)
    result = c.minimum(text, c.samples('color.fill.solid.hover-focus.inverse'))
    print(f'LIMITATION inverse.{role} / manually selected solid inverse hover: {result:.2f}:1')
    rest = c.samples('color.fill.glassy.inverse.primary')[0]
    bgs = [c.composite(h, c.composite(rest, bg)) for bg in roots
           for h in c.samples('color.fill.glassy.hover-focus.inverse')]
    c.require(f'inverse.{role} / glassy inverse hover', c.minimum(text, bgs), 4.5)
for root_role in ('primary', 'secondary'):
    bg = c.samples('color.background.solid.' + root_role)[0]
    for f, roles in [('solid', ('primary', 'secondary', 'third', 'fourth')), ('glassy', ('primary', 'secondary', 'third'))]:
        ratios = [c.contrast(c.composite(c.samples(f'color.fill.{f}.{r}')[0], bg), bg) for r in roles]
        print(f'INFO {f} contrast on background.{root_role}: ' + ', '.join(f'{r} {v:.2f}' for r,v in zip(roles,ratios)))
assert c.resolve('color.background.solid.primary').upper() == '#E6E5F5'
print('Excluded: arbitrary image backdrops, disabled/decorative text and application rendering.')
