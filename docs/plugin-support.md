# Runtime Plugin Support

Codex Plus ships a small runtime under `webview/assets/codex-plus/`. Built-in
runtime plugins own readable feature behavior. Versioned patches add those
assets and install the Codex host hooks needed by the plugins.

This is current internal plugin support, not a third-party plugin marketplace.
Plugins are packaged as built-in runtime assets today.

For the layer rules that keep plugins, public APIs, host adapters, and patch
hooks separate, see [Plugin Architecture](plugin-architecture.md).

## Boundary

- Runtime plugins own feature intent, UI bodies, CSS, settings, commands, and
  formatting helpers.
- The plugin manager owns registration, dispatch, local storage, styles, and
  lifecycle.
- Versioned patches own exact Codex version metadata, exact minified anchors,
  host dependency wiring, and the smallest host-surface calls needed by plugins.
- Host surfaces are generic. Patches should call APIs such as
  `CodexPlus.ui.commands.renderMenuItems(...)`, not feature-specific helpers.

## Runtime Globals

- `window.CodexPlus` exposes the runtime API used by built-in plugins.
- `window.CodexPlusHost` is the bridge for host-provided modules and native
  requests.

Plugins are declared with `CodexPlus.definePlugin(...)` and installed with
`CodexPlus.registerPlugin(...)`:

```js
CodexPlus.registerPlugin(
  CodexPlus.definePlugin({
    id: "sidebarNameBlur",
    name: "Sidebar Name Blur",
    required: true,
    commands: [],
    settings: {},
    styles: "",
    exports: {},
    start(api) {},
    stop(api) {},
  }),
);
```

The supported plugin fields are:

- `id`, `name`, and `description`
- `required` or `enabledByDefault`
- `settings`
- `commands`
- `styles`
- `patches`
- `exports`
- `start(api)` and `stop(api)`

Plugin code should not know minified Codex component names.

## Generic Host Surfaces

Versioned patches should install these generic surfaces and pass Codex host
dependencies through `deps` objects. Plugins decide what to render or decorate.

### Commands

Plugins declare command metadata and run behavior:

```js
commands: [
  {
    id: "codexPlusToggleSidebarNameBlur",
    title: "Toggle sidebar blur",
    description: "Blur or show sidebar chat and project names",
    menu: { groups: ["suggested", "panels"] },
    palette: { enabled: true, keywords: ["privacy", "blur"] },
    shortcut: { defaultKeybindings: [] },
    run() {
      toggleBlur();
    },
  },
]
```

Host patches render and expose commands through:

- `CodexPlus.ui.commands.renderMenuItems({ group, deps, close })`
- `CodexPlus.ui.commands.commandMetadata()`

### Settings

Plugins register appearance rows with
`CodexPlus.ui.settings.appearance.addRow(...)`. Rows can carry a `render(deps)`
function for custom controls.

Host patches render those rows through:

- `CodexPlus.ui.settings.appearance.renderRows({ deps, variant, section })`

Plugins own setting labels, validation, storage behavior, and row bodies.

### Sidebar, Messages, And Composer

Plugins contribute props, data attributes, and styles with decorators:

- `CodexPlus.ui.sidebar.decorateProjectRow(fn)`
- `CodexPlus.ui.sidebar.decorateThreadRow(fn)`
- `CodexPlus.ui.message.decorateUserBubble(fn)`
- `CodexPlus.ui.composer.decorateSurface(fn)`

Host patches aggregate those decorators through:

- `CodexPlus.ui.sidebar.projectRowProps(props)`
- `CodexPlus.ui.sidebar.threadRowProps(props)`
- `CodexPlus.ui.sidebar.mergeDataAttributes(base, extra)`
- `CodexPlus.ui.message.userBubbleProps(props)`
- `CodexPlus.ui.composer.surfaceProps(props)`

Styles should target Codex Plus data attributes installed by these generic host
surfaces.

### Thread Header

Plugins can add compact thread-header accessories with:

- `CodexPlus.ui.threadHeader.addAccessory(fn)`

Host patches call:

- `CodexPlus.ui.threadHeader.renderAccessories({ context, deps })`

The current header context includes the active `cwd` and `hostId` when Codex
exposes them for the visible route. Accessories should render nothing when
metadata is missing.

### Review

Plugins wrap or extend the Review body with:

- `CodexPlus.ui.review.wrapBody(wrapper)`

Host patches call:

- `CodexPlus.ui.review.renderBody({ props, deps, defaultBody })`

The patch passes Codex Review dependencies and the upstream default body. The
plugin owns nested repository grouping, branch pickers, warnings, debug UI, and
diff rendering.

### Diagnostics And About

Diagnostic plugins register error-boundary renderers with:

- `CodexPlus.ui.errors.decorateBoundary(fn)`

Host patches call:

- `CodexPlus.ui.errors.renderDetails({ jsx, error, componentStack })`

About metadata is owned by `aboutMetadata`. The Electron/main-process patch may
require the plugin-owned asset and call its exported payload builders, but the
copy, disclaimer, build-info lines, and styles belong to the plugin.

### Native Requests

`CodexPlus.native.request(method, params)` forwards to host or worker-backed
requests exposed by Codex Plus patches. Current public methods are:

- `CodexPlus.native.request("devtools/open")`
- `CodexPlus.native.request("repository-targets", params)`
- `CodexPlus.native.request("codex-plus-trace", params)`

Worker patches should only allowlist and delegate.

### Native Menus

Plugins can add native application menu items with:

```js
CodexPlus.nativeMenus.registerItem({
  id: "codexPlusOpenDevTools",
  menuId: "view-menu",
  afterLabel: "Find",
  label: "Open Developer Tools",
  nativeRequest: { method: "devtools/open" },
});
```

The runtime forwards menu registrations through
`CodexPlus.native.request("native-menu/register-item", item)`. The main-process
patch owns insertion into Electron menus, reapplying registered items after menu
refreshes, and dispatching allowed native requests when a menu item is clicked.
Use `afterId` when the target item has a stable id; use `afterLabel` for
upstream menu items that are only labeled in the native template.

## Built-In Plugins

- `aboutMetadata`
- `nestedRepositories`
- `diagnosticErrors`
- `userBubbleColors`
- `projectColors`
- `projectPathHeader`
- `sidebarNameBlur`
- `devTools`

## Patch Rules

A patch is acceptable if it:

- adds a runtime asset;
- imports or requires a runtime/plugin module;
- exposes Codex host dependencies to `CodexPlus`;
- adds a stable data marker;
- calls a generic `CodexPlus.ui.*`, `CodexPlus.commands.*`, or
  `CodexPlus.native.*` host method.

A patch is suspicious if it:

- contains feature-specific UI body text;
- contains CSS beyond a tiny host marker;
- contains plugin-specific render logic;
- knows a plugin ID and a host component at the same time;
- constructs a business command or menu item directly;
- rewrites React compiler cache branches or cache sizes.

New feature work should prefer adding or extending a generic runtime surface
first, then hook that surface into Codex core with the smallest versioned patch
needed. Avoid placing large feature bodies directly in minified transform
strings when a reusable plugin interface can carry the behavior.
