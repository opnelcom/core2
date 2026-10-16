/* Shared, append-only commentary editor. All writes go through the ERP API. */
(function (global) {
  "use strict";
  function create({ api, targets }) {
    const editors = new Map();
    const context = (target) => ({ organisation_id: target.organisationId(), entity_kind: target.kind(), entity_id: target.id() });
    const key = (value) => JSON.stringify(value);
    function current(editor, binding, generation) {
      return editor.generation === generation && key(context(editor.target)) === binding;
    }
    function reset(prefix) {
      const editor = editors.get(prefix);
      if (!editor) return;
      editor.generation++;
      editor.input.value = "";
      editor.binding = "";
      editor.busy = false;
      editor.allowed = false;
      editor.body.replaceChildren();
      editor.status.textContent = "";
      editor.submit.disabled = true;
    }
    function render(editor, comments) {
      editor.body.replaceChildren();
      comments.forEach((comment) => {
        const row = document.createElement("tr");
        const date = new Date(comment.created_at);
        const values = [comment.comment_text, comment.created_by_email,
          Number.isNaN(date.getTime()) ? comment.created_at : date.toLocaleString()];
        values.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        editor.body.append(row);
      });
      editor.count.textContent = String(comments.length);
    }
    function sync(editor) {
      editor.input.disabled = editor.busy || !editor.allowed;
      editor.submit.disabled = editor.busy || !editor.allowed || !editor.input.value.trim();
    }
    async function show(prefix) {
      const editor = editors.get(prefix);
      const value = context(editor.target), binding = key(value);
      if (editor.binding !== binding) reset(prefix);
      if (editor.busy) return;
      editor.binding = binding;
      if (!value.entity_id) {
        editor.status.textContent = "Save the record before adding comments.";
        render(editor, []);
        sync(editor);
        return;
      }
      const generation = ++editor.generation;
      editor.allowed = false;
      sync(editor);
      editor.status.textContent = "Loading comments…";
      try {
        const result = await api(`comments/list?${new URLSearchParams(value)}`);
        if (!current(editor, binding, generation)) return;
        render(editor, result.comments || []);
        editor.allowed = true;
        editor.status.textContent = (result.comments || []).length ? "" : "No comments yet.";
      } catch (error) {
        if (!current(editor, binding, generation)) return;
        render(editor, []);
        editor.status.textContent = error.message;
      }
      if (current(editor, binding, generation)) sync(editor);
    }
    for (const target of targets) {
      const { prefix, form, tabs, tabAttribute, panelAttribute, select } = target;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = prefix === "legal-entity" ? "tab" : "account-detail-tab";
      tab.setAttribute(tabAttribute, "comments");
      tab.id = `${prefix}-comments-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", "false");
      tab.setAttribute("aria-controls", `${prefix}-comments-panel`);
      tab.textContent = "Comments";
      const versions = tabs.querySelector('[data-record-tab="versions"], [data-account-fixed-tab="versions"]');
      tabs.insertBefore(tab, versions);
      const panel = document.createElement("section");
      panel.id = `${prefix}-comments-panel`;
      panel.className = "record-comments-panel erp-field-rows full";
      panel.setAttribute(panelAttribute, "comments");
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.hidden = true;
      panel.innerHTML = `<label class="detail-field detail-field--full">New comment<textarea id="${prefix}-new-comment" rows="4" placeholder="Enter a comment"></textarea></label>
        <div class="record-comments-toolbar"><p class="record-comments-status" role="status" aria-live="polite"></p><button type="button" class="record-comment-submit" disabled>Submit comment</button></div>
        <h3>Previous comments (<span class="record-comment-count">0</span>)</h3>
        <div class="record-comments-grid"><table aria-label="Previous comments, latest first"><thead><tr><th scope="col">Comment</th><th scope="col">Submitted by</th><th scope="col">Submitted at</th></tr></thead><tbody></tbody></table></div>`;
      form.insertBefore(panel, form.querySelector(":scope > .actions"));
      const editor = { target, input: panel.querySelector("textarea"), submit: panel.querySelector("button"), status: panel.querySelector("[role=status]"), body: panel.querySelector("tbody"), count: panel.querySelector(".record-comment-count"), generation: 0, binding: "", busy: false, allowed: false };
      editors.set(prefix, editor);
      // Accounting record tab bars already delegate their click events.
      if (prefix === "account" || prefix === "legal-entity") tab.addEventListener("click", () => select("comments"));
      editor.input.addEventListener("input", () => sync(editor));
      editor.submit.addEventListener("click", async () => {
        if (editor.submit.disabled || editor.busy) return;
        const value = context(target), binding = key(value), generation = editor.generation;
        if (!value.entity_id || binding !== editor.binding) return;
        editor.busy = true;
        sync(editor);
        editor.status.textContent = "Submitting comment…";
        try {
          const result = await api("comments/submit", { method: "POST", body: JSON.stringify({ ...value, comment_text: editor.input.value.trim() }) });
          if (!current(editor, binding, generation)) return;
          editor.input.value = "";
          // Show the confirmed write without treating a later refresh failure as a failed submission.
          const row = document.createElement("tr");
          [result.comment.comment_text, result.comment.created_by_email, new Date(result.comment.created_at).toLocaleString()].forEach(value => {
            const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
          });
          editor.body.prepend(row);
          editor.count.textContent = String(editor.body.children.length);
          editor.status.textContent = "Comment submitted. Comments are permanent.";
        } catch (error) {
          if (current(editor, binding, generation)) editor.status.textContent = error.message;
        } finally {
          if (current(editor, binding, generation)) { editor.busy = false; sync(editor); }
        }
      });
    }
    return { show, reset };
  }
  global.ERPRecordComments = { create };
})(window);
