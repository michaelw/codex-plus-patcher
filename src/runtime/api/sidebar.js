(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators, mergeDataAttributes } = globalObject.__CodexPlusRuntime;
  const sections = new Map();

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function pressElement(element) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventClass = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, view: window, button: 0, pointerType: "mouse", isPrimary: true }));
    }
  }

  function directText(element) {
    if (!element) return "";
    let text = "";
    for (const child of Array.from(element.childNodes || [])) {
      if (child.nodeType === 3) text += child.textContent || "";
    }
    return text.trim();
  }

  function headingElements(title) {
    const matches = [];
    for (const element of Array.from(document.querySelectorAll("[data-app-action-sidebar-section-heading], h1, h2, h3, p, div, span"))) {
      const heading = element.getAttribute?.("data-app-action-sidebar-section-heading");
      const ownText = directText(element) || (element.children?.length ? "" : (element.textContent || "").trim());
      if (heading === title || ownText === title) matches.push(element);
    }
    return matches;
  }

  function ancestors(element) {
    const list = [];
    let current = element;
    while (current) {
      list.push(current);
      current = current.parentElement;
    }
    return list;
  }

  function commonAncestor(first, second) {
    if (!first || !second) return null;
    const secondAncestors = new Set(ancestors(second));
    return ancestors(first).find((candidate) => secondAncestors.has(candidate)) || null;
  }

  function semanticSidebarHost() {
    const pinned = headingElements("Pinned")[0] || null;
    const projects = headingElements("Projects")[0] || null;
    const common = commonAncestor(pinned, projects);
    if (common && common !== document.body && common !== document.documentElement) return common;
    if (projects?.parentElement && projects.parentElement !== document.body) return projects.parentElement;
    if (pinned?.parentElement && pinned.parentElement !== document.body) return pinned.parentElement;
    const projectRows = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row], [data-app-action-sidebar-thread-row]"));
    if (projectRows.length > 1) {
      let host = projectRows[0].parentElement;
      for (const row of projectRows.slice(1)) host = commonAncestor(host, row.parentElement) || host;
      if (host && host !== document.body && host !== document.documentElement) return host;
    }
    return null;
  }

  function sidebarHost() {
    return semanticSidebarHost();
  }

  function insertSection(host, section, model = {}) {
    const children = Array.from(host.children || []);
    const afterTitle = model.afterSectionTitle || model.afterTitle || "Pinned";
    const projects = children.find((child) => {
      const heading = child.getAttribute?.("data-app-action-sidebar-section-heading");
      const text = child.textContent?.trim() || "";
      return heading === "Projects" || text === "Projects" || text.startsWith("Projects\n");
    });
    if (projects && afterTitle === "Pinned") {
      host.insertBefore(section, projects);
      return;
    }
    const afterSection = children.find((child) => {
      const heading = child.getAttribute?.("data-app-action-sidebar-section-heading");
      const text = child.textContent?.trim() || "";
      return heading === afterTitle || text === afterTitle || text.startsWith(`${afterTitle}\n`);
    });
    if (afterSection) {
      const index = children.indexOf(afterSection);
      host.insertBefore(section, index >= 0 ? children[index + 1] || null : null);
      return;
    }
    host.insertBefore(section, projects || host.firstChild || null);
  }

  function createIconSvg() {
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>',
      '<path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.4-9.4z"/>',
      "</svg>",
    ].join("");
  }

  function chevronSvg(collapsed) {
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      collapsed ? '<path d="m9 18 6-6-6-6"/>' : '<path d="m6 9 6 6 6-6"/>',
      "</svg>",
    ].join("");
  }

  function renderStatus(status) {
    if (status === "waiting") return '<span class="cpx-sidebar-status-waiting" aria-label="waiting for input" role="status"></span>';
    if (status === "running") return '<span class="cpx-sidebar-status-spinner" aria-label="running" role="status"></span>';
    if (status === "failed" || status === "cancelled") return `<small>${escapeHtml(status)}</small>`;
    return "";
  }

  function applyRowAttributes(element, row) {
    for (const [key, value] of Object.entries(row.attributes || {})) {
      if (value === false || value == null) continue;
      element.setAttribute(key, value === true ? "" : String(value));
    }
    for (const [key, value] of Object.entries(row.style || {})) {
      element.style?.setProperty?.(key, String(value));
    }
  }

  function renderRows(parent, rows, handlers, depth = 0) {
    for (const row of rows || []) {
      const wrapper = document.createElement("div");
      wrapper.className = `cpx-sidebar-model-row cpx-sidebar-model-row-${row.kind || "item"}${row.className ? ` ${row.className}` : ""}`;
      wrapper.setAttribute("data-codex-plus-sidebar-model-row", row.id || row.label || "");
      wrapper.setAttribute("data-codex-plus-sidebar-model-kind", row.kind || "item");
      wrapper.style.setProperty("--cpx-sidebar-depth", String(depth));
      applyRowAttributes(wrapper, row);
      if (row.title) wrapper.title = String(row.title);
      if (row.active) {
        wrapper.setAttribute("data-app-action-sidebar-thread-active", "true");
        wrapper.setAttribute("data-codex-plus-sidebar-model-active", "true");
      }
      if (row.color) wrapper.style.setProperty("--codex-plus-project-accent", row.color);
      const collapsed = row.collapsed === true;
      const canCollapse = row.collapsible !== false && Array.isArray(row.children) && row.children.length > 0;
      wrapper.innerHTML = [
        `<button type="button" class="cpx-sidebar-model-main" aria-expanded="${canCollapse ? String(!collapsed) : "true"}">`,
        canCollapse ? `<span class="cpx-sidebar-model-chevron">${chevronSvg(collapsed)}</span>` : '<span class="cpx-sidebar-model-bullet" aria-hidden="true"></span>',
        `<span class="cpx-sidebar-model-text"><strong>${escapeHtml(row.label || row.id || "")}</strong>${row.description ? `<small>${escapeHtml(row.description)}</small>` : ""}</span>`,
        renderStatus(row.status),
        "</button>",
        row.createAction ? `<button type="button" class="cpx-sidebar-model-create" aria-label="${escapeHtml(row.createAction.label || "Create")}" title="${escapeHtml(row.createAction.label || "Create")}">${createIconSvg()}</button>` : "",
      ].join("");
      wrapper.querySelector(".cpx-sidebar-model-main")?.addEventListener("click", () => {
        if (canCollapse) handlers?.onToggle?.(row);
        else handlers?.onSelect?.(row);
      });
      wrapper.querySelector(".cpx-sidebar-model-create")?.addEventListener("click", (event) => {
        event.stopPropagation();
        handlers?.onCreate?.(row, row.createAction);
      });
      parent.appendChild(wrapper);
      if (Array.isArray(row.children) && row.children.length > 0 && (!canCollapse || !collapsed)) {
        const children = document.createElement("div");
        children.className = "cpx-sidebar-model-children";
        applyRowAttributes(children, { style: row.style || {} });
        renderRows(children, row.children, handlers, depth + 1);
        parent.appendChild(children);
      } else if (row.emptyText && !collapsed) {
        const empty = document.createElement("p");
        empty.className = "cpx-sidebar-model-empty";
        empty.textContent = row.emptyText;
        parent.appendChild(empty);
      }
    }
  }

  function ensureSectionElement(id, model = {}) {
    const host = sidebarHost();
    const escapedId = globalObject.CSS?.escape ? globalObject.CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
    let section = document.querySelector(`[data-codex-plus-sidebar-section="${escapedId}"]`);
    if (!host) {
      section?.remove?.();
      return null;
    }
    if (!section) {
      section = document.createElement("section");
      section.setAttribute("data-codex-plus-sidebar-section", id);
    }
    if (model.elementId) section.id = String(model.elementId);
    if (section.parentElement !== host) insertSection(host, section, model);
    return section;
  }

  function renderSection(model, handlers) {
    if (!model?.id) throw new Error("Sidebar sections require an id");
    if (typeof document === "undefined") return { ok: false, error: "document-unavailable" };
    const section = ensureSectionElement(String(model.id), model);
    if (!section) return { ok: false, error: "sidebar-host-not-found" };
    section.className = "cpx-sidebar-model-section";
    section.innerHTML = `<h2 data-app-action-sidebar-section-heading="${escapeHtml(model.title || model.id)}">${escapeHtml(model.title || model.id)}</h2>`;
    renderRows(section, model.rows || [], handlers || model.handlers || {});
    return { ok: true, section };
  }

  function registerSection(model) {
    if (!model?.id) throw new Error("Sidebar sections require an id");
    const id = String(model.id);
    sections.set(id, { ...model, id });
    return {
      id,
      render(nextModel = null) {
        if (nextModel) sections.set(id, { ...sections.get(id), ...nextModel, id });
        const section = sections.get(id);
        return renderSection(section, section.handlers);
      },
      update(nextModel) {
        sections.set(id, { ...sections.get(id), ...nextModel, id });
        return this.render();
      },
      remove() {
        sections.delete(id);
        const escapedId = globalObject.CSS?.escape ? globalObject.CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
        document.querySelector(`[data-codex-plus-sidebar-section="${escapedId}"]`)?.remove();
      },
    };
  }
  const sidebar = {
    projectDecorators: [],
    threadDecorators: [],
    decorateProjectRow(fn) {
      this.projectDecorators.push(fn);
      return fn;
    },
    decorateThreadRow(fn) {
      this.threadDecorators.push(fn);
      return fn;
    },
    mergeDataAttributes,
    projectRowProps(props) {
      return applyDecorators(props, this.projectDecorators);
    },
    threadRowProps(props) {
      return applyDecorators(props, this.threadDecorators);
    },
    pressElement,
    registerSection,
    renderSection,
  };
  globalObject.CodexPlus.ui.sidebar = sidebar;
})();
