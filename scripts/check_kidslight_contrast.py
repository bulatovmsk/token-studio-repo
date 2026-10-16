#!/usr/bin/env python3
"""Check KidsLight token references and supported WCAG AA color pairings.

Run from any directory with Python 3; no third-party dependencies are needed.
This checks the token palette, not application-wide WCAG conformance.
"""

import json
import re
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
        return rgba(match[1])[:3] + (float(match[2]),)
    raise ValueError(f"Unsupported color: {value}")


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
            colors.append(tuple(x + (y - x) * fraction for x, y in zip(a, b)))
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

    backgrounds = ["color.background.solid.primary", "color.background.solid.secondary"]
    backgrounds += [f"color.fill.solid.{level}" for level in ("primary", "secondary", "third", "fourth")]
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

    palette = [color for path in backgrounds for color in samples(path)]
    if any(color[3] != 1 for color in palette):
        raise AssertionError("Supported light control backgrounds must remain opaque")
    for role in ("primary", "secondary", "third", "accent", "offer", "positive", "negative", "warning"):
        require(f"text-icon.{role} / light controls", minimum(samples(f"color.text-icon.{role}"), palette), 4.5)
    for role in ("solid", "glassy", "active", "negative", "warning", "negative-glassy", "warning-glassy"):
        require(f"border.{role} / light controls", minimum(samples(f"color.border.{role}"), palette), 3)

    inverse = samples("color.text-icon.inverse.primary")
    for path in ("color.fill.solid.selected", "color.fill.solid.accent", "color.component.button"):
        require(f"inverse.primary / {path}", minimum(inverse, samples(path)), 4.5)
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
