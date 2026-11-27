"use strict";

const element = (id) => document.getElementById(id);
const pageSize = 10;
const state = {
  parentId: new URLSearchParams(location.search).get("parentId") || null,
  breadcrumbs: [],
  filter: "all",
  offset: 0,
  total: 0,
  todos: [],
  loading: false,
  mutating: false,
  loaded: false,
  renderedFilter: null,
  renderedOffset: null,
  renderedParentId: undefined,
  requestId: 0,
  controller: null,
  editTodo: null,
  deleteTodo: null,
  toastTimeout: null,
};

const icons = {
  edit:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 4 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z" /></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>',
};

const dateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  dateStyle: "medium",
  timeStyle: "short",
});

const today = new Date();
element("today").dateTime = today.toISOString().slice(0, 10);
element("today").textContent = new Intl.DateTimeFormat("fi-FI", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(today);

function showError(target, message) {
  target.textContent = message;
  target.hidden = !message;
}

function showToast(message) {
  clearTimeout(state.toastTimeout);
  const toast = element("toast");
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 4500);
}

function apiError(status) {
  if (status === 400) return "Tarkista tehtävän tiedot ja yritä uudelleen.";
  if (status === 404) return "Tehtävää ei enää löytynyt. Päivitä tehtävälista.";
  if (status === 413) return "Tehtävän tiedot ovat liian pitkät. Lyhennä tekstiä.";
  if (status === 429) return "Pyyntöjä on nyt liikaa. Yritä hetken kuluttua uudelleen.";
  return "Tallennus tai tietojen haku ei onnistunut. Yritä hetken kuluttua uudelleen.";
}

async function api(path, options = {}) {
  let response;
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    response = await fetch(path, {
      ...options,
      signal,
      headers: options.body ? { "Content-Type": "application/json" } : {},
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new Error("Palvelin vastaa hitaasti. Päivitä lista ennen kuin yrität uudelleen.");
    }
    if (error.name === "AbortError") throw error;
    throw new Error("Yhteyttä palvelimeen ei saatu. Tarkista yhteys ja yritä uudelleen.");
  }
  if (!response.ok) {
    throw Object.assign(new Error(apiError(response.status)), { status: response.status });
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error("Palvelimen vastausta ei voitu lukea. Yritä uudelleen.");
  }
}

function updateControls() {
  const busy = state.mutating;
  const contextPending = state.renderedParentId !== state.parentId;
  document.querySelectorAll("button, input, textarea").forEach((control) => {
    control.disabled = busy || contextPending;
  });
  element("refresh-button").disabled = busy || state.loading;
  element("retry-button").disabled = busy || state.loading;
  document.querySelectorAll("#breadcrumb-list button").forEach((control) => {
    control.disabled = busy || state.loading;
  });
  element("previous-button").disabled = busy || state.loading || state.offset === 0;
  element("next-button").disabled = busy || state.loading ||
    state.offset + pageSize >= state.total;
  document.querySelectorAll("#todo-list button, #todo-list input").forEach((control) => {
    control.disabled = busy || state.loading;
  });
  element("list-region").setAttribute("aria-busy", String(state.loading || busy));
  element("list-region").classList.toggle("is-loading", state.loading && state.loaded);
}

function setMutating(value) {
  state.mutating = value;
  updateControls();
}

