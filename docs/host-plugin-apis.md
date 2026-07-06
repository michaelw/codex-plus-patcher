# Codex Plus Host Plugin APIs

Codex Plus host APIs are the stable boundary between runtime plugins and Codex
host surfaces. Plugins describe intent through `CodexPlus.ui.*`; patch and host
adapter code translates that intent into the current Codex bundle.

These APIs must stay plugin-agnostic. If an API mentions one feature by name, it
belongs in that feature plugin instead.

## Route Context

`CodexPlus.ui.routeContext` describes the project and workspace that should be
active for the currently visible route.

```js
CodexPlus.ui.routeContext.set({
  routeId: "plugin:route-id",
  sourceProject: { id: "/repo", label: "repo", cwd: "/repo" },
  activeCwd: "/repo",
  workspaceRoot: "/repo",
  gitRoot: "/repo",
  threadId: "",
  branchName: "main",
  source: "plugin-id",
  title: "Plugin route title",
});
```

- `active()` returns a cloned snapshot or `null`.
- `clear(routeId)` clears only the matching route when a route id is supplied.
- `subscribe(listener)` observes context changes.
- `title` is the route-local display title that host header bridges may show
  while the virtual route is active.
- `CodexPlus.ui.projectContext.active()` is the compatibility view for host
  surfaces that only need `cwd`, `label`, `title`, and route metadata.

Host bridges for headers, file tabs, terminal cwd, Review, and side panels must
prefer this context when it exists.

## Virtual Conversations

`CodexPlus.ui.virtualConversations.registerProvider(provider)` registers a
host-owned virtual route. Providers must expose:

- `id`;
- `match(routeId)`;
- `render({ routeId, container, slots, close, refresh })`;
- optional `list()`.

`open(routeId)` mounts into the native conversation area and provides slots:

- `slots.header`;
- `slots.transcript`;
- `slots.actions`;
- `slots.composerControl`.

Providers must render into slots, not `document.body`. Normal Codex controls,
side panels, and composer surfaces remain host-owned.

## Sidebar Sections

`CodexPlus.ui.sidebar.registerSection(sectionModel)` renders a section inside
the native main sidebar.

Section models use project-like row data:

```js
CodexPlus.ui.sidebar.registerSection({
  id: "example",
  title: "Example",
  afterSectionTitle: "Pinned",
  rows: [
    {
      id: "project",
      kind: "project",
      label: "Project",
      color: "#7c5cff",
      children: [],
    },
  ],
});
```

Sections are removed when no native main sidebar host exists. They must not mount
inside Preferences or other non-main sidebars.

## Composer Control

`CodexPlus.ui.composer.claimControl(options)` lets a plugin temporarily own the
native composer.

- `mode: "input"` routes submit to `onSubmit({ text, form, event })`.
- `mode: "waiting"` disables text input but keeps the stop control active.
- `onStop({ form, event })` handles the native stop affordance.
- `placeholder` sets the visible composer placeholder while claimed.
- `stopLabel` customizes the stop affordance label; the default is generic.

The returned function releases the claim. Plugins must not create fallback text
boxes for routes that use composer control.

## Side Panel And Files

`CodexPlus.ui.threadSidePanel.openFile({ path, cwd, projectLabel, source })`
opens a native File tab. It must use route context for `cwd` when callers do not
provide one.

`openTab({ id, title, render })` is available for non-file side-panel content,
but file artifacts should prefer `openFile`.

## Interactions And Chat Rows

`CodexPlus.ui.interactions.renderCard({ card, onReply })` renders normalized
owner or permission cards.

`CodexPlus.ui.chatRows.render(rows, options)` renders generic chat-like rows.
Plugins may pass a sanitized markdown renderer through `options.renderMarkdown`.

## Testing Requirements

Every host API change needs interface tests that cover public shape and host
ownership:

- route context set/clear/subscribe;
- virtual route slots and non-overlap with normal controls;
- sidebar insertion/removal in native sidebar only;
- composer claim/release and stop behavior;
- native file opener readiness and route-context cwd.

Audits should fail closed when a host bridge is missing. Do not add fallback UI
paths to make tests pass.
