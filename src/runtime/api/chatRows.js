(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function rowText(row) {
    return row?.html || row?.markdown || row?.text || row?.summary || row?.label || "";
  }

  function renderRow(row, options = {}) {
    const article = document.createElement("article");
    const kind = String(row?.kind || "message");
    article.className = `cpx-chat-row cpx-chat-row-${kind}`;
    article.setAttribute("data-codex-plus-chat-row", kind);
    if (row?.id) article.setAttribute("data-codex-plus-chat-row-id", String(row.id));
    if (row?.anchor) article.setAttribute("data-codex-plus-chat-row-anchor", String(row.anchor));
    const label = row?.label ? `<small>${escapeHtml(row.label)}</small>` : "";
    const body = typeof options.renderMarkdown === "function"
      ? options.renderMarkdown(rowText(row))
      : `<p>${escapeHtml(rowText(row))}</p>`;
    article.innerHTML = `${label}<div class="cpx-chat-row-body">${body}</div>`;
    return article;
  }

  function render(rows, options = {}) {
    const fragment = document.createDocumentFragment();
    for (const row of rows || []) fragment.appendChild(renderRow(row, options));
    return fragment;
  }

  globalObject.CodexPlus.ui.chatRows = { render, renderRow };
})();
