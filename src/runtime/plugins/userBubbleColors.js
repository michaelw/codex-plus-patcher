(function () {
  const CodexPlus = window.CodexPlus;
  const STORAGE_KEY = "codex-plus:user-message-bubble-colors";
  const EVENT = "codex-plus:user-message-bubble-colors-change";
  const AUTO_CONTRAST_ATTRIBUTE = "data-codex-plus-auto-contrast";
  const contrastOriginals = new WeakMap();
  let contrastObserver = null;
  let contrastFrame = null;
  let contrastTimer = null;

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

  function controlTextColor(background) {
    const baseForeground = textColor(background);
    const mix = (foreground, base, amount) => {
      const channel = (color, offset) => parseInt(color.slice(offset, offset + 2), 16);
      const value = (offset) => Math.round(channel(foreground, offset) * amount + channel(base, offset) * (1 - amount));
      return `#${[1, 3, 5].map((offset) => value(offset).toString(16).padStart(2, "0")).join("")}`;
    };
    return textColor(mix(baseForeground, background, 0.14));
  }

  function parseCssColor(value) {
    if (typeof value !== "string") return null;
    const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16)).concat(1);
    }
    const rgb = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (!rgb) return null;
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] == null ? 1 : Number(rgb[4])];
  }

  function relativeLuminance(value) {
    const color = parseCssColor(value);
    if (!color) return null;
    const channel = (component) => {
      const normalized = component / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
  }

  function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground);
    const backgroundLuminance = relativeLuminance(background);
    if (foregroundLuminance == null || backgroundLuminance == null) return 0;
    const light = Math.max(foregroundLuminance, backgroundLuminance);
    const dark = Math.min(foregroundLuminance, backgroundLuminance);
    return (light + 0.05) / (dark + 0.05);
  }

  function contrastForeground(background) {
    return contrastRatio("#111111", background) >= contrastRatio("#ffffff", background) ? "#111111" : "#ffffff";
  }

  function effectiveBackground(element, boundary) {
    for (let current = element; current; current = current.parentElement) {
      const background = window.getComputedStyle(current).backgroundColor;
      const parsed = parseCssColor(background);
      if (parsed && parsed[3] >= 0.95) return background;
      if (current === boundary) break;
    }
    return window.getComputedStyle(document.documentElement).backgroundColor || "rgb(255, 255, 255)";
  }

  function composerBackground(element, surface) {
    const background = window.getComputedStyle(element).backgroundColor;
    const parsed = parseCssColor(background);
    const transparent = background === "transparent" || (parsed && parsed[3] < 0.05);
    if (element.matches?.("button,[role='button']") && transparent) {
      return window.getComputedStyle(surface).backgroundColor;
    }
    return effectiveBackground(element, surface);
  }

  function restoreComposerContrast(element) {
    const original = contrastOriginals.get(element);
    if (!original) return;
    for (const [property, value, priority] of original) {
      if (value) element.style?.setProperty?.(property, value, priority);
      else element.style?.removeProperty?.(property);
    }
    element.removeAttribute?.(AUTO_CONTRAST_ATTRIBUTE);
    contrastOriginals.delete(element);
  }

  function applyComposerContrast(surface) {
    if (!surface?.querySelectorAll || typeof window.getComputedStyle !== "function") return 0;
    const elements = [surface, ...surface.querySelectorAll("*")];
    for (const element of elements) {
      restoreComposerContrast(element);
    }
    let adjusted = 0;
    for (const element of elements) {
      if (element !== surface && element.closest?.(".ProseMirror")) continue;
      if (element.closest?.("[class*='h-token-button-composer']")) continue;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const foreground = style.color;
      const background = composerBackground(element, surface);
      if (contrastRatio(foreground, background) >= 4.5) continue;
      const nextForeground = contrastForeground(background);
      contrastOriginals.set(element, ["color", "-webkit-text-fill-color", "opacity"].map((property) => [
        property,
        element.style?.getPropertyValue?.(property) || "",
        element.style?.getPropertyPriority?.(property) || "",
      ]));
      element.setAttribute?.(AUTO_CONTRAST_ATTRIBUTE, "");
      element.style?.setProperty?.("color", nextForeground, "important");
      element.style?.setProperty?.("-webkit-text-fill-color", "currentColor", "important");
      element.style?.setProperty?.("opacity", "1", "important");
      adjusted += 1;
    }
    return adjusted;
  }

  function refreshComposerContrast() {
    contrastFrame = null;
    for (const surface of document.querySelectorAll?.("[data-codex-plus-user-entry]") || []) {
      applyComposerContrast(surface);
    }
  }

  function scheduleComposerContrast() {
    if (contrastFrame != null) return;
    const schedule = window.requestAnimationFrame || (typeof window.setTimeout === "function"
      ? (callback) => window.setTimeout(callback, 0)
      : null);
    if (!schedule) return;
    contrastFrame = schedule(refreshComposerContrast);
  }

  function scheduleComposerContrastSettled() {
    scheduleComposerContrast();
    if (contrastTimer != null) window.clearTimeout?.(contrastTimer);
    contrastTimer = window.setTimeout?.(() => {
      contrastTimer = null;
      refreshComposerContrast();
    }, 750) ?? null;
  }

  function setVars() {
    const colors = readColors(null);
    for (const variant of ["light", "dark"]) {
      const color = colors[variant];
      if (color == null) {
        document.documentElement.style.removeProperty(`--codex-plus-user-bubble-${variant}-bg`);
        document.documentElement.style.removeProperty(`--codex-plus-user-bubble-${variant}-fg`);
        document.documentElement.style.removeProperty(`--codex-plus-user-bubble-${variant}-control-fg`);
      } else {
        document.documentElement.style.setProperty(`--codex-plus-user-bubble-${variant}-bg`, color);
        document.documentElement.style.setProperty(`--codex-plus-user-bubble-${variant}-fg`, textColor(color));
        document.documentElement.style.setProperty(`--codex-plus-user-bubble-${variant}-control-fg`, controlTextColor(color));
      }
    }
    scheduleComposerContrastSettled();
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
        '[data-codex-plus-user-entry] .composer-surface-chrome{background-color:transparent!important;background-image:none!important}' +
        '[data-codex-plus-user-entry] [data-composer-layout]{background-color:transparent!important;background-image:none!important}' +
        '[data-codex-plus-user-entry]:has([data-codex-plus-user-bubble]){background-color:transparent!important;box-shadow:none!important}' +
        '[data-codex-plus-user-bubble]:has([data-user-message-bubble]){background-color:transparent!important;box-shadow:none!important;border-left:0!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,[data-codex-plus-rich-content],[data-codex-plus-rich-content] *){color:var(--codex-plus-user-bubble-light-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,textarea,[contenteditable="true"]){caret-color:var(--codex-plus-user-bubble-light-fg)!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-code-block-toolbar]{background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-light-control-fg)!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-code-block-toolbar] button{background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:inherit!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [data-composer-code-block-toolbar] *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]){color:var(--codex-plus-user-bubble-light-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){opacity:1!important;color:var(--codex-plus-user-bubble-light-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-light-fg)}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [class*="h-token-button-composer"]{color:var(--codex-plus-user-bubble-light-fg)!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] [class*="h-token-button-composer"] *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;color:var(--codex-plus-user-bubble-light-control-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-light-fg) 14%,var(--codex-plus-user-bubble-light-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-light-control-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
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
        ':root.dark [data-codex-plus-user-entry] :is(.ProseMirror,textarea,[contenteditable="true"]),:root.electron-dark [data-codex-plus-user-entry] :is(.ProseMirror,textarea,[contenteditable="true"]){caret-color:var(--codex-plus-user-bubble-dark-fg)!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar],:root.electron-dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar]{background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-dark-control-fg)!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar] button,:root.electron-dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar] button{background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:inherit!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar] *,:root.electron-dark [data-codex-plus-user-entry] [data-composer-code-block-toolbar] *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]),:root.electron-dark [data-codex-plus-user-bubble] :is(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,[class*="text-token"],[class*="opacity-"]){color:var(--codex-plus-user-bubble-dark-fg)!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){opacity:1!important;color:var(--codex-plus-user-bubble-dark-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *,:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):not([data-composer-code-block-toolbar] *):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.electron-dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]),:root.electron-dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-dark-fg)}' +
        ':root.dark [data-codex-plus-user-entry] [class*="h-token-button-composer"],:root.electron-dark [data-codex-plus-user-entry] [class*="h-token-button-composer"]{color:var(--codex-plus-user-bubble-dark-fg)!important;opacity:1!important;-webkit-text-fill-color:currentColor!important}:root.dark [data-codex-plus-user-entry] [class*="h-token-button-composer"] *,:root.electron-dark [data-codex-plus-user-entry] [class*="h-token-button-composer"] *{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;color:var(--codex-plus-user-bubble-dark-control-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]),:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]):is(:hover,:focus-visible,:active,[data-state="open"],[aria-expanded="true"]){background-color:color-mix(in srgb,var(--codex-plus-user-bubble-dark-fg) 14%,var(--codex-plus-user-bubble-dark-bg))!important;background-image:none!important;color:var(--codex-plus-user-bubble-dark-control-fg)!important;-webkit-text-fill-color:currentColor!important}' +
        ':root.dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *,:root.electron-dark [data-codex-plus-user-entry] :is(button,[role="button"]):is([class*="rounded-full"],[class*="rounded-"]):is([class*="bg-token-foreground"],[class*="bg-token-input"],[class*="bg-token-dropdown"]):not([data-composer-attachment-pill]):not([class*="bg-token-foreground-inverse"]):not([class*="bg-token-foreground-primary"]):not([class*="bg-token-foreground-button"]) *{color:inherit!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
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
        ':root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *,:root.dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root.dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *,:root.electron-dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ *,:root.electron-dark [data-codex-plus-user-bubble] [data-user-message-bubble] ~ * *{color:var(--color-token-text-tertiary)!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important}' +
        '[data-codex-plus-auto-contrast] :is(svg,path){color:inherit!important;stroke:currentColor!important}',
      exports: {
        applyComposerContrast,
        contrastForeground,
        contrastRatio,
        defaultColor,
        controlTextColor,
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
        if (typeof MutationObserver === "function" && document.documentElement) {
          contrastObserver = new MutationObserver(scheduleComposerContrast);
          contrastObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-state", "aria-expanded"],
            childList: true,
            subtree: true,
          });
        }
      },
      stop() {
        window.removeEventListener(EVENT, setVars);
        contrastObserver?.disconnect();
        contrastObserver = null;
        for (const element of document.querySelectorAll?.(`[${AUTO_CONTRAST_ATTRIBUTE}]`) || []) {
          restoreComposerContrast(element);
        }
        if (contrastFrame != null) {
          const cancel = window.cancelAnimationFrame || window.clearTimeout;
          cancel?.(contrastFrame);
          contrastFrame = null;
        }
        if (contrastTimer != null) {
          window.clearTimeout?.(contrastTimer);
          contrastTimer = null;
        }
      },
    }),
  );
})();
