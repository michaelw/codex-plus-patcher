(function (globalObject) {
  const DEFAULT_REPO_URL = "https://github.com/michaelw/codex-plus-patcher";
  const DISCLAIMER_HEADING = "Disclaimer of Warranty and Limitation of Liability";
  const DISCLAIMER_BODY = [
    'THIS SOFTWARE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. This is a modified, binary-patched demonstrator provided strictly for experimental or demonstration purposes.',
    "The upstream developers, contributors, and maintainers assume NO responsibility or liability for any errors, malfunctions, data loss, or damages—including consequential or incidental damages—arising from the installation or use of this patched version. You use, test, or distribute this patched app at your sole and absolute risk.",
    "The original authors and upstream suppliers are under no obligation to provide support, updates, fixes, or assistance with any issues, mess, or conflicts caused by this modified build.",
  ].join("\n\n");

  function buildInfoLines(context = {}) {
    const appliedPatches = Array.isArray(context.appliedPatches) ? context.appliedPatches : [];
    return [
      `Patcher: ${context.patcherRepoUrl || DEFAULT_REPO_URL}`,
      `Patcher commit: ${context.patcherGitSha || "unknown"}`,
      `Source app.asar: ${context.sourceAsarSha256 || "unknown"}`,
      "",
      "Applied patches:",
      ...appliedPatches.map((patchId) => `- ${patchId}`),
    ];
  }

  function aboutPayload(context = {}) {
    return {
      appDisplayName: context.patchedAppDisplayName || "Codex Plus",
      buildInfoLines: buildInfoLines(context),
      disclaimerBody: DISCLAIMER_BODY,
      disclaimerHeading: DISCLAIMER_HEADING,
    };
  }

  function disclaimerStyles() {
    return [
      "    .codex-plus-disclaimer {",
      "      width: 100%;",
      "      margin: 0 0 12px;",
      "      color: var(--muted-text);",
      "      text-align: left;",
      "      font-size: 9px;",
      "      line-height: 1.25;",
      "      white-space: pre-wrap;",
      "      overflow-wrap: anywhere;",
      "    }",
      "",
      "    .codex-plus-disclaimer-heading {",
      "      margin-bottom: 4px;",
      "      font-weight: 700;",
      "    }",
    ].join("\n");
  }

  function disclaimerMarkup({ escape, heading, body }) {
    if (heading == null || body == null || typeof escape !== "function") return "";
    return `<section class="codex-plus-disclaimer" aria-label="${escape(heading)}"><div class="codex-plus-disclaimer-heading">${escape(heading)}</div><div class="codex-plus-disclaimer-body">${escape(body)}</div></section>`;
  }

  function browserBuildInfo() {
    return {
      heading: DISCLAIMER_HEADING,
      lines: ["Codex Plus runtime plugin layer active", "Plugin: aboutMetadata"],
    };
  }

  const exportsObject = {
    aboutPayload,
    browserBuildInfo,
    buildInfoLines,
    defaultRepoUrl: DEFAULT_REPO_URL,
    disclaimerBody: DISCLAIMER_BODY,
    disclaimerHeading: DISCLAIMER_HEADING,
    disclaimerMarkup,
    disclaimerStyles,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }

  const CodexPlus = globalObject?.CodexPlus;
  if (!CodexPlus) return;

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "aboutMetadata",
      name: "About Metadata",
      description: "Adds Codex Plus provenance and disclaimer metadata to the About dialog host surface.",
      required: true,
      exports: exportsObject,
      start(api) {
        api.ui.about.addBuildInfo(browserBuildInfo);
      },
    }),
  );
})(typeof window !== "undefined" ? window : globalThis);
