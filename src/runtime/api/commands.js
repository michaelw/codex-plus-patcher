(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core, safeId } = globalObject.__CodexPlusRuntime;

  function register(command) {
    core.commands.set(safeId(command.id), command);
    return command;
  }

  function run(id, ...args) {
    const command = core.commands.get(id);
    if (!command) throw new Error(`Unknown Codex Plus command: ${id}`);
    return command.run?.(...args);
  }

  function commandGroups(command) {
    return command.menu?.groups || [];
  }

  function commandKeybindings(command) {
    return command.shortcut?.defaultKeybindings || [];
  }

  function commandMetadata() {
    return Array.from(core.commands.values())
      .filter((command) => command.palette?.enabled !== false)
      .map((command) => {
        const groups = commandGroups(command);
        return {
          id: command.id,
          title: command.title,
          description: command.description,
          menuGroups: groups,
          defaultKeybindings: commandKeybindings(command),
          commandMenuGroupKey: groups.includes("panels") ? "panels" : groups[0],
          commandMenu: true,
          electron: {
            menuTitle: command.title,
            defaultKeybindings: commandKeybindings(command),
          },
        };
      });
  }

  function CommandMenuItemHost({ command, deps, group, close }) {
    const jsx = deps?.jsx;
    const MenuItem = deps?.MenuItem;
    if (typeof jsx !== "function" || MenuItem == null) return null;
    const render = (closeMenu) =>
      jsx(
        MenuItem,
        {
          value: command.title,
          title: command.title,
          description: command.description,
          onSelect() {
            run(command.id);
            closeMenu?.();
            close?.();
          },
        },
        command.id,
      );
    deps?.register?.(command.id, () => run(command.id), {
      menuItem: { id: command.id, groupKey: group, render },
    });
    return null;
  }

  function renderMenuItems({ group, deps, close } = {}) {
    const jsx = deps?.jsx;
    if (typeof jsx !== "function") return [];
    return Array.from(core.commands.values())
      .filter((command) => commandGroups(command).includes(group))
      .map((command) => jsx(CommandMenuItemHost, { command, deps, group, close }, command.id));
  }

  globalObject.CodexPlus.commands = {
    register,
    run,
    all: () => Array.from(core.commands.values()),
    menuItems: (group) => Array.from(core.commands.values()).filter((command) => commandGroups(command).includes(group)),
  };
  globalObject.CodexPlus.ui.commands = { renderMenuItems, commandMetadata };
})();
