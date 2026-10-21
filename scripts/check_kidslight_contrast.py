#!/usr/bin/env python3
"""Check KidsLight token references and supported WCAG AA color pairings.

Run from any directory with Python 3; no third-party dependencies are needed.
This checks the token palette, not application-wide WCAG conformance.
"""

import json
import re
from functools import lru_cache
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = re.compile(r"\{([^{}]+)\}")
STOP = re.compile(r"(#[0-9a-fA-F]{6}|rgba\([^)]*\))\s+([\d.]+)%")


def flatten(tree, prefix=""):
    result = {}
    for key, item in tree.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(item, dict):
            if "value" in item:
                modifier = item.get("$extensions", {}).get("studio.tokens", {}).get("modify")
                result[path] = {"base": item["value"], "modify": modifier} if modifier else item["value"]
            else:
                result.update(flatten(item, path))
    return result


def read_tokens(relative):
    return flatten(json.loads((ROOT / relative).read_text()))


TOKENS = {}
for relative in ["themes/Primitives.json", "themes/Brand.json", "themes/Semantic/Colors/KidsLight.json"]:
    TOKENS.update(read_tokens(relative))


def resolve(path, stack=(), tokens=None):
    tokens = TOKENS if tokens is None else tokens
    if path in stack:
        raise ValueError(f"Cyclic reference: {' -> '.join((*stack, path))}")
    value = tokens[path]
    if isinstance(value, dict):
        modifier = value["modify"]
        if modifier["type"] != "mix" or modifier["space"] != "srgb":
            raise ValueError(f"Unsupported modifier: {path}")
        expand = lambda text: REFERENCE.sub(lambda match: str(resolve(match[1], (*stack, path), tokens)), text)
        base = rgba(expand(value["base"]))
        other = rgba(expand(modifier["color"]))
        amount = float(modifier["value"])
        if not 0 <= amount <= 1 or base[3] != 1 or other[3] != 1:
            raise ValueError(f"Expected opaque sRGB mix: {path}")
        return "#" + "".join(f"{int((a*(1-amount)+b*amount)*255+.5):02X}" for a,b in zip(base[:3], other[:3]))
    if isinstance(value, str):
        return REFERENCE.sub(lambda match: str(resolve(match[1], (*stack, path), tokens)), value)
    return value


def rgba(value):
    value = value.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)) + (1.0,)
    match = re.fullmatch(r"rgba\(\s*(#[0-9a-fA-F]{6})\s*,\s*([\d.]+)\s*\)", value)
    if match:
        alpha = float(match[2])
        if not 0 <= alpha <= 1:
            raise ValueError(f"Invalid alpha: {value}")
        return rgba(match[1])[:3] + (alpha,)
    raise ValueError(f"Unsupported color: {value}")


@lru_cache(maxsize=None)
def samples(path):
    value = resolve(path)
    if not value.startswith("linear-gradient("):
        return [rgba(value)]
    stops = [(float(position), rgba(color)) for color, position in STOP.findall(value)]
    if len(stops) < 2 or stops[0][0] != 0 or stops[-1][0] != 100:
        raise ValueError(f"Unsupported gradient: {path}")
    colors = []
    for (start, a), (end, b) in zip(stops, stops[1:]):
        if end <= start:
            raise ValueError(f"Unordered stops: {path}")
        # Include each endpoint and intermediate sRGB colors, not just stops.
        for index in range(1001):
            fraction = index / 1000
            alpha = a[3] + (b[3] - a[3]) * fraction
            # Premultiply before interpolation so transparent stops do not add color.
            channels = tuple((x * a[3] * (1 - fraction) + y * b[3] * fraction) / alpha if alpha else 0
                             for x, y in zip(a[:3], b[:3]))
            colors.append(channels + (alpha,))
    return colors


def composite(foreground, background):
    if background[3] != 1:
        raise ValueError("Contrast needs an opaque final background")
    alpha = foreground[3]
    return tuple(a * alpha + b * (1 - alpha) for a, b in zip(foreground[:3], background[:3])) + (1.0,)


def luminance(color):
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in color[:3]]
    return sum(channel * weight for channel, weight in zip(linear, (0.2126, 0.7152, 0.0722)))


def contrast(foreground, background):
    low, high = sorted((luminance(composite(foreground, background)), luminance(background)))
    return (high + 0.05) / (low + 0.05)


def minimum(foregrounds, backgrounds):
    return min(contrast(fg, bg) for fg in foregrounds for bg in backgrounds)


def require(label, actual, threshold):
    # Compare unrounded values. Formatting must not turn a failing pair into a pass.
    if actual < threshold:
        raise AssertionError(f"{label}: {actual:.6f}:1 < {threshold}:1")
    print(f"PASS {label}: {actual:.2f}:1 (required {threshold}:1)")