function makeIconButton(label, icon, onClick, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-button ${extraClass}`.trim();
  button.setAttribute("aria-label", label);
  button.title = label;
  // Only these static, developer-owned SVG strings are inserted as HTML.
  button.innerHTML = icons[icon];
  button.addEventListener("click", onClick);
  return button;
}

function renderContext() {
  const parent = state.breadcrumbs.at(-1);
  element("breadcrumbs").hidden = !parent;
  element("breadcrumb-list").replaceChildren();
  const path = [{ id: null, title: "Kaikki tehtävät" }, ...state.breadcrumbs];
  path.forEach((todo, index) => {
    const item = document.createElement("li");
    const current = index === path.length - 1;
    const label = document.createElement(current ? "span" : "button");
    label.textContent = todo.title;
    if (current) label.setAttribute("aria-current", "page");
    else {
      label.type = "button";
      label.addEventListener("click", () => navigateTo(todo.id));
    }
    item.append(label);
    element("breadcrumb-list").append(item);
  });
  element("list-title").textContent = parent ? parent.title : "Sinun tehtäväsi";
  element("add-title").textContent = parent ? "Lisää alitehtävä" : "Mitä seuraavaksi?";
  element("composer-copy").textContent = parent
    ? `Lisätään tehtävään ”${parent.title}”. Kirjaa esimerkiksi kauppalistan tuote.`
    : "Pienikin asia ansaitsee oman rivinsä.";
  element("parent-description").hidden = !parent?.description;
  element("parent-description").textContent = parent?.description ?? "";
  element("subtask-summary").hidden = !parent;
  element("subtask-summary").textContent = parent
    ? `${parent.completedSubtaskCount} / ${parent.subtaskCount} alitehtävää valmiina`
    : "";
}

async function loadBreadcrumbs(parentId, signal) {
  const path = [];
  const visited = new Set();
  while (parentId) {
    if (visited.has(parentId)) throw new Error("Tehtävien hierarkiaa ei voitu lukea.");
    visited.add(parentId);
    const { data } = await api(`/api/todos/${encodeURIComponent(parentId)}`, { signal });
    path.unshift(data);
    parentId = data.parentId;
  }
  return path;
}

async function navigateTo(parentId, focusComposer = false, replace = false) {
  if (state.mutating && !replace) return;
  const url = new URL(location.href);
  if (parentId) url.searchParams.set("parentId", parentId);
  else url.searchParams.delete("parentId");
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  state.parentId = parentId;
  state.offset = 0;
  setFilter("all");
  await loadTodos();
  if (state.loaded && state.parentId === parentId && state.renderedParentId === parentId) {
    element(focusComposer ? "new-title" : "list-title").focus();
  }
}

function renderTodo(todo) {
  const row = document.createElement("li");
  row.className = `todo-row${todo.completed ? " completed" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-checkbox";
  checkbox.checked = todo.completed;
  checkbox.setAttribute(
    "aria-label",
    `Merkitse ${todo.completed ? "keskeneräiseksi" : "valmiiksi"}: ${todo.title}`,
  );
  checkbox.addEventListener("change", () => toggleTodo(todo, checkbox));

  const content = document.createElement("div");
  content.className = "todo-content";
  const title = document.createElement("p");
  title.className = "todo-title";
  title.textContent = todo.title;
  content.append(title);

  if (todo.description) {
    const description = document.createElement("p");
    description.className = "todo-description";
    description.textContent = todo.description;
    content.append(description);
  }

  const metadata = document.createElement("div");
  metadata.className = "todo-meta";
  const status = document.createElement("span");
  status.className = "status-label";
  status.textContent = todo.completed ? "Valmis" : "Kesken";
  const created = new Date(todo.createdAt);
  const time = document.createElement("time");
  time.dateTime = todo.createdAt;
  time.textContent = `Lisätty ${dateFormatter.format(created)}`;
  time.title = `Lisätty ${fullDateFormatter.format(created)}`;
  metadata.append(status, time);
  content.append(metadata);

  const subtasks = document.createElement("button");
  subtasks.type = "button";
  subtasks.className = "subtask-button";
  subtasks.setAttribute("aria-label", `Avaa alitehtävät: ${todo.title}`);
  subtasks.textContent = todo.subtaskCount
    ? `${todo.completedSubtaskCount} / ${todo.subtaskCount} alitehtävää valmiina →`
    : "+ Lisää alitehtäviä";
  subtasks.addEventListener("click", () => navigateTo(todo.id, todo.subtaskCount === 0));
  content.append(subtasks);

  const actions = document.createElement("div");
  actions.className = "todo-actions";
  actions.append(
    makeIconButton(`Muokkaa: ${todo.title}`, "edit", () => openEdit(todo)),
    makeIconButton(`Poista: ${todo.title}`, "delete", () => openDelete(todo), "delete-button"),
  );
  row.append(checkbox, content, actions);
  return row;
}

function renderList() {
  const list = element("todo-list");
  list.replaceChildren(...state.todos.map(renderTodo));
  list.hidden = false;
  state.renderedFilter = state.filter;
  state.renderedOffset = state.offset;
  state.renderedParentId = state.parentId;
  renderContext();
  element("task-count").textContent = String(state.total);
  element("task-count").setAttribute("aria-label", `${state.total} tehtävää`);
  element("loading-state").hidden = true;
  element("empty-state").hidden = state.todos.length > 0;

  const emptyMessages = {
    all: ["Aloitetaan yhdestä.", "Lisää ensimmäinen tehtäväsi. Loput tulevat ajallaan."],
    active: ["Kaikki on tehty.", "Hetki hengähtää. Täällä ei ole keskeneräisiä tehtäviä."],
    completed: ["Valmista tulee ajallaan.", "Merkitse tehtävä valmiiksi, niin löydät sen täältä."],
  };
  const [title, copy] = state.parentId && state.filter === "all"
    ? ["Lista odottaa ensimmäistä riviä.", "Lisää alitehtävä tai kauppalistan tuote lomakkeella."]
    : emptyMessages[state.filter];
  element("empty-title").textContent = title;
  element("empty-copy").textContent = copy;
  element("pagination").hidden = state.total <= pageSize && state.offset === 0;
  element("page-description").textContent = state.total > 0
    ? `${state.offset + 1}–${
      Math.min(state.offset + pageSize, state.total)
    } / ${state.total} tehtävää`
    : "0 tehtävää";
  const filterNames = {
    all: "Kaikki tehtävät",
    active: "Keskeneräiset tehtävät",
    completed: "Valmiit tehtävät",
  };
  element("list-announcement").textContent = `${filterNames[state.filter]}: ${state.total}.`;
  updateControls();
}

async function loadTodos() {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  const requestId = ++state.requestId;
  state.loading = true;
  element("list-error").hidden = true;
  if (
    !state.loaded || state.renderedFilter !== state.filter ||
    state.renderedOffset !== state.offset ||
    state.renderedParentId !== state.parentId
  ) {
    element("loading-state").hidden = false;
    element("todo-list").hidden = true;
    element("empty-state").hidden = true;
    element("pagination").hidden = true;
    element("task-count").textContent = "—";
  }
  updateControls();

  const parentId = state.parentId;
  const query = new URLSearchParams({
    limit: String(pageSize),
    offset: String(state.offset),
    parentId: parentId ?? "null",
  });
  if (state.filter !== "all") query.set("completed", String(state.filter === "completed"));
  try {
    const [result, breadcrumbs] = await Promise.all([
      api(`/api/todos?${query}`, { signal: controller.signal }),
      loadBreadcrumbs(parentId, controller.signal),
    ]);
    if (requestId !== state.requestId) return;
    state.breadcrumbs = breadcrumbs;
    state.total = result.pagination.total;
    // A deletion may empty the last page, including a change made in another tab.
    if (state.offset > 0 && state.offset >= state.total) {
      state.offset = Math.max(0, Math.ceil(state.total / pageSize) - 1) * pageSize;
      await loadTodos();
      return;
    }
    state.todos = result.data;
    state.loaded = true;
    renderList();
  } catch (error) {
    if (error.name === "AbortError" || requestId !== state.requestId) return;
    controller.abort();
    if (parentId && (error.status === 404 || error.status === 400)) {
      await navigateTo(null, false, true);
      showToast("Ylätehtävää ei enää löytynyt. Palattiin päätasolle.");
      return;
    }
    element("loading-state").hidden = true;
    element("list-error-text").textContent = error.message;
    element("list-error").hidden = false;
    element("list-announcement").textContent = "Tehtävälistan lataaminen epäonnistui.";
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      updateControls();
    }
  }
}

