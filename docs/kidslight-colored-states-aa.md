# KidsLight: light glassy surfaces

Ordinary glassy fills use light iris primitives with enough opacity for dark
text over imagery. Image content remains visible through 12–20% transparency.

| Token | Base | Alpha | Foreground |
|---|---|---:|---|
| primary | iris100 | 88% | regular dark text |
| secondary | iris200 | 84% | regular dark text |
| third | iris300 | 80% | regular dark text |
| hover-focus.secondary | iris100 | 0% → 6% | regular dark text |
| hover-focus.third | iris100 | 0% → 8% | regular dark text |
| inverse.primary | iris1200 | 92% | inverse light text |
| inverse.third | iris1200 | 84% | inverse light text |
| inverse.fourth | iris1200 | 76% | inverse light text |
| negative | red1000 | 8% | text-icon.negative |
| warning | yellow1100 | 8% | text-icon.warning |

Hover is a 45-degree overlay above Rest: backdrop → Rest → hover → text.
The ordinary hover uses light iris100 to preserve text contrast on dark image
pixels. Its transparent first stop preserves Rest. The old iris1300 overlay
would reduce text-icon.third contrast to about 4.02:1 on glassy.third over black.
Composite gradient values and separate Step tokens must stay synchronized.
Background blur, if needed, is a separate component effect, not part of color.

These levels are alternative surface roles. Primary is the lightest and most
opaque; third is more tinted and reveals more of the image. Glassy fills can
lighten their parent. Nested fills accumulate opacity.

Backgrounds, fades, solid fills, inverse fills, status colors, text, borders,
button colors and shared primitives are unchanged by this revision. The main
canvas remains cobalt200 (#E6E5F5). Solid hover remains fully opaque. Inverse
hover remains its existing separate overlay.

## Validation

Run `python3 scripts/check_kidslight_contrast.py` and
`python3 scripts/check_inverse_hover.py`.

Checks cover references, matching gradient steps, solid/glassy alpha rules,
role hierarchy, nested surfaces, ordinary/status/inverse text, borders and focus.
For ordinary glassy fills, black and white bound SDR image backdrop channels;
Rest and every sampled hover color are checked with primary, secondary, third
and accent text at a minimum of 4.5:1. This assumes normal sRGB compositing and
the specified fills/text, without additional opacity or blend modes.

The 1.05:1 neighboring glassy-level and 1.10:1 solid-level separation checks are
design guards, not WCAG criteria. The image checks establish text contrast,
not button-boundary visibility against arbitrary pictures. Components may need
a separate outline, focus gap or scrim depending on their image context.

Disabled/decorative text, status text on images, other image overlays and actual
application rendering are outside this check. Existing weak inverse.third text
limitations in Main, Kids and Meta are reported by the inverse-hover validator.
