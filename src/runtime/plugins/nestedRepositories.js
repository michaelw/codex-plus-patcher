(function () {
  const CodexPlus = window.CodexPlus;

  function repoKey(repo) {
    return repo?.id ?? repo?.cwd ?? repo?.path ?? "unknown";
  }

  function label(repo) {
    return repo?.kind === "main" ? "Main" : repo?.label ?? repo?.path ?? "Repository";
  }

  function sessionKey(hostId, conversationId, cwd) {
    return JSON.stringify([hostId, conversationId, cwd]);
  }

  function fallbackCwdFromProjectHeader() {
    const virtualContext = activeVirtualProjectContext();
    if (virtualContext?.cwd) return virtualContext.cwd;
    const projectButton = document.querySelector("button[aria-label^='Project:']");
    const label = projectButton?.getAttribute("aria-label")?.replace(/^Project:\s*/, "").trim();
    if (!label) return null;
    const rows = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row][data-app-action-sidebar-project-label]"));
    const row = rows.find((element) => element.getAttribute("data-app-action-sidebar-project-label") === label);
    return row?.getAttribute("data-app-action-sidebar-project-id") || null;
  }

  function watchFallbackCwd(setCwd) {
    const update = () => setCwd(fallbackCwdFromProjectHeader());
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", update, { once: true });
      return () => window.removeEventListener("DOMContentLoaded", update);
    }
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }

  function atomValue(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function hasPathValue(value, pathValue) {
    if (value == null) return false;
    return (typeof pathValue === "function" ? pathValue(value) : value) != null;
  }

  function activeVirtualProjectContext() {
    const route =
      CodexPlus?.ui?.virtualConversations?.activeRouteId?.() ||
      decodeURIComponent(String(window.location?.hash || "").replace(/^#/, ""));
    const context = CodexPlus?.ui?.projectContext?.active?.();
    return context?.cwd ? { cwd: String(context.cwd), label: context.label || "", route: String(route) } : null;
  }

  function workerRequest(workerId, method, params, signal) {
    const bridge = window.electronBridge;
    if (typeof bridge?.sendWorkerMessageFromView !== "function" || typeof bridge?.subscribeToWorkerMessages !== "function") {
      return Promise.reject(new Error("Electron worker bridge is unavailable"));
    }
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const id = `codex-plus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const request = { id, method, params };
    return new Promise((resolve, reject) => {
      let unsubscribe = null;
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        unsubscribe?.();
        signal?.removeEventListener?.("abort", abort);
      };
      const abort = () => {
        cleanup();
        bridge.sendWorkerMessageFromView(workerId, { type: "worker-request-cancel", workerId, id }).catch(() => {});
        reject(new DOMException("Aborted", "AbortError"));
      };
      unsubscribe = bridge.subscribeToWorkerMessages(workerId, (message) => {
        if (message?.type !== "worker-response" || message?.workerId !== workerId || message?.response?.id !== id) return;
        cleanup();
        const result = message.response.result;
        if (result?.type === "ok") resolve(result.value);
        else reject(new Error(result?.error?.message || "Worker request failed"));
      });
      signal?.addEventListener?.("abort", abort, { once: true });
      bridge.sendWorkerMessageFromView(workerId, { type: "worker-request", workerId, request }).catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  function debugText(value) {
    try {
      return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? String(item) : item), 2) ?? "";
    } catch (error) {
      return `Unable to render debug object: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function Warnings({ warnings }, deps) {
    const { jsx } = deps;
    if (!warnings || warnings.length === 0) return null;
    return jsx("div", {
      className: "px-3 py-2 text-xs text-token-description-foreground",
      children: warnings.map((warning, index) =>
        jsx("div", { children: warning.message ?? warning.type ?? String(warning) }, `${warning.type ?? "warning"}:${warning.path ?? index}`),
      ),
    });
  }

  function Debug({ debug }, deps) {
    const { jsx, jsxs } = deps;
    if (debug == null) return null;
    const plusToml = debug.plusToml ?? {};
    const readState = plusToml.readOk === true ? "read ok" : "not read";
    const parsedCount = String(plusToml.parsedRepositories ?? 0);
    return jsxs("details", {
      className: "mx-3 mb-2 rounded-md border border-token-border bg-token-main-surface-secondary px-2 py-1 text-xs text-token-description-foreground",
      children: [
        jsxs("summary", { className: "cursor-pointer select-none", children: ["plus.toml debug: ", readState, ", parsed ", parsedCount] }),
        jsx("pre", {
          className: "mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-vscode-editor text-[11px] leading-4 text-token-foreground",
          children: debugText(debug),
        }),
      ],
    });
  }

  function MainGroup({ children, repo, collapsed, onToggle }, deps) {
    const { jsx, jsxs } = deps;
    return jsxs("section", {
      className: "border-b border-token-border-default",
      children: [
        jsxs("button", {
          type: "button",
          className: "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-token-foreground hover:bg-token-list-hover-background",
          onClick: onToggle,
          "aria-expanded": !collapsed,
          children: [
            jsxs("span", {
              className: "min-w-0",
              children: [
                jsx("span", { className: "font-medium", children: label(repo) }),
                jsx("span", { className: "ml-2 text-xs text-token-description-foreground", children: repo?.path ?? "." }),
              ],
            }),
            jsx("span", { className: "shrink-0 text-xs text-token-description-foreground", children: collapsed ? "Show" : "Hide" }),
          ],
        }),
        collapsed ? null : children,
      ],
    });
  }

  function UpstreamReviewFallback(_, deps) {
    return deps.jsx("div", {
      className: "mx-3 mb-3 rounded-md border border-token-border bg-token-main-surface-secondary px-3 py-2 text-xs text-token-description-foreground",
      children: "Unstaged",
    });
  }

  function PlainDiff({ text }, deps) {
    return deps.jsx("pre", {
      className: "mx-3 mb-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-3 font-vscode-editor text-xs leading-5 text-token-foreground",
      children: text,
    });
  }

  function RepoDiffBody({ cwd, hostConfig, conversationId, diffMode, diffText, statusText, error, isLoading }, deps) {
    const { jsx, createElement, parseDiff, DiffCard, pathValue } = deps;
    if (error != null || isLoading || diffText == null) return PlainDiff({ text: statusText }, deps);
    if (typeof parseDiff !== "function" || typeof DiffCard !== "function") return PlainDiff({ text: diffText }, deps);
    let parsed;
    try {
      parsed = parseDiff(diffText);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      return PlainDiff({ text: `Unable to parse diff: ${message}\n\n${diffText}` }, deps);
    }
    if (parsed == null || parsed.length === 0) return PlainDiff({ text: statusText }, deps);
    return jsx("div", {
      className: "mx-3 mb-3 flex min-w-0 max-w-none flex-col gap-2",
      children: parsed.map((diff, index) =>
        createElement(DiffCard, {
          key: `${diff.metadata?.newPath ?? diff.metadata?.oldPath ?? index}:${index}`,
          containerClassName: "codex-review-diff-card extension:rounded-lg w-full max-w-none",
          conversationId: conversationId ?? undefined,
          cwd: pathValue(cwd) ?? cwd,
          defaultOpen: true,
          diff,
          diffViewWrap: true,
          expandScope: "review",
          fullContentNextFallbackToDisk: true,
          headerVariant: "full-review",
          hostConfig,
          hunkActionsVariant: "unstaged",
          hunkSeparators: diff.metadata?.additionLines ? "line-info" : "metadata",
          roundedCorners: false,
          showFileActions: false,
          showHunkActions: false,
          stickyHeader: false,
          viewType: diffMode ?? "unified",
        }),
      ),
    });
  }

  function branchName(branch) {
    return typeof branch === "string" ? branch : branch?.name;
  }

  function mergeBranches(...branchLists) {
    const seen = new Set();
    const merged = [];
    for (const branches of branchLists) {
      for (const branch of branches ?? []) {
        const name = branchName(branch);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        merged.push(typeof branch === "string" ? { name } : branch);
      }
    }
    return merged;
  }

  function BranchPicker({ repo, hostConfig, baseBranch, setBaseBranch, currentBranch, deps }) {
    const { jsx, jsxs, React, Button, Tooltip, Icon, Dropdown, DropdownMenu, BranchPickerDropdownContent, gitRequest } = deps;
    const [open, setOpen] = React.useState(false);
    const [branches, setBranches] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const [searchedBranches, setSearchedBranches] = React.useState([]);
    const [searchLoading, setSearchLoading] = React.useState(false);
    const [searchError, setSearchError] = React.useState(null);
    const selected = (baseBranch ?? "").trim();

    const loadBranches = ({ force = false } = {}) => {
      if (!force && branches.length > 0) return { abort() {} };
      const controller = new AbortController();
      setLoading(true);
      setError(null);
      gitRequest("git")
        .request({
          method: "codex-plus-branches",
          params: { root: repo.root, limit: 100, hostConfig, operationSource: "codex_plus_review" },
          signal: controller.signal,
        })
        .then((result) => setBranches(result?.branches ?? []))
        .catch((loadError) => {
          if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return controller;
    };

    React.useEffect(() => {
      if (!open) return undefined;
      const controller = loadBranches();
      return () => controller.abort();
    }, [open, repo.root, hostConfig.id, branches.length]);

    React.useEffect(() => {
      const controller = loadBranches({ force: true });
      return () => controller.abort();
    }, [repo.root, hostConfig.id]);

    React.useEffect(() => {
      if (!open) return undefined;
      const trimmed = query.trim();
      if (!trimmed) {
        setSearchedBranches([]);
        setSearchError(null);
        setSearchLoading(false);
        return undefined;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        setSearchLoading(true);
        setSearchError(null);
        gitRequest("git")
          .request({
            method: "codex-plus-branches",
            params: { root: repo.root, query: trimmed, limit: 50, hostConfig, operationSource: "codex_plus_review" },
            signal: controller.signal,
          })
          .then((result) => setSearchedBranches(result?.branches ?? []))
          .catch((searchLoadError) => {
            if (!controller.signal.aborted) setSearchError(searchLoadError instanceof Error ? searchLoadError.message : String(searchLoadError));
          })
          .finally(() => {
            if (!controller.signal.aborted) setSearchLoading(false);
          });
      }, 250);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }, [open, query, repo.root, hostConfig.id]);

    const title = selected || "Unstaged";
    const currentBranches = currentBranch ? [{ name: currentBranch }] : [];
    const displayBranches = mergeBranches(currentBranches, branches, searchedBranches);
    const loadState = error != null ? "error" : loading && displayBranches.length === 0 ? "loading" : displayBranches.length > 0 ? "loaded" : "empty";
    const searchState = searchError != null ? "error" : searchLoading ? "loading" : searchedBranches.length > 0 ? "loaded" : query.trim() ? "empty" : "idle";
    if (!Button || !Tooltip || !Icon || !Dropdown || !DropdownMenu || !BranchPickerDropdownContent) {
      return jsxs("div", {
        className: "relative min-w-32 max-w-52 shrink-0 text-xs text-token-description-foreground",
        children: [
          jsx("span", { className: "sr-only", children: "Base branch" }),
          jsx("button", {
            type: "button",
            "data-codex-plus-repo-branch-picker": "",
            "data-codex-plus-repo-kind": repo.kind,
            "data-codex-plus-repo-path": repo.path ?? "",
            "data-codex-plus-repo-branch-count": String(displayBranches.length),
            "data-codex-plus-repo-current-branch": currentBranch ?? "",
            "data-codex-plus-repo-branch-load-state": loadState,
            "data-codex-plus-repo-branch-load-error": error ?? "",
            "data-codex-plus-repo-branch-search-state": searchState,
            "data-codex-plus-repo-branch-search-error": searchError ?? "",
            className:
              "flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-token-border bg-token-main-surface-primary px-2 py-1 text-left text-xs text-token-foreground",
            disabled: (loading || error != null) && displayBranches.length === 0,
            onClick: () => setOpen(!open),
            children: [
              jsx("span", { className: "min-w-0 truncate", children: loading && displayBranches.length === 0 ? "Loading..." : title }),
              jsx("span", { className: "shrink-0 text-token-description-foreground", children: "⌄" }),
            ],
          }),
          open
            ? jsxs("div", {
                className:
                  "absolute right-0 z-50 mt-1 max-h-64 min-w-full overflow-auto rounded-md border border-token-border bg-token-main-surface-primary p-1 shadow-lg",
                role: "menu",
                children: [
                  jsx("button", {
                    type: "button",
                    role: "menuitem",
                    "data-codex-plus-repo-branch-option": "unstaged",
                    className: "block w-full rounded px-2 py-1 text-left text-xs text-token-foreground hover:bg-token-list-hover-background",
                    onClick: () => {
                      setBaseBranch("");
                      setOpen(false);
                    },
                    children: "Unstaged",
                  }, "unstaged"),
                  ...displayBranches.map((branch) =>
                    jsx("button", {
                      type: "button",
                      role: "menuitem",
                      "data-codex-plus-repo-branch-option": branch.name,
                      className: "block w-full rounded px-2 py-1 text-left text-xs text-token-foreground hover:bg-token-list-hover-background",
                      onClick: () => {
                        setBaseBranch(branch.name);
                        setOpen(false);
                      },
                      children: branch.name,
                    }, branch.name),
                  ),
                ],
              })
            : null,
        ],
      });
    }
    const button = jsxs(Button, {
      type: "button",
      "data-codex-plus-repo-branch-picker": "",
      "data-codex-plus-repo-kind": repo.kind,
      "data-codex-plus-repo-path": repo.path ?? "",
      "data-codex-plus-repo-branch-count": String(displayBranches.length),
      "data-codex-plus-repo-current-branch": currentBranch ?? "",
      "data-codex-plus-repo-branch-load-state": loadState,
      "data-codex-plus-repo-branch-load-error": error ?? "",
      "data-codex-plus-repo-branch-search-state": searchState,
      "data-codex-plus-repo-branch-search-error": searchError ?? "",
      color: selected ? "ghostActive" : "ghost",
      size: "toolbar",
      className: "max-w-44 min-w-0 shrink-0 border-token-border px-1.5",
      children: [jsx("span", { className: "min-w-0 truncate", children: title }), jsx(Icon, { className: "icon-2xs text-token-input-placeholder-foreground" })],
    });
    const triggerButton = jsx(Tooltip, { tooltipContent: selected ? `Base branch: ${title}` : "Working tree changes", children: button });
    const dropdownContent = jsx(BranchPickerDropdownContent, {
      branches: displayBranches,
      selectedBranch: selected,
      disabled: false,
      isError: error != null,
      isLoading: loading && displayBranches.length === 0,
      isSearchError: searchError != null,
      isSearchLoading: searchLoading,
      onClose: () => setOpen(false),
      onRetry: () => loadBranches({ force: true }),
      onRetrySearch: () => setQuery(query),
      onSearchQueryChange: setQuery,
      onSelectBranch: (branch) => {
        setBaseBranch(branch);
        setOpen(false);
      },
      searchedBranches,
      searchQuery: query,
    });
    const unstaged = selected
      ? jsxs(deps.Fragment, {
          children: [
            jsx(DropdownMenu.Separator, {}),
            jsx(DropdownMenu.Item, {
              onSelect: () => {
                setBaseBranch("");
                setOpen(false);
              },
              children: "Show unstaged changes",
            }),
          ],
        })
      : null;
    return jsx(Dropdown, {
      align: "end",
      contentWidth: "menu",
      open,
      onOpenChange: setOpen,
      triggerButton,
      children: jsxs(deps.Fragment, { children: [dropdownContent, unstaged] }),
    });
  }

  function RepoPatchGroup({ repo, hostConfig, hostId, conversationId, diffMode, baseBranch, setBaseBranch, collapsed, setCollapsed, deps }) {
    const { jsx, jsxs, React, ReviewToolbar, gitRequest, pathValue } = deps;
    const [diffText, setDiffText] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [currentBranch, setCurrentBranch] = React.useState(null);

    React.useEffect(() => {
      const repoCwd = pathValue(repo.cwd) ?? repo.cwd;
      let cancelled = false;
      const controller = new AbortController();
      setDiffText(null);
      setError(null);
      setLoading(true);
      gitRequest("git")
        .request({ method: "codex-plus-current-branch", params: { root: repo.root, hostConfig, operationSource: "codex_plus_review" }, signal: controller.signal })
        .then((result) => {
          if (!cancelled) setCurrentBranch(result?.branch ?? null);
        })
        .catch(() => {
          if (!cancelled) setCurrentBranch(null);
        });

      const selected = (baseBranch ?? "").trim();
      gitRequest("git")
        .request({
          method: "review-patch",
          params: {
            cwd: repoCwd,
            source: selected ? "branch" : "unstaged",
            operationSource: "codex_plus_review",
            hostConfig,
            ...(selected ? { baseBranch: selected } : {}),
          },
          signal: controller.signal,
        })
        .then((result) => {
          if (cancelled) return;
          const text = result?.diff?.type === "success" ? result.diff.unifiedDiff ?? result.diff.diff ?? "" : "";
          setDiffText(text.trim().length > 0 ? text : null);
        })
        .catch((loadError) => {
          if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [repo.cwd, repo.root, hostConfig.id, baseBranch]);

    const statusText = error ?? (loading ? "Loading diff..." : diffText == null ? "No changes" : diffText);
    return jsxs("section", {
      className: "relative z-0 mt-3 clear-both border-b border-token-border-default",
      children: [
        jsxs("div", {
          className: "relative z-10 flex min-w-0 items-center gap-2 bg-token-main-surface-primary px-3 py-2",
          children: [
            jsxs("button", {
              type: "button",
              className: "min-w-0 flex-1 text-left hover:bg-token-list-hover-background",
              onClick: () => setCollapsed(!collapsed),
              "aria-expanded": !collapsed,
              children: [
                jsx("div", { className: "truncate text-sm font-medium text-token-foreground", children: label(repo) }),
                jsx("div", {
                  className: "truncate text-xs text-token-description-foreground",
                  children: [repo.kind, repo.path ?? "", currentBranch ? ` - ${currentBranch}` : ""].filter(Boolean).join(" / "),
                }),
              ],
            }),
            jsx(BranchPicker, { repo, hostConfig, baseBranch, setBaseBranch, currentBranch, deps }),
            ReviewToolbar
              ? jsx(ReviewToolbar, {
                  conversationId,
                  cwd: repo.cwd,
                  hostId,
                  codexWorktree: false,
                  surface: "review-toolbar",
                  reviewToolbarCompact: true,
                }, repo.id)
              : null,
          ],
        }),
        collapsed ? null : RepoDiffBody({ cwd: repo.cwd, hostConfig, conversationId, diffMode, diffText, statusText, error, isLoading: loading }, deps),
      ],
    });
  }

  function ReviewMux(props, deps) {
    const { jsx, jsxs, React, useStore, useAtom, routeAtom, cwdAtom, hostIdAtom, hostConfigAtom, conversationIdAtom, gitRequest, pathValue, DefaultReview } = deps;
    const routeStore = useStore(routeAtom);
    const atomCwd = atomValue(useAtom(cwdAtom));
    const virtualContext = activeVirtualProjectContext();
    const [fallbackCwd, setFallbackCwd] = React.useState(() => fallbackCwdFromProjectHeader());
    const liveFallbackCwd = fallbackCwd ?? fallbackCwdFromProjectHeader();
    const cwd = virtualContext?.cwd ?? (hasPathValue(atomCwd, pathValue) ? atomCwd : liveFallbackCwd);
    const hostId = atomValue(useAtom(hostIdAtom));
    const hostConfig = atomValue(useAtom(hostConfigAtom));
    const conversationAtomValue = conversationIdAtom ? atomValue(useAtom(conversationIdAtom)) : null;
    const conversationId = virtualContext?.route ?? (routeStore.value.routeKind === "local-thread" ? routeStore.value.conversationId : null);
    const [targets, setTargets] = React.useState(null);
    const [collapsed, setCollapsedState] = React.useState(() => new Map());
    const [baseBranches, setBaseBranches] = React.useState(() => new Map());
    const mainReviewContent = props.mainReviewContent;
    const upstreamReview = React.useMemo(
      () => mainReviewContent ?? jsx(DefaultReview, props),
      [mainReviewContent, props.diffRefs, props.diffMode, props.isCappedMode, props.reviewDiffMetrics, props.showReviewGitActions],
    );
    const UpstreamReviewBoundary = React.useMemo(() => {
      return class extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }

        static getDerivedStateFromError(error) {
          return { error };
        }

        render() {
          return this.state.error == null ? this.props.children : this.props.fallback;
        }
      };
    }, [React]);
    const safeUpstreamReview = jsx(UpstreamReviewBoundary, {
      fallback: UpstreamReviewFallback({}, deps),
      children: upstreamReview,
    });

    React.useEffect(() => {
      if (atomCwd != null) return undefined;
      return watchFallbackCwd(setFallbackCwd);
    }, [atomCwd]);

    React.useEffect(() => {
      const cwdPath = pathValue(cwd) ?? cwd;
      if (cwdPath == null || hostConfig == null) {
        setTargets(null);
        return undefined;
      }
      let cancelled = false;
      const controller = new AbortController();
      gitRequest("git")
        .request({
          method: "repository-targets",
          params: { cwd: cwdPath, hostId, hostConfig, operationSource: "codex_plus_review" },
          signal: controller.signal,
        })
        .then((result) => {
          if (!cancelled) setTargets(result);
        })
        .catch((error) => {
          if (!cancelled) setTargets({ main: null, repositories: [], warnings: [{ type: "load-error", message: error instanceof Error ? error.message : String(error) }] });
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [cwd, hostId, hostConfig?.id]);

    const cwdPath = pathValue(cwd) ?? cwd;
    const main = targets?.main ?? (cwdPath == null ? null : { id: `main:${cwdPath}`, kind: "main", path: ".", label: "Main", cwd: cwdPath });
    const repositories = targets?.repositories ?? [];
    const all = [main, ...repositories].filter(Boolean);
    if (!virtualContext && (main == null || (all.length <= 1 && (!targets?.warnings || targets.warnings.length === 0) && targets?.debug == null))) return safeUpstreamReview;

    const session = sessionKey(hostId, conversationId ?? conversationAtomValue, cwdPath);
    const keyFor = (repo) => `${session}:${repoKey(repo)}`;
    const isCollapsed = (repo) => collapsed.get(keyFor(repo)) === true;
    const setCollapsed = (repo, next) =>
      setCollapsedState((current) => {
        const copy = new Map(current);
        if (next) copy.set(keyFor(repo), true);
        else copy.delete(keyFor(repo));
        return copy;
      });
    const setBaseBranch = (repo, branch) =>
      setBaseBranches((current) => {
        const copy = new Map(current);
        copy.set(keyFor(repo), branch);
        return copy;
      });

    return jsxs("div", {
      className: "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto",
      children: [
        jsx("div", { className: "px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-token-description-foreground", children: "Codex Plus repositories" }),
        Warnings({ warnings: targets?.warnings ?? [] }, deps),
        Debug({ debug: targets?.debug }, deps),
        virtualContext
          ? null
          : main
            ? MainGroup({ repo: main, collapsed: isCollapsed(main), onToggle: () => setCollapsed(main, !isCollapsed(main)), children: safeUpstreamReview }, deps)
            : safeUpstreamReview,
        (virtualContext ? all : repositories).map((repo) =>
          jsx(
            RepoPatchGroup,
            {
              repo,
              hostConfig,
              hostId,
              conversationId,
              diffMode: props.diffMode,
              baseBranch: baseBranches.get(keyFor(repo)) ?? "",
              setBaseBranch: (branch) => setBaseBranch(repo, branch),
              collapsed: isCollapsed(repo),
              setCollapsed: (next) => setCollapsed(repo, next),
              deps,
            },
            repoKey(repo),
          ),
        ),
      ],
    });
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "nestedRepositories",
      name: "Nested Repositories",
      description: "Hosts nested repository review panel behavior and worker bridge requests.",
      required: true,
      exports: {
        ReviewMux,
        repoKey,
      },
      start(api) {
        api.ui.review.wrapBody((props, deps) => ReviewMux(props, deps));
        api.modules.registerHostModule("codex-plus:native:repository-targets", {
          request(params, signal) {
            return workerRequest("git", "repository-targets", params, signal);
          },
        });
      },
    }),
  );
})();