function validateTitle(input) {
  input.setCustomValidity(input.value.trim() ? "" : "Kirjoita tehtävälle nimi.");
  return input.reportValidity();
}

async function addTodo(event) {
  event.preventDefault();
  if (state.mutating || !validateTitle(element("new-title"))) return;
  showError(element("add-error"), "");
  element("add-button").lastElementChild.textContent = "Lisätään…";
  setMutating(true);
  try {
    await api("/api/todos", {
      method: "POST",
      body: JSON.stringify({
        title: element("new-title").value.trim(),
        description: element("new-description").value.trim(),
        parentId: state.parentId,
      }),
    });
    element("add-form").reset();
    state.offset = 0;
    setFilter("all");
    await loadTodos();
    showToast("Tehtävä lisätty. Yksi asia vähemmän muistettavana.");
  } catch (error) {
    showError(element("add-error"), error.message);
  } finally {
    element("add-button").lastElementChild.textContent = "Lisää tehtävä";
    setMutating(false);
    element("new-title").focus();
  }
}

async function toggleTodo(todo, checkbox) {
  if (state.mutating) return;
  setMutating(true);
  try {
    await api(`/api/todos/${todo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: !todo.completed }),
    });
    showToast(todo.completed ? "Tehtävä merkitty keskeneräiseksi." : "Valmista! Hyvin tehty.");
    await loadTodos();
  } catch (error) {
    checkbox.checked = todo.completed;
    element("list-error-text").textContent = error.message;
    element("list-error").hidden = false;
  } finally {
    setMutating(false);
    // Preserve keyboard flow even when a filtered item disappears after a change.
    if (!document.body.contains(checkbox)) element("refresh-button").focus();
  }
}

function openEdit(todo) {
  if (state.mutating) return;
  state.editTodo = todo;
  element("edit-title").value = todo.title;
  element("edit-title").setCustomValidity("");
  element("edit-description").value = todo.description;
  showError(element("edit-error"), "");
  element("edit-dialog").showModal();
  element("edit-title").focus();
}

async function saveEdit(event) {
  event.preventDefault();
  if (state.mutating || !state.editTodo || !validateTitle(element("edit-title"))) return;
  showError(element("edit-error"), "");
  element("edit-save").textContent = "Tallennetaan…";
  setMutating(true);
  try {
    await api(`/api/todos/${state.editTodo.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: element("edit-title").value.trim(),
        description: element("edit-description").value.trim(),
      }),
    });
    element("edit-dialog").close();
    state.editTodo = null;
    await loadTodos();
    showToast("Muutokset tallennettu.");
  } catch (error) {
    showError(element("edit-error"), error.message);
  } finally {
    element("edit-save").textContent = "Tallenna muutokset";
    setMutating(false);
    if (!element("edit-dialog").open) element("refresh-button").focus();
  }
}

