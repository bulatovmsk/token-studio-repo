---
name: figma-design-system-workflow
description: >-
  Work with Figma design systems for OKKO: inspect Token Studio JSON, Figma variables,
  component libraries, variable bindings, and screens built from the design system. Use when
  the task mentions Figma variables, tokens, Token Studio, component libraries, design-system
  components, or creating/updating screens from an existing Figma DS.
---

# Figma Design System Workflow

This skill routes Figma design-system work to the right lower-level skills and keeps the OKKO
Token Studio contract in scope.

## Skill routing

- Always load `figma-use` before any `use_figma` call. It defines the Figma Plugin API rules:
  top-level `await`, structured `return`, page loading, variable APIs, font loading, and binding gotchas.
- Load `figma-generate-library` for design-system foundations: variables, modes, scopes, code syntax,
  token aliases, component libraries, variants, and QA.
- Load `integrate-component-tokens` for OKKO component-token binding work, especially `control.*`,
  `label.*`, `rail.*`, Token Studio JSON, `themes/$themes.json`, Component W&M, and Component TV.
- Load `figma-generate-design` when the deliverable is a composed screen, modal, drawer, panel, or
  page assembled from an existing design system.

If multiple routes apply, use them together in this order:

1. `figma-use`
2. `figma-generate-library` or `figma-generate-design`
3. `integrate-component-tokens` when OKKO token bindings are involved

## Default workflow

1. Discover local source truth:
   - inspect `themes/` JSON token files;
   - inspect `themes/$themes.json` for collection ids, mode ids, and Token Studio references;
   - identify target token groups such as `control.*`, `label.*`, or `rail.*`.
2. Discover Figma truth:
   - inspect local variable collections and modes;
   - map Figma variable names such as `control/default/height/phone` to JSON token paths such as
     `control.default.height.phone`;
   - inspect target component sets and existing `boundVariables`.
3. Produce a gap analysis before mutation:
   - tokens present in JSON but missing in Figma variables;
   - Figma variables missing from Token Studio references;
   - nodes already bound to remote or wrong variables;
   - missing layer/property mappings.
4. Implement in the correct order:
   - tokens and variables first;
   - component structure and variants second;
   - variable bindings third;
   - audit and screenshots last.

## Guardrails

- Token Studio JSON is the source of truth unless the user explicitly says the Figma visual should update tokens.
- Prefer Figma variable names and collection/mode context for runtime binding; do not assume Token Studio
  `$figmaVariableReferences` values are usable as Plugin API variable ids.
- Work incrementally. Large Figma updates should be split into small `use_figma` calls with returned ids,
  counts, `missing`, and `errors`.
- Do not delete, detach, or overwrite components or variables as cleanup unless the user explicitly asks.
- For binding tasks, audit for completeness and for unintended remote bindings before reporting success.
