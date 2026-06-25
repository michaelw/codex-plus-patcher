function appearanceSettingsHook() {
  return "function CPXAppearanceRows(e){return window.CodexPlus?.ui?.settings?.appearance?.renderRows?.({deps:{React:X,jsx:Z.jsx,SettingRow:J,ColorInput:sn,Switch:q},variant:e})??[]}";
}

function commandMenuItemsExpression(group, jsx, menuItem, register) {
  return `window.CodexPlus?.ui?.commands?.renderMenuItems?.({group:\`${group}\`,deps:{jsx:${jsx},MenuItem:${menuItem},register:${register}}})??[]`;
}

module.exports = {
  appearanceSettingsHook,
  commandMenuItemsExpression,
};
