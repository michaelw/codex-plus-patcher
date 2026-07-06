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

  function renderCard({ card, onReply } = {}) {
    const item = document.createElement("section");
    item.className = "cpx-interaction-card";
    item.setAttribute("data-codex-plus-interaction-card", card?.kind || "request");
    item.innerHTML = `<strong>${escapeHtml(card?.kind || "request")}</strong><p>${escapeHtml(card?.question || card?.reason || card?.method || card?.requestId || "")}</p>`;
    if (card?.kind === "owner-choice" && Array.isArray(card.options)) {
      for (const option of card.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.label;
        button.addEventListener("click", () => onReply?.({ kind: "owner-choice", state: card.state, visitCount: card.visitCount, label: option.label }));
        item.appendChild(button);
      }
    } else if (card?.kind === "owner-input") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Answer";
      button.addEventListener("click", () => onReply?.({ kind: "owner-input", requestId: card.requestId }));
      item.appendChild(button);
    } else {
      for (const decision of ["accept", "decline", "cancel"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = decision;
        button.addEventListener("click", () => onReply?.({ kind: card?.kind || "approval", requestId: card?.requestId, decision }));
        item.appendChild(button);
      }
    }
    return item;
  }

  globalObject.CodexPlus.ui.interactions = { renderCard };
})();
