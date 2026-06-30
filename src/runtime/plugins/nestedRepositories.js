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
          cwd: pathValue(cwd),
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

    const loadBranches = () => {
      const controller = new AbortController();
      setLoading(true);
      setError(null);
      gitRequest("git")
        .request({
          method: "recent-branches",
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
    }, [open, repo.root, hostConfig.id]);

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
            method: "search-branches",
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
    if (!Button || !Tooltip || !Icon || !Dropdown || !DropdownMenu || !BranchPickerDropdownContent) {
      return jsxs("label", {
        className: "flex min-w-32 max-w-52 shrink-0 items-center gap-1 text-xs text-token-description-foreground",
        children: [
          jsx("span", { className: "sr-only", children: "Base branch" }),
          jsx("select", {
            "data-codex-plus-repo-branch-picker": "",
            "data-codex-plus-repo-kind": repo.kind,
            "data-codex-plus-repo-path": repo.path ?? "",
            "data-codex-plus-repo-branch-count": String(displayBranches.length),
            "data-codex-plus-repo-current-branch": currentBranch ?? "",
            className:
              "min-w-0 flex-1 rounded-md border border-token-border bg-token-main-surface-primary px-1.5 py-1 text-xs text-token-foreground",
            value: selected,
            disabled: loading || error != null,
            onFocus: loadBranches,
            onChange: (event) => setBaseBranch(event.target.value),
            children: [
              jsx("option", { value: "", children: loading ? "Loading..." : "Unstaged" }, "unstaged"),
              ...displayBranches.map((branch) => jsx("option", { value: branch.name, children: branch.name }, branch.name)),
            ],
          }),
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
      isLoading: loading,
      isSearchError: searchError != null,
      isSearchLoading: searchLoading,
      onClose: () => setOpen(false),
      onRetry: loadBranches,
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
      let cancelled = false;
      const controller = new AbortController();
      setDiffText(null);
      setError(null);
      setLoading(true);
      gitRequest("git")
        .request({ method: "current-branch", params: { root: repo.root, hostConfig, operationSource: "codex_plus_review" }, signal: controller.signal })
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
            cwd: pathValue(repo.cwd),
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
    const cwd = useAtom(cwdAtom);
    const hostId = useAtom(hostIdAtom);
    const hostConfig = useAtom(hostConfigAtom);
    const conversationAtomValue = conversationIdAtom ? useAtom(conversationIdAtom) : null;
    const conversationId = routeStore.value.routeKind === "local-thread" ? routeStore.value.conversationId : null;
    const [targets, setTargets] = React.useState(null);
    const [collapsed, setCollapsedState] = React.useState(() => new Map());
    const [baseBranches, setBaseBranches] = React.useState(() => new Map());
    const mainReviewContent = props.mainReviewContent;
    const upstreamReview = React.useMemo(
      () => mainReviewContent ?? jsx(DefaultReview, props),
      [mainReviewContent, props.diffRefs, props.diffMode, props.isCappedMode, props.reviewDiffMetrics, props.showReviewGitActions],
    );

    React.useEffect(() => {
      if (cwd == null || hostConfig == null) {
        setTargets(null);
        return undefined;
      }
      let cancelled = false;
      const controller = new AbortController();
      gitRequest("git")
        .request({
          method: "repository-targets",
          params: { cwd: pathValue(cwd), hostId, hostConfig, operationSource: "codex_plus_review" },
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

    const main = targets?.main ?? (cwd == null ? null : { id: `main:${cwd}`, kind: "main", path: ".", label: "Main", cwd });
    const repositories = targets?.repositories ?? [];
    const all = [main, ...repositories].filter(Boolean);
    if (main == null || (all.length <= 1 && (!targets?.warnings || targets.warnings.length === 0) && targets?.debug == null)) return upstreamReview;

    const session = sessionKey(hostId, conversationId ?? conversationAtomValue, cwd);
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
        main ? MainGroup({ repo: main, collapsed: isCollapsed(main), onToggle: () => setCollapsed(main, !isCollapsed(main)), children: upstreamReview }, deps) : upstreamReview,
        repositories.map((repo) =>
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
