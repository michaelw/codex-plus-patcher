(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "nestedRepositories",
      name: "Nested Repositories",
      description: "Hosts nested repository review panel behavior and worker bridge requests.",
      required: true,
      start(api) {
        api.ui.review.addRepositoryPanel({ id: "codex-plus-nested-repositories" });
        api.modules.registerHostModule("codex-plus:native:repository-targets", {
          request(params) {
            return api.native.request("repository-targets", params);
          },
        });
      },
    }),
  );
})();
