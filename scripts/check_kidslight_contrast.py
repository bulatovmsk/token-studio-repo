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
                result[path] = item["value"]
            else:
                result.update(flatten(item, path))
    return result


def read_tokens(relative):
    return flatten(json.loads((ROOT / relative).read_text()))


TOKENS = {}
for relative in ["themes/Primitives.json", "themes/Brand.json", "themes/Semantic/Colors/KidsLight.json"]:
    TOKENS.update(read_tokens(relative))


def resolve(path, stack=()):
    if path in stack:
        raise ValueError(f"Cyclic reference: {' -> '.join((*stack, path))}")
    value = TOKENS[path]
    if isinstance(value, str):
        return REFERENCE.sub(lambda match: str(resolve(match[1], (*stack, path))), value)
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

    for path in backgrounds:
        alphas = [color[3] for color in samples(path)]
        if ".glassy." in path:
            if not all(0 < alpha < 1 for alpha in alphas):
                raise AssertionError(f"Glassy must retain transparency: {path}")
        elif any(alpha != 1 for alpha in alphas):
            raise AssertionError(f"Solid must remain opaque: {path}")

    # Test both root backgrounds, with optional primary island and secondary card.
    # Compose every layer, including gradients, before checking foreground contrast.
    roots = [samples(f"color.background.solid.{role}")[0] for role in ("primary", "secondary")]
    # Include translucent modal backgrounds over the canvas and white surfaces.
    modal = samples("color.background.glassy.secondary")[0]
    roots += [composite(modal, base) for base in (roots[0], rgba("#FFFFFF"))]
    contexts = set(roots)
    for root in roots:
        islands = [composite(samples(f"color.fill.{family}.primary")[0], root) for family in ("solid", "glassy")]
        contexts.update(islands)
        for parent in [root, *islands]:
            for family in ("solid", "glassy"):
                contexts.add(composite(samples(f"color.fill.{family}.secondary")[0], parent))
    pairs = {(color, color) for color in contexts}
    for parent in contexts:
        for path in backgrounds:
            pairs.update((composite(fill, parent), parent) for fill in samples(path))
    palette = {surface for surface, _ in pairs}
    print(f"PASS alpha composition: {len(contexts)} contexts, {len(palette)} resolved surface colors")

    # Cards lift off roots; nested controls gain density instead of whitening.
    # 1.10 is a design regression floor, not a WCAG requirement for surfaces.
    for root in roots:
        for family in ("solid", "glassy"):
            card = composite(samples(f"color.fill.{family}.primary")[0], root)
            require(f"{family} card / root separation", contrast(card, root), 1.10)
            levels = [composite(samples(f"color.fill.{family}.{level}")[0], card)
                      for level in ("secondary", "third")]
            if not luminance(card) > luminance(levels[0]) > luminance(levels[1]):
                raise AssertionError(f"{family} controls must gain density inside cards")
            require(f"{family} card / secondary separation", contrast(levels[0], card), 1.10)
            require(f"{family} secondary / third separation", contrast(levels[1], levels[0]), 1.10)
    if resolve("color.background.solid.primary").upper() != "#E6E5F5":
        raise AssertionError("The production canvas color must not change")

    for role in ("primary", "secondary", "third", "accent", "offer", "positive", "negative", "warning"):
        require(f"text-icon.{role} / composed surfaces", minimum(samples(f"color.text-icon.{role}"), palette), 4.5)
    for role in ("solid", "glassy", "active", "negative", "warning"):
        paint = samples(f"color.border.{role}")[0]
        # Stroke may be inside or outside. Test its rendered color against both
        # adjacent surfaces rather than assuming the translucent stroke is opaque.
        worst = min(contrast(composite(paint, under), adjacent)
                    for surface, parent in pairs
                    for under in (surface, parent)
                    for adjacent in (surface, parent))
        require(f"border.{role} / both adjacent surfaces", worst, 3)

    inverse = samples("color.text-icon.inverse.primary")
    for path in ("color.fill.solid.selected", "color.fill.solid.accent", "color.component.button"):
        require(f"inverse.primary / {path}", minimum(inverse, samples(path)), 4.5)
    dark = samples("color.fill.solid.inverse") + samples("color.background.solid.inverse")
    dark += [composite(samples("color.fill.glassy.inverse.primary")[0], base)
             for base in [*roots, rgba("#FFFFFF")]]
    dark += samples("color.fill.solid.selected") + samples("color.fill.solid.accent") + samples("color.component.button")
    for role in ("primary", "secondary", "third"):
        require(f"inverse.{role} / dark and accent surfaces",
                minimum(samples(f"color.text-icon.inverse.{role}"), dark), 4.5)
    for role in ("third", "fourth"):
        light_inverse = [composite(samples(f"color.fill.glassy.inverse.{role}")[0], root) for root in roots]
        require(f"primary text / weak inverse.{role}", minimum(samples("color.text-icon.primary"), light_inverse), 4.5)
    for role in ("positive", "negative", "warning"):
        require(f"primary text / status {role}", minimum(samples("color.text-icon.primary"), samples(f"color.fill.solid.{role}")), 4.5)
    for label in ("continuum", "lighthouse"):
        require(f"inverse.primary / label {label}", minimum(inverse, samples(f"color.component.label.{label}")), 4.5)
    for path, value in semantic.items():
        if "primitives.indigo" in str(value) and not path.startswith(("color.component.button", "gradient.component.button")):
            raise AssertionError(f"Indigo is reserved for the Kids button: {path}")
    require("inverse.primary / live", minimum(inverse, samples("color.fill.solid.live")), 4.5)
    for role in ("negative", "warning"):
        tinted = [composite(samples(f"color.fill.glassy.{role}")[0], root) for root in roots]
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
