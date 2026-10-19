#!/usr/bin/env python3
"""Validate inverse hover across all themes, including Rest alpha composition."""
import runpy
m = runpy.run_path(str(__import__('pathlib').Path(__file__).with_name('check_kidslight_contrast.py')))
base = dict(m['TOKENS'])
for theme in ('Main', 'Kids', 'KidsLight', 'Meta'):
    m['TOKENS'].clear()
    m['TOKENS'].update(base)
    m['TOKENS'].update(m['read_tokens'](f'themes/Semantic/Colors/{theme}.json'))
    m['samples'].cache_clear()
    roots = [m['samples'](f'color.background.solid.{role}')[0] for role in ('primary', 'secondary')]
    for family in ('solid', 'glassy'):
        path = f'color.fill.{family}.hover-focus.inverse'
        hover = m['samples'](path)
        expected = [m['rgba'](m['resolve'](f'gradient.fill.{family}.hover-focus.inverse.Step_{i}')) for i in (1, 2)]
        assert all(abs(a - b) < 1e-12 for actual, target in zip((hover[0], hover[-1]), expected) for a, b in zip(actual if target[3] else actual[3:], target if target[3] else target[3:]))
        if family == 'solid':
            assert all(p[3] == 1 for p in hover)
            surfaces = hover
        else:
            assert hover[0][3] == 0 and all(0 <= p[3] < 1 for p in hover)
            rest = m['samples']('color.fill.glassy.inverse.primary')[0]
            surfaces = [m['composite'](paint, m['composite'](rest, root)) for root in roots for paint in hover]
        for text in ('primary', 'secondary'):

            m['require'](f'{theme} {family} inverse-hover / inverse.{text}',
                         m['minimum'](m['samples'](f'color.text-icon.inverse.{text}'), surfaces), 4.5)
        third = m['minimum'](m['samples']('color.text-icon.inverse.third'), surfaces)
        if third < 4.5:
            print(f"LIMITATION {theme} {family} inverse.third: {third:.2f}:1; use inverse.primary/secondary")
