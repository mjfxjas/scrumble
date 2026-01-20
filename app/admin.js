const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const ADMIN_KEY_STORAGE = "scrumble-admin-key";

function hasApi() {
  return API_URL.length > 0;
}

function setStatus(id, message, isError = false) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "var(--accent)" : "var(--muted)";
}

function getAdminKey() {
  return localStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function saveAdminKey(value) {
  if (!value) {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    return;
  }
  localStorage.setItem(ADMIN_KEY_STORAGE, value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function apiFetch(path, options = {}, needsAdmin = false) {
  if (!hasApi()) {
    throw new Error("API base URL not set");
  }

  const headers = options.headers || {};
  if (needsAdmin) {
    const key = getAdminKey();
    if (!key) {
      throw new Error("Admin key missing");
    }
    headers["x-admin-key"] = key;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function loadActive() {
  try {
    const data = await apiFetch("/matchup");
    const title = data.matchup ? data.matchup.title : "No active matchup";
    const left = data.left ? data.left.name : "";
    const right = data.right ? data.right.name : "";
    const category = data.matchup ? data.matchup.category : "";
    const votes = data.votes || { left: 0, right: 0 };

    document.getElementById("active-title").textContent = title;
    document.getElementById("active-meta").textContent = `${left} vs ${right} - ${category}`;
    document.getElementById("active-counts").textContent = `${votes.left} left / ${votes.right} right`;
  } catch (error) {
    document.getElementById("active-title").textContent = "Unable to load";
    document.getElementById("active-meta").textContent = "";
    document.getElementById("active-counts").textContent = "";
    setStatus("key-status", error.message, true);
  }
}

function renderHistory(items) {
  const list = document.getElementById("admin-history");
  list.innerHTML = "";

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tiny";
    empty.textContent = "No matchups yet";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const total = item.votes.left + item.votes.right;
    const leftWon = item.votes.left >= item.votes.right;

    const wrapper = document.createElement("div");
    wrapper.className = "history-item";

    const matchup = document.createElement("div");
    matchup.className = "history-matchup";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = item.title + (item.active ? " (active)" : "");

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${item.category} - ${total} votes`;

    matchup.appendChild(title);
    matchup.appendChild(meta);

    const result = document.createElement("div");
    result.className = "history-result";

    const winner = document.createElement("div");
    winner.className = "history-winner";
    winner.textContent = `${leftWon ? item.left.name : item.right.name} ${leftWon ? item.votes.left : item.votes.right}`;

    const loser = document.createElement("div");
    loser.className = "history-loser";
    loser.textContent = `${leftWon ? item.right.name : item.left.name} ${leftWon ? item.votes.right : item.votes.left}`;

    result.appendChild(winner);
    result.appendChild(loser);

    wrapper.appendChild(matchup);
    wrapper.appendChild(result);
    list.appendChild(wrapper);
  });
}

async function loadHistory() {
  try {
    const data = await apiFetch("/history");
    renderHistory(data.history || []);
  } catch (error) {
    renderHistory([]);
    setStatus("key-status", error.message, true);
  }
}

async function activateMatchup(event) {
  event.preventDefault();
  const input = document.getElementById("activate-id");
  const matchupId = input.value.trim();

  if (!matchupId) {
    setStatus("activate-status", "Enter a matchup id", true);
    return;
  }

  try {
    await apiFetch(
      "/admin/activate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchup_id: matchupId }),
      },
      true
    );
    setStatus("activate-status", `Activated ${matchupId}`);
    await loadActive();
    await loadHistory();
  } catch (error) {
    setStatus("activate-status", error.message, true);
  }
}

function buildEntry(prefix) {
  const id = document.getElementById(`${prefix}-id`).value.trim();
  const name = document.getElementById(`${prefix}-name`).value.trim();
  const neighborhood = document.getElementById(`${prefix}-neighborhood`).value.trim();
  const tag = document.getElementById(`${prefix}-tag`).value.trim();
  const blurb = document.getElementById(`${prefix}-blurb`).value.trim();

  if (!id && name) {
    return {
      id: slugify(name),
      name,
      neighborhood,
      tag,
      blurb,
    };
  }

  return {
    id,
    name,
    neighborhood,
    tag,
    blurb,
  };
}

async function createMatchup(event) {
  event.preventDefault();

  const matchupId = document.getElementById("matchup-id").value.trim();
  const title = document.getElementById("matchup-title").value.trim();
  const category = document.getElementById("matchup-category").value.trim();
  const active = document.getElementById("matchup-active").checked;

  const left = buildEntry("left");
  const right = buildEntry("right");

  if (!matchupId || !title || !category) {
    setStatus("create-status", "Matchup id, title, and category are required", true);
    return;
  }

  if (!left.id || !left.name || !right.id || !right.name) {
    setStatus("create-status", "Both entries need id and name", true);
    return;
  }

  try {
    await apiFetch(
      "/admin/matchup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchup: {
            id: matchupId,
            title,
            category,
            left_entry_id: left.id,
            right_entry_id: right.id,
            active,
          },
          left,
          right,
        }),
      },
      true
    );

    setStatus("create-status", `Created ${matchupId}`);
    await loadHistory();
    if (active) {
      await loadActive();
    }
  } catch (error) {
    setStatus("create-status", error.message, true);
  }
}

function fillSample() {
  document.getElementById("matchup-id").value = "m006";
  document.getElementById("matchup-title").value = "Best Coffee Throwdown";
  document.getElementById("matchup-category").value = "food";

  document.getElementById("left-id").value = "mean-mug";
  document.getElementById("left-name").value = "Mean Mug";
  document.getElementById("left-neighborhood").value = "Northshore";
  document.getElementById("left-tag").value = "Local";
  document.getElementById("left-blurb").value = "No-frills coffee with loyal regulars and fast pours.";

  document.getElementById("right-id").value = "vulpes-coffee";
  document.getElementById("right-name").value = "Vulpes Coffee";
  document.getElementById("right-neighborhood").value = "Southside";
  document.getElementById("right-tag").value = "Challenger";
  document.getElementById("right-blurb").value = "Soft jazz, clean menus, and a slow morning vibe.";
}

function init() {
  document.getElementById("api-base").textContent = hasApi()
    ? API_URL
    : "Set SCRUMBLE_API_BASE in config.js";

  const savedKey = getAdminKey();
  if (savedKey) {
    document.getElementById("admin-key").value = savedKey;
    setStatus("key-status", "Admin key loaded");
  }

  document.getElementById("admin-key-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = document.getElementById("admin-key").value.trim();
    saveAdminKey(value);
    setStatus("key-status", value ? "Key saved" : "Key cleared");
  });

  document.getElementById("clear-key").addEventListener("click", () => {
    document.getElementById("admin-key").value = "";
    saveAdminKey("");
    setStatus("key-status", "Key cleared");
  });

  document.getElementById("refresh-active").addEventListener("click", loadActive);
  document.getElementById("refresh-history").addEventListener("click", loadHistory);
  document.getElementById("activate-form").addEventListener("submit", activateMatchup);
  document.getElementById("create-form").addEventListener("submit", createMatchup);
  document.getElementById("fill-sample").addEventListener("click", fillSample);

  if (hasApi()) {
    loadActive();
    loadHistory();
  }
}

init();
