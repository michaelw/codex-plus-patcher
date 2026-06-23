# Runtime Plugin Support

Codex Plus ships a small runtime under `webview/assets/codex-plus/`. Versioned
patches add that runtime, the built-in plugin files, and the Codex core hooks
needed by those plugins.

This is current internal plugin support, not a third-party plugin marketplace.
Plugins are packaged as built-in runtime assets today.

## Runtime Globals

- `window.CodexPlus` exposes the runtime API used by built-in plugins.
- `window.CodexPlusHost` is the bridge for host-provided modules and native
  requests.

Plugins are declared with `CodexPlus.definePlugin(...)` and installed with
`CodexPlus.registerPlugin(...)`. A plugin can provide:

- `id`, `name`, and `description`
- `required` or `enabledByDefault`
- `settings`
- `commands`
- `styles`
- `patches`
- `start(api)` and `stop(api)`

## Supported Surfaces

- `CodexPlus.modules` registers and finds host modules with `registerHostModule`,
  `findByCode`, `findByProps`, `findComponentByCode`, and `waitFor`.
- `CodexPlus.ui` collects current UI extension points for settings, review,
  sidebar rows, user messages, composer surfaces, About metadata, and error
  boundaries.
- `CodexPlus.commands` registers and runs command definitions.
- `CodexPlus.settings` defines localStorage-backed plugin settings.
- `CodexPlus.native` sends host/native bridge requests exposed by Codex Plus
  hooks.
- `CodexPlus.styles` registers managed CSS and root CSS variables.
- `CodexPlus.patches` stores small runtime patch descriptors for cases where a
  plugin still needs a string or RegExp replacement.

## Built-In Plugins

- `aboutMetadata`
- `nestedRepositories`
- `diagnosticErrors`
- `userBubbleColors`
- `projectColors`
- `sidebarNameBlur`

## Current Limits

Host hooks still live in versioned minified-bundle patches. New feature work
should prefer adding or extending a generic runtime surface first, then hook that
surface into Codex core with the smallest versioned patch needed. Avoid placing
large feature bodies directly in minified transform strings when a reusable
plugin interface can carry the behavior.
