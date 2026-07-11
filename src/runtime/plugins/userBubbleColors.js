(function () {
  const CodexPlus = window.CodexPlus;
  const STORAGE_KEY = "codex-plus:user-message-bubble-colors";
  const EVENT = "codex-plus:user-message-bubble-colors-change";

  function isColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function defaultColor(variant) {
    return variant === "dark" ? "#2f2f2f" : "#f2f2f2";
  }

  function isStoredColor(variant, value) {
    return isColor(value) && value.toLowerCase() !== defaultColor(variant);
  }

  function readColors(emptyValue = null) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
      return {
        light: isStoredColor("light", stored.light) ? stored.light : emptyValue,
        dark: isStoredColor("dark", stored.dark) ? stored.dark : emptyValue,
      };
    } catch {
      return { light: emptyValue, dark: emptyValue };
    }
  }

  function writeColor(variant, value) {
    const next = readColors(undefined);
    if (isStoredColor(variant, value)) next[variant] = value;
    else delete next[variant];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }

  function textColor(background) {
    const red = parseInt(background.slice(1, 3), 16);
    const green = parseInt(background.slice(3, 5), 16);
    const blue = parseInt(background.slice(5, 7), 16);
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
    const againstNearBlack = (luminance + 0.05) / (0.0056 + 0.05);
    const againstBlack = (luminance + 0.05) / 0.05;
    const againstWhite = 1.05 / (luminance + 0.05);
    if (againstNearBlack >= 4.5 && againstNearBlack >= againstWhite) return "#111111";
    return againstBlack >= againstWhite ? "#000000" : "#ffffff";
  }

  function setVars() {
    const colors = readColors(null);
    for (const variant of ["light", "dark"]) {
      const color = colors[variant];
      if (color == null) {
        document.documentElement.style.removeProperty(`--codex-plus-user-bubble-${variant}-bg`);
        document.documentElement.style.removeProperty(`--codex-plus-user-bubble-${variant}-fg`);
      } else {
        document.documentElement.style.setProperty(`--codex-plus-user-bubble-${variant}-bg`, color);
        document.documentElement.style.setProperty(`--codex-plus-user-bubble-${variant}-fg`, textColor(color));
      }
    }
  }

  function renderColorRow({ React, jsx, SettingRow, ColorInput, variant, label, ariaLabel }) {
    const [value, setValue] = React.useState(() => readColors("")[variant] || defaultColor(variant));
    React.useEffect(() => {
      const listener = () => setValue(readColors("")[variant] || defaultColor(variant));
      window.addEventListener(EVENT, listener);
      return () => window.removeEventListener(EVENT, listener);
    }, [variant]);
    return jsx(SettingRow, {
      control: jsx(ColorInput, {
        ariaLabel,
        value,
        onChange: (next) => {
          setValue(next);
          writeColor(variant, next);
        },
      }),
      label,
      variant: "nested",
    });
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "userBubbleColors",
      name: "User Bubble Colors",
      description: "Manages user-message bubble color settings and CSS variables.",
      required: true,
      styles:
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble]:not(:has([data-user-message-bubble])),:root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] [data-user-message-bubble],:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry]:not(:has([data-codex-plus-user-bubble])){background-color:var(--codex-plus-user-bubble-light-bg);color:var(--codex-plus-user-bubble-light-fg)}' +
        '[data-codex-plus-user-entry]:has([data-codex-plus-user-bubble]){background-color:transparent!important;box-shadow:none!important}' +
        '[data-codex-plus-user-bubble]:has([data-user-message-bubble]){background-color:transparent!important;box-shadow:none!important;border-left:0!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,[data-codex-plus-rich-content],[data-codex-plus-rich-content] *){color:var(--codex-plus-user-bubble-light-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]){color:var(--codex-plus-user-bubble-light-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){opacity:1!important;color:var(--codex-plus-user-bubble-light-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-light-fg)}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;color:var(--codex-plus-user-bubble-light-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-light-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-attachment-pill]{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-attachment-pill]:is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:#fff!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-attachment-pill] :is([role="button"],[role="button"] span,[class*="bg-token-menu-background"]){background-color:color-mix(in srgb,#000 52%,var(--codex-plus-user-bubble-light-bg))!important;color:#fff!important;border-color:color-mix(in srgb,#fff 28%,transparent)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-attachment-pill] [role="button"]::before{background:linear-gradient(to right,transparent,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg)) 55%,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg)))!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-attachment-pill] *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-composer-attachment-pill]{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-composer-attachment-pill] :is(*,[class*="text-token"],[class*="opacity-"]){color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-composer-attachment-pill] [role="button"]::before{background:linear-gradient(to right,transparent,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg)) 55%,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg)))!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] .composer-attachment-surface{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] .composer-attachment-surface :is(*,[class*="text-token"],[class*="opacity-"]){color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]){opacity:1!important;color:var(--codex-plus-user-bubble-light-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]) *{animation:none!important;background-image:none!important;color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder{color:var(--codex-plus-user-bubble-light-fg)}' +
        ':root.dark [data-codex-plus-user-bubble]:not(:has([data-user-message-bubble])),:root.dark [data-codex-plus-user-bubble] [data-user-message-bubble],:root.dark [data-codex-plus-user-entry]:not(:has([data-codex-plus-user-bubble])),:root.electron-dark [data-codex-plus-user-bubble]:not(:has([data-user-message-bubble])),:root.electron-dark [data-codex-plus-user-bubble] [data-user-message-bubble],:root.electron-dark [data-codex-plus-user-entry]:not(:has([data-codex-plus-user-bubble])){background-color:var(--codex-plus-user-bubble-dark-bg);color:var(--codex-plus-user-bubble-dark-fg)}' +
        ':root.dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,[data-codex-plus-rich-content],[data-codex-plus-rich-content] *),:root.electron-dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,[data-codex-plus-rich-content],[data-codex-plus-rich-content] *){color:var(--codex-plus-user-bubble-dark-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]),:root.electron-dark [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]){color:var(--codex-plus-user-bubble-dark-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){opacity:1!important;color:var(--codex-plus-user-bubble-dark-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *,:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.electron-dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]),:root.electron-dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-dark-fg)}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;color:var(--codex-plus-user-bubble-dark-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-dark-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *,:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-attachment-pill],:root.electron-dark [data-codex-plus-user-entry] [data-composer-attachment-pill]{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-attachment-pill]:is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]),:root.electron-dark [data-codex-plus-user-entry] [data-composer-attachment-pill]:is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:#fff!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-attachment-pill] :is([role="button"],[role="button"] span,[class*="bg-token-menu-background"]),:root.electron-dark [data-codex-plus-user-entry] [data-composer-attachment-pill] :is([role="button"],[role="button"] span,[class*="bg-token-menu-background"]){background-color:color-mix(in srgb,#000 52%,var(--codex-plus-user-bubble-dark-bg))!important;color:#fff!important;border-color:color-mix(in srgb,#fff 28%,transparent)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-attachment-pill] [role="button"]::before,:root.electron-dark [data-codex-plus-user-entry] [data-composer-attachment-pill] [role="button"]::before{background:linear-gradient(to right,transparent,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg)) 55%,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg)))!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-attachment-pill] *,:root.electron-dark [data-codex-plus-user-entry] [data-composer-attachment-pill] *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-composer-attachment-pill],:root.electron-dark [data-composer-attachment-pill]{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-composer-attachment-pill] :is(*,[class*="text-token"],[class*="opacity-"]),:root.electron-dark [data-composer-attachment-pill] :is(*,[class*="text-token"],[class*="opacity-"]){color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-composer-attachment-pill] [role="button"]::before,:root.electron-dark [data-composer-attachment-pill] [role="button"]::before{background:linear-gradient(to right,transparent,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg)) 55%,color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg)))!important}' +
        ':root.dark [data-codex-plus-user-entry] .composer-attachment-surface,:root.electron-dark [data-codex-plus-user-entry] .composer-attachment-surface{background-color:color-mix(in srgb,#000 62%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:#fff!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] .composer-attachment-surface :is(*,[class*="text-token"],[class*="opacity-"]),:root.electron-dark [data-codex-plus-user-entry] .composer-attachment-surface :is(*,[class*="text-token"],[class*="opacity-"]){color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]),:root.electron-dark [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]){opacity:1!important;color:var(--codex-plus-user-bubble-dark-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]) *,:root.electron-dark [data-codex-plus-user-entry] :is(button[aria-disabled="true"],button[class*="opacity-25"],[role="button"][aria-disabled="true"],[role="button"][class*="opacity-25"]) *{animation:none!important;background-image:none!important;color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root.dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root.dark [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder,:root.electron-dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root.electron-dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root.electron-dark [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder{color:var(--codex-plus-user-bubble-dark-fg)}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *,:root.dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root.dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *,:root.electron-dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root.electron-dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *{color:var(--color-token-text-tertiary)!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}',
      exports: {
        defaultColor,
        eventName: EVENT,
        isColor,
        isStoredColor,
        readColors,
        renderColorRow,
        setVars,
        textColor,
        writeColor,
      },
      start(api) {
        api.ui.settings.appearance.addRow({
          id: "codex-plus-user-bubble-colors",
          order: 10,
          plugin: "userBubbleColors",
          render: (deps) => renderColorRow({
            ...deps,
            label: "User bubble",
            ariaLabel: `${deps.variant || "Current"} user message bubble color`,
          }),
        });
        api.ui.message.decorateUserBubble(() => ({ "data-codex-plus-user-bubble": "" }));
        api.ui.composer.decorateSurface(() => ({ "data-codex-plus-user-entry": "" }));
        setVars();
        window.addEventListener(EVENT, setVars);
      },
      stop() {
        window.removeEventListener(EVENT, setVars);
      },
    }),
  );
})();