def main():
    semantic = read_tokens("themes/Semantic/Colors/KidsLight.json")
    for path in semantic:
        resolve(path)
    print(f"PASS references: {len(semantic)} tokens, no missing references or cycles")

    # Audit every composite gradient with a corresponding split-token family.
    for path in semantic:
        if not path.startswith("color.") or not str(resolve(path)).startswith("linear-gradient("):
            continue
        split = "gradient." + path[len("color."):]
        if ".fill.fade." in path:
            split = "gradient.fill.fade." + path.rsplit(".", 1)[1]
        if path == "color.border.decorative.assistant-gradient":
            split = "gradient.border.decorative.assistant"
        keys = [key for key in semantic if key.startswith(split + ".")]
        if not keys:
            raise AssertionError(f"Missing split gradient: {path}")
        keys.sort(key=lambda key: int(key.rsplit("_", 1)[1]))
        expected = [rgba(color) for color, _ in STOP.findall(resolve(path))]
        if [rgba(resolve(key)) for key in keys] != expected:
            raise AssertionError(f"Gradient stops disagree: {path}")
    print("PASS all composite/split gradients, including fades, borders and components")

    backgrounds = [f"color.fill.solid.{level}" for level in ("primary", "secondary", "third", "fourth")]
    backgrounds += [f"color.fill.glassy.{level}" for level in ("primary", "secondary", "third")]
    for family, levels in [("solid", ("primary", "secondary", "third")), ("glassy", ("secondary", "third"))]:
        for level in levels:
            path = f"color.fill.{family}.hover-focus.{level}"
            backgrounds.append(path)
            actual = [resolve(f"gradient.fill.{family}.hover-focus.{level}.Step_{step}") for step in (1, 2)]
            expected = [color.strip() for color, _ in STOP.findall(resolve(path))]
            if actual != expected:
                raise AssertionError(f"Composite and variable-bound stops disagree: {path}")
    print("PASS hover gradients: composite paints match variable-bound stops")

    for path in set(backgrounds) | {key for key in semantic if key.startswith("color.fill.glassy.")}:
        alphas = [color[3] for color in samples(path)]
        if ".glassy." in path:
            if not all(0 <= alpha < 1 for alpha in alphas) or not any(alpha > 0 for alpha in alphas):
                raise AssertionError(f"Glassy must retain transparency: {path}")
        elif any(alpha != 1 for alpha in alphas):
            raise AssertionError(f"Solid must remain opaque: {path}")

    # Test both root backgrounds, with optional primary island and secondary card.
    # Compose every layer, including gradients, before checking foreground contrast.
    roots = [samples(f"color.background.solid.{role}")[0] for role in ("primary", "secondary")]
    # Include translucent modal backgrounds over the canvas and white surfaces.
    modal = samples("color.background.glassy.secondary")[0]
    roots += [composite(modal, base) for base in (roots[0], rgba("#FFFFFF"))]
    roots.append(rgba("#FFFFFF"))
    contexts = set(roots)
    for root in roots:
        islands = [composite(samples(f"color.fill.{family}.primary")[0], root) for family in ("solid", "glassy")]
        contexts.update(islands)
        for parent in [root, *islands]:
            for family in ("solid", "glassy"):
                contexts.add(composite(samples(f"color.fill.{family}.secondary")[0], parent))

    # Check every Solid/Glassy sequence through all four distinct island roles.
    # 1.08 is an internal separation target, not a WCAG requirement for islands.
    island_pairs = set()
    for root in roots:
        parents = {root}
        for role in ("primary", "secondary", "third", "fourth"):
            families = ("solid",) if role == "fourth" else ("solid", "glassy")
            children = set()
            for parent in parents:
                for family in families:
                    surface = composite(samples(f"color.fill.{family}.{role}")[0], parent)
                    if role != "primary":
                        if luminance(surface) >= luminance(parent):
                            raise AssertionError(f"{family}.{role}: nested islands must darken their parent")
                        if contrast(surface, parent) < 1.08:
                            raise AssertionError(f"{family}.{role}: nested island separation below 1.08:1")
                        island_pairs.add((surface, parent))
                    children.add(surface)
            contexts.update(children)
            parents = children
    print(f"PASS nested island separation: {min(contrast(s,p) for s,p in island_pairs):.3f}:1 (design target 1.08:1)")
    pairs = {(color, color) for color in contexts}
    for parent in contexts:
        for path in backgrounds:
            # Hover is an overlay above the matching Rest surface.
            under = parent
            if "hover-focus" in path:
                rest_path = path.replace(".hover-focus", "")
                under = composite(samples(rest_path)[0], parent)
            pairs.update((composite(fill, under), parent) for fill in samples(path))
    palette = {surface for surface, _ in pairs}
    print(f"PASS alpha composition: {len(contexts)} contexts, {len(palette)} resolved surface colors")

    # Primary is whitest; deeper island roles darken even on a white parent.
    for root in roots:
        for family, roles in (("solid", ("primary", "secondary", "third", "fourth")),
                              ("glassy", ("primary", "secondary", "third"))):
            levels = [composite(samples(f"color.fill.{family}.{role}")[0], root)
                      for role in roles]
            if not all(luminance(a) > luminance(b) for a, b in zip(levels, levels[1:])):
                raise AssertionError(f"{family}: island levels must darken progressively")
    print("PASS descending island hierarchy on all root backgrounds, including white")

    # Glassy uses the paired tint instead of white-only overlays so it remains
    # distinct when nested. Allow at most three RGB levels of parent contribution
    # on supported roots; exact matching on one canvas is no longer the target.
    for parent in roots:
        for role in ("primary", "secondary", "third"):
            solid = samples(f"color.fill.solid.{role}")[0]
            glassy = composite(samples(f"color.fill.glassy.{role}")[0], parent)
            if max(abs(a-b) for a,b in zip(solid[:3], glassy[:3])) > 3/255 + 1e-9:
                raise AssertionError(f"{role}: solid/glassy Rest difference exceeds three RGB levels")
            if role != "primary":
                solid_hover = samples(f"color.fill.solid.hover-focus.{role}")
                glassy_hover = [composite(paint, glassy) for paint in samples(f"color.fill.glassy.hover-focus.{role}")]
                if max(abs(a-b) for sh,gh in zip(solid_hover,glassy_hover)
                       for a,b in zip(sh[:3],gh[:3])) > 3/255 + 1e-9:
                    raise AssertionError(f"{role}: solid/glassy hover difference exceeds three RGB levels")
    print("PASS paired solid/glassy Rest and hover remain close on supported roots")

    for role in ("primary", "secondary", "third"):
        rest = samples(f"color.fill.solid.{role}")[0]
        hover = samples(f"color.fill.solid.hover-focus.{role}")
        if hover[0] != rest:
            raise AssertionError(f"Solid hover start must preserve its own Rest: {role}")
        lightness = [luminance(color) for color in hover]
        if not lightness[-1] < luminance(rest) or any(a < b - 1e-12 for a, b in zip(lightness, lightness[1:])):
            raise AssertionError(f"Solid hover must progressively darken its own Rest: {role}")
    for role, alpha in (("secondary", .06), ("third", .06)):
        hover = samples(f"color.fill.glassy.hover-focus.{role}")
        if hover[0][3] != 0 or hover[-1][3] != alpha:
            raise AssertionError(f"Glassy overlay endpoints disagree: {role}")
        for parent in [*roots, rgba("#FFFFFF")]:
            rest = composite(samples(f"color.fill.glassy.{role}")[0], parent)
            surfaces = [composite(paint, rest) for paint in hover]
            if surfaces[0] != rest:
                raise AssertionError("Transparent glassy hover edge must preserve Rest")
            lightness = [luminance(color) for color in surfaces]
            if not lightness[-1] < luminance(rest) or any(a < b - 1e-12 for a, b in zip(lightness, lightness[1:])):
                raise AssertionError(f"Glassy hover must progressively darken its own Rest: {role}")
    print("PASS solid/glassy hover preserves its own Rest and progressively darkens")
    if resolve("color.background.solid.primary").upper() != "#E6E5F5":
        raise AssertionError("The production canvas color must not change")

    # The primitives are shared with dark Kids. Check its affected pairings
    # against a separate token map so the KidsLight palette remains intact.
    kids_tokens = dict(TOKENS)
    kids_tokens.update(read_tokens("themes/Semantic/Colors/Kids.json"))
    for text, fill in (("primary", "accent"), ("inverse.primary", "selected")):
        foreground = rgba(resolve(f"color.text-icon.{text}", tokens=kids_tokens))
        background = rgba(resolve(f"color.fill.solid.{fill}", tokens=kids_tokens))
        require(f"Kids text-icon.{text} / solid.{fill}", contrast(foreground, background), 4.5)

    for role in ("primary", "secondary", "third", "accent"):
        require(f"text-icon.{role} / composed surfaces", minimum(samples(f"color.text-icon.{role}"), palette), 4.5)
    # Existing hover tokens remain for compatibility. Island Rest surfaces do
    # not define future component control states; keep their WCAG regressions.
    normal_palette = set(contexts)
    for parent in contexts:
        for path in backgrounds:
            if "hover-focus" not in path:
                normal_palette.update(composite(fill, parent) for fill in samples(path))
    for role in ("offer", "positive", "negative", "warning"):
        require(f"text-icon.{role} / normal surfaces", minimum(samples(f"color.text-icon.{role}"), normal_palette), 4.5)
        hover_min = minimum(samples(f"color.text-icon.{role}"), palette)
        if hover_min < 4.5:
            print(f"LIMITATION {role} on legacy nested hover: {hover_min:.2f}:1; use primary text")
    # Solid/Glassy are supplemental island outlines, not sole control boundaries.
    for role in ("solid", "glassy"):
        outline = samples(f"color.border.{role}")[0]
        ratios = [contrast(outline, surface) for surface in normal_palette]
        print(f"INFO structural border.{role} / Rest surfaces: {min(ratios):.2f}–{max(ratios):.2f}:1; excluded from control-boundary checks")
    solid_border = samples("color.border.solid")[0]
    active_border = samples("color.border.active")[0]
    if solid_border[3] != 1 or active_border[3] != 1:
        raise AssertionError("Solid and active island borders must remain opaque")
    if not all(contrast(active_border, surface) > contrast(solid_border, surface) for surface in palette):
        raise AssertionError("Active island border must separate more strongly than Solid on light surfaces")
    print("PASS active island border is stronger than the ordinary solid outline")
    for role in ("active", "negative", "warning"):
        paint = samples(f"color.border.{role}")[0]
        # Stroke may be inside or outside. Test its rendered color against both
        # adjacent surfaces rather than assuming the translucent stroke is opaque.
        worst = min(contrast(composite(paint, under), adjacent)
                    for surface, parent in pairs
                    for under in (surface, parent)
                    for adjacent in (surface, parent))
        require(f"border.{role} / both adjacent surfaces", worst, 3)

    inverse = samples("color.text-icon.inverse.primary")
    for path in ("color.component.control.fill.selected", "color.fill.solid.accent", "color.component.control.fill.primary",
                 "color.component.menu", "color.fill.solid.hover-focus.inverse"):
        require(f"inverse.primary / {path}", minimum(inverse, samples(path)), 4.5)
    dark = samples("color.fill.solid.inverse") + samples("color.background.solid.inverse")
    dark += [composite(samples("color.fill.glassy.inverse.primary")[0], base)
             for base in [*roots, rgba("#FFFFFF")]]
    dark += samples("color.component.control.fill.selected") + samples("color.fill.solid.accent") + samples("color.component.control.fill.primary")
    for role in ("primary", "secondary", "third"):
        require(f"inverse.{role} / dark and accent surfaces",
                minimum(samples(f"color.text-icon.inverse.{role}"), dark), 4.5)
    for role in ("primary", "third", "fourth"):
        inverse_surfaces = [composite(samples(f"color.fill.glassy.inverse.{role}")[0], base)
                            for base in [*contexts, rgba("#FFFFFF")]]
        for text_role in ("primary", "secondary", "third"):
            require(f"inverse.{text_role} / glassy.inverse.{role}",
                    minimum(samples(f"color.text-icon.inverse.{text_role}"), inverse_surfaces), 4.5)
    for role in ("positive", "negative", "warning"):
        require(f"primary text / status {role}", minimum(samples("color.text-icon.primary"), samples(f"color.fill.solid.{role}")), 4.5)
    for label in ("continuum", "lighthouse"):
        require(f"inverse.primary / label {label}", minimum(inverse, samples(f"color.component.label.{label}")), 4.5)
    for path, value in semantic.items():
        if "primitives.indigo" in str(value) and not path.startswith(("color.component.control.fill.primary", "gradient.component.control.fill.primary")):
            raise AssertionError(f"Indigo is reserved for the Kids primary controls: {path}")
    require("inverse.primary / live", minimum(inverse, samples("color.fill.solid.live")), 4.5)
    for role in ("negative", "warning"):
        path = "color.component.control.fill.negative" if role == "negative" else "color.fill.glassy.warning"
        tinted = [composite(samples(path)[0], root) for root in contexts]
        require(f"status text / tinted {role}", minimum(samples(f"color.text-icon.{role}"), tinted), 4.5)

    require("focus / light controls", minimum(samples("color.border.focus"), palette), 3)
    require("focus / white separation gap", minimum(samples("color.border.focus"), [rgba("#FFFFFF")]), 3)
    for relative in ("themes/Component/WebMobile/KidsLight.json", "themes/Component/TV/KidsLight.json"):
        width = float(read_tokens(relative)["control.focus.width"])
        if width < 3:
            raise AssertionError(f"Focus width below concept's 3 px rule: {relative}")
    print("PASS focus width: at least 3 px on Web/Mobile and TV")
    print("Excluded: disabled/decorative colors, arbitrary image overlays, application layout and interaction.")


if __name__ == "__main__":
    main()