function openDelete(todo) {
  if (state.mutating) return;
  state.deleteTodo = todo;
  element("delete-task-name").textContent = todo.title;
  showError(element("delete-error"), "");
  element("delete-dialog").showModal();
  element("delete-cancel").focus();
}

async function deleteTodo(event) {
  event.preventDefault();
  if (state.mutating || !state.deleteTodo) return;
  showError(element("delete-error"), "");
  element("delete-confirm").textContent = "Poistetaan…";
  setMutating(true);
  try {
    await api(`/api/todos/${state.deleteTodo.id}`, { method: "DELETE" });
    element("delete-dialog").close();
    state.deleteTodo = null;
    await loadTodos();
    showToast("Tehtävä poistettu.");
  } catch (error) {
    showError(element("delete-error"), error.message);
  } finally {
    element("delete-confirm").textContent = "Poista tehtävä";
    setMutating(false);
    if (!element("delete-dialog").open) element("refresh-button").focus();
  }
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

element("add-form").addEventListener("submit", addTodo);
element("edit-form").addEventListener("submit", saveEdit);
element("delete-form").addEventListener("submit", deleteTodo);
element("new-title").addEventListener("input", (event) => event.target.setCustomValidity(""));
element("edit-title").addEventListener("input", (event) => event.target.setCustomValidity(""));
element("refresh-button").addEventListener("click", loadTodos);
element("retry-button").addEventListener("click", loadTodos);

addEventListener("popstate", () => {
  state.parentId = new URLSearchParams(location.search).get("parentId") || null;
  state.offset = 0;
  setFilter("all");
  loadTodos();
});
element("previous-button").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - pageSize);
  loadTodos();
});
element("next-button").addEventListener("click", () => {
  if (state.offset + pageSize >= state.total) return;
  state.offset += pageSize;
  loadTodos();
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mutating) return;
    state.offset = 0;
    setFilter(button.dataset.filter);
    loadTodos();
  });
});

for (
  const [buttonId, dialogId] of [
    ["edit-close", "edit-dialog"],
    ["edit-cancel", "edit-dialog"],
    ["delete-cancel", "delete-dialog"],
  ]
) {
  element(buttonId).addEventListener("click", () => {
    if (!state.mutating) element(dialogId).close();
  });
}
for (const id of ["edit-dialog", "delete-dialog"]) {
  element(id).addEventListener("cancel", (event) => {
    if (state.mutating) event.preventDefault();
  });
  element(id).addEventListener("click", (event) => {
    if (event.target === element(id) && !state.mutating) {
      const box = element(id).getBoundingClientRect();
      if (
        event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom
      ) element(id).close();
    }
  });
}

loadTodos();
