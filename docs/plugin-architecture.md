# Codex Plus Plugin Architecture

Codex Plus separates plugin behavior from Codex host wiring. The layers are:

```text
runtime/plugins/*       user-facing behavior
runtime/api/*           stable CodexPlus public APIs
runtime/host/*          readable Codex host adapters
patches/lib/hooks/*     tiny minified injection glue
patches/lib/*.js        patch queue composition
```

## What Goes Where

| Layer | Owns | Must not own |
| --- | --- | --- |
| `src/runtime/plugins/*` | UI rendering, commands, settings, styles, feature logic | Minified names, bundle filenames, cache slots, React aliases, Codex component names |
| `src/runtime/api/*` | Stable `CodexPlus.*` vocabulary for plugins | Bundle-specific anchors or plugin-specific host internals |
| `src/runtime/host/*` | Readable translation from Codex internals into runtime APIs | User-facing feature policy that belongs in plugins |
| `src/patches/lib/hooks/*` | Short snippets that install extension points or call host adapters | Business logic, UI bodies, CSS, or feature decisions |
| Versioned patch files | Assets, bundle names, anchors, patch composition | Feature logic |

Plugins say what Codex Plus should do. Runtime APIs say what plugins are
allowed to ask for. Host adapters translate Codex internals into those APIs.
Patches only install the adapters.

## Rules

- plugin purity is the boundary: plugin code owns behavior, while host code owns
  Codex-internal translation.
- Plugin code may only call published `CodexPlus.*` APIs. It must not know
  minified names such as `t[42]`, bundle filenames, React aliases, cache slot
  numbers, or Codex-internal component names.
- Add or extend `runtime/api/*` when more than one plugin could reasonably use
  a surface, or when hiding Codex host details makes a plugin cleaner.
- If code knows Codex internals, it is host adapter code, not plugin code.
- A hook builder may reference minified names and exact anchors, but only to
  establish extension points, pass host dependencies, or call a host adapter.
- The 180-character glue rule is strict: hook snippets must stay at or below
  180 compact characters. If a snippet wants to grow, move the logic into
  `runtime/host/*`.

## Examples

Allowed plugin code:

```js
CodexPlus.ui.sidebar.decorateThreadRow(({ project }) => ({
  "data-codex-plus-project-color": project?.projectId ?? "",
}));
```

Disallowed plugin code:

```js
// Bad: plugin knows a minified cache slot and upstream component name.
if (t[45] !== project) return jsx(Tf, props);
```

Allowed hook code:

```js
let CPXS=window.CodexPlusHost.adapters.sidebar,CPXTR=e=>CPXS.threadRowProps(e);
```

Disallowed hook code:

```js
// Bad: feature styling belongs in a plugin or API, not in minified glue.
function CPXColor(project){return project.pinned ? "purple" : "blue"}
```
