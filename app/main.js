const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const PREVIEW_OVERRIDES = window.SCRUMBLE_PREVIEW_OVERRIDES || {};
const MATCHUP_OVERRIDES = window.SCRUMBLE_MATCHUP_OVERRIDES || {};
const MATCHUP_OVERRIDES_BY_INDEX = window.SCRUMBLE_MATCHUP_OVERRIDES_BY_INDEX || {};
const SEED_VOTES_CONFIG = normalizeSeedVotesConfig(window.SCRUMBLE_SEED_VOTES);
const ENABLE_EDITOR = window.SCRUMBLE_ENABLE_EDITOR !== false;
const UI_OVERRIDE_STORAGE_KEY = "scrumble-ui-overrides";

let state = { voted: null };
let toastTimer = null;
let uiOverrides = loadUiOverrides();
let editorPanel = null;
let editorUpdateTimer = null;
const IMAGE_OVERRIDES = {
  "andy-berke": "public/berk.avif",
  "bob-corker": "public/bob_corker.avif"
};

function hasApi() {
  return API_URL.length > 0;
}

function normalizeSeedVotesConfig(config) {
  const defaults = {
    enabled: false,
    mode: "ifZero",
    min: 20,
    max: 180,
    jitter: 6
  };
  if (config === true) return { ...defaults, enabled: true, mode: "override" };
  if (!config || config === false) return { ...defaults };
  return {
    ...defaults,
    ...config,
    enabled: config.enabled !== undefined ? Boolean(config.enabled) : true
  };
}

function loadUiOverrides() {
  try {
    return JSON.parse(localStorage.getItem(UI_OVERRIDE_STORAGE_KEY) || "{}");
  } catch (err) {
    return {};
  }
}

function saveUiOverrides() {
  try {
    localStorage.setItem(UI_OVERRIDE_STORAGE_KEY, JSON.stringify(uiOverrides));
  } catch (err) {
    return;
  }
}

function getSeedStore() {
  try {
    return JSON.parse(localStorage.getItem("scrumble-seed-votes") || "{}");
  } catch (err) {
    return {};
  }
}

function saveSeedStore(store) {
  try {
    localStorage.setItem("scrumble-seed-votes", JSON.stringify(store));
  } catch (err) {
    return;
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getSeedVotes(matchupId, index) {
  if (!SEED_VOTES_CONFIG.enabled) return null;

  const key = matchupId || `index-${index}`;
  const store = getSeedStore();
  if (store[key]) return store[key];

  const min = Number.isFinite(SEED_VOTES_CONFIG.min) ? SEED_VOTES_CONFIG.min : 20;
  const max = Number.isFinite(SEED_VOTES_CONFIG.max) ? SEED_VOTES_CONFIG.max : min;
  const jitter = Number.isFinite(SEED_VOTES_CONFIG.jitter) ? SEED_VOTES_CONFIG.jitter : 0;
  const safeMax = Math.max(min, max);
  const base = randomInt(min, safeMax);
  const delta = jitter ? randomInt(-jitter, jitter) : 0;
  const left = Math.max(1, base + delta);
  const right = Math.max(1, base - delta);

  store[key] = { left, right };
  saveSeedStore(store);
  return store[key];
}

function getOverridesFor(matchupId, index) {
  const byIndex = MATCHUP_OVERRIDES_BY_INDEX[index] || {};
  const byId = matchupId ? (MATCHUP_OVERRIDES[matchupId] || {}) : {};
  const uiByIndex = uiOverrides?.byIndex?.[index] || {};
  const uiById = matchupId ? (uiOverrides?.byId?.[matchupId] || {}) : {};
  return {
    matchup: { ...(byIndex.matchup || {}), ...(byId.matchup || {}), ...(uiByIndex.matchup || {}), ...(uiById.matchup || {}) },
    left: { ...(byIndex.left || {}), ...(byId.left || {}), ...(uiByIndex.left || {}), ...(uiById.left || {}) },
    right: { ...(byIndex.right || {}), ...(byId.right || {}), ...(uiByIndex.right || {}), ...(uiById.right || {}) },
    votes: { ...(byIndex.votes || {}), ...(byId.votes || {}), ...(uiByIndex.votes || {}), ...(uiById.votes || {}) }
  };
}

function applyMatchupOverrides(matchupData, index) {
  const matchupId = matchupData.matchup?.id || `matchup-${index + 1}`;
  const overrides = getOverridesFor(matchupId, index);

  let votes = { ...(matchupData.votes || { left: 0, right: 0 }) };
  const zeroVotes = Number(votes.left || 0) === 0 && Number(votes.right || 0) === 0;
  const shouldSeed = SEED_VOTES_CONFIG.enabled
    && (SEED_VOTES_CONFIG.mode === "override" || (SEED_VOTES_CONFIG.mode === "ifZero" && zeroVotes));
  if (shouldSeed) {
    const seeded = getSeedVotes(matchupId, index);
    if (seeded) {
      votes = { ...votes, ...seeded };
    }
  }

  if (overrides.votes && (overrides.votes.left !== undefined || overrides.votes.right !== undefined)) {
    votes = { ...votes, ...overrides.votes };
  }

  return {
    ...matchupData,
    matchup: { ...(matchupData.matchup || {}), ...(overrides.matchup || {}) },
    left: { ...(matchupData.left || {}), ...(overrides.left || {}) },
    right: { ...(matchupData.right || {}), ...(overrides.right || {}) },
    votes
  };
}

function ensureUiIndexOverride(index) {
  if (!uiOverrides.byIndex) uiOverrides.byIndex = {};
  if (!uiOverrides.byIndex[index]) uiOverrides.byIndex[index] = {};
  return uiOverrides.byIndex[index];
}

function setUiOverrideValue(index, group, key, value) {
  const override = ensureUiIndexOverride(index);
  if (!override[group]) override[group] = {};
  let nextValue = value;

  if (group === "votes") {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      nextValue = null;
    } else {
      nextValue = Math.max(0, parsed);
    }
  } else {
    nextValue = String(value || "").trim();
    if (!nextValue) nextValue = null;
  }

  if (nextValue === null) {
    delete override[group][key];
  } else {
    override[group][key] = nextValue;
  }

  if (Object.keys(override[group]).length === 0) {
    delete override[group];
  }

  if (Object.keys(override).length === 0) {
    delete uiOverrides.byIndex[index];
  }

  saveUiOverrides();
}

function clearUiOverride(index) {
  if (!uiOverrides.byIndex) return;
  delete uiOverrides.byIndex[index];
  saveUiOverrides();
}

function clearAllUiOverrides() {
  uiOverrides = {};
  saveUiOverrides();
}

function applyOverridesToState() {
  const raw = state.rawMatchups || [];
  state.matchups = raw.map((matchup, index) => applyMatchupOverrides(matchup, index));
  render();
}

function initOverrideEditor() {
  if (!ENABLE_EDITOR || editorPanel) return;
  editorPanel = document.createElement("div");
  editorPanel.className = "editor-panel";
  editorPanel.innerHTML = `
    <button class="editor-toggle" type="button" data-action="toggle">Edit</button>
    <div class="editor-body">
      <div class="editor-header">
        <div>
          <div class="editor-title">Live Overrides</div>
          <div class="editor-sub">Local only.</div>
        </div>
        <button class="editor-clear" type="button" data-action="clear-all">Clear</button>
      </div>
      <div class="editor-list"></div>
    </div>
  `;
  document.body.appendChild(editorPanel);

  editorPanel.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "toggle") {
      editorPanel.classList.toggle("is-open");
      return;
    }
    if (action === "clear-all") {
      clearAllUiOverrides();
      renderOverrideEditor();
      applyOverridesToState();
      return;
    }
    if (action === "reset") {
      const index = Number(event.target.dataset.index);
      if (Number.isNaN(index)) return;
      clearUiOverride(index);
      renderOverrideEditor();
      applyOverridesToState();
    }
  });

  editorPanel.addEventListener("input", (event) => {
    const input = event.target;
    if (!input || !input.dataset) return;
    if (!input.dataset.editorField) return;
    const index = Number(input.dataset.index);
    const group = input.dataset.group;
    const key = input.dataset.key;
    if (Number.isNaN(index) || !group || !key) return;

    if (editorUpdateTimer) clearTimeout(editorUpdateTimer);
    editorUpdateTimer = setTimeout(() => {
      setUiOverrideValue(index, group, key, input.value);
      applyOverridesToState();
    }, 200);
  });
}

function getEditorValue(index, group, key, fallback) {
  const value = uiOverrides?.byIndex?.[index]?.[group]?.[key];
  if (value !== undefined && value !== null) return String(value);
  return fallback ?? "";
}

function buildEditorField(index, label, group, key, value, type = "text") {
  const field = document.createElement("label");
  field.className = "editor-field";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.className = "editor-input";
  input.type = type;
  input.value = value;
  input.dataset.editorField = "true";
  input.dataset.index = String(index);
  input.dataset.group = group;
  input.dataset.key = key;
  if (type === "number") {
    input.min = "0";
    input.step = "1";
  }
  field.appendChild(title);
  field.appendChild(input);
  return field;
}

function buildEditorCard(matchupData, index) {
  const card = document.createElement("div");
  card.className = "editor-card";
  const matchup = matchupData.matchup || {};
  const title = matchup.title || matchup.message || matchup.category || `Matchup ${index + 1}`;

  const header = document.createElement("div");
  header.className = "editor-card-header";
  const heading = document.createElement("div");
  heading.className = "editor-card-title";
  heading.textContent = `${index + 1}. ${title}`;
  const reset = document.createElement("button");
  reset.className = "editor-reset";
  reset.type = "button";
  reset.dataset.action = "reset";
  reset.dataset.index = String(index);
  reset.textContent = "Reset";
  header.appendChild(heading);
  header.appendChild(reset);

  const grid = document.createElement("div");
  grid.className = "editor-grid";

  const messageValue = getEditorValue(index, "matchup", "message", matchup.message || "");
  const titleValue = getEditorValue(index, "matchup", "title", matchup.title || "");
  const categoryValue = getEditorValue(index, "matchup", "category", matchup.category || "");
  const leftName = getEditorValue(index, "left", "name", matchupData.left?.name || "");
  const rightName = getEditorValue(index, "right", "name", matchupData.right?.name || "");
  const leftSub = getEditorValue(index, "left", "neighborhood", matchupData.left?.neighborhood || matchupData.left?.blurb || "");
  const rightSub = getEditorValue(index, "right", "neighborhood", matchupData.right?.neighborhood || matchupData.right?.blurb || "");
  const leftTag = getEditorValue(index, "left", "tag", matchupData.left?.tag || "");
  const rightTag = getEditorValue(index, "right", "tag", matchupData.right?.tag || "");
  const leftImage = getEditorValue(index, "left", "image_url", matchupData.left?.image_url || "");
  const rightImage = getEditorValue(index, "right", "image_url", matchupData.right?.image_url || "");
  const leftVotes = getEditorValue(index, "votes", "left", matchupData.votes?.left ?? "");
  const rightVotes = getEditorValue(index, "votes", "right", matchupData.votes?.right ?? "");

  grid.appendChild(buildEditorField(index, "Header message", "matchup", "message", messageValue));
  grid.appendChild(buildEditorField(index, "Title", "matchup", "title", titleValue));
  grid.appendChild(buildEditorField(index, "Category", "matchup", "category", categoryValue));
  grid.appendChild(buildEditorField(index, "Left name", "left", "name", leftName));
  grid.appendChild(buildEditorField(index, "Right name", "right", "name", rightName));
  grid.appendChild(buildEditorField(index, "Left sub", "left", "neighborhood", leftSub));
  grid.appendChild(buildEditorField(index, "Right sub", "right", "neighborhood", rightSub));
  grid.appendChild(buildEditorField(index, "Left tag", "left", "tag", leftTag));
  grid.appendChild(buildEditorField(index, "Right tag", "right", "tag", rightTag));
  grid.appendChild(buildEditorField(index, "Left image", "left", "image_url", leftImage));
  grid.appendChild(buildEditorField(index, "Right image", "right", "image_url", rightImage));
  grid.appendChild(buildEditorField(index, "Left votes", "votes", "left", leftVotes, "number"));
  grid.appendChild(buildEditorField(index, "Right votes", "votes", "right", rightVotes, "number"));

  card.appendChild(header);
  card.appendChild(grid);
  return card;
}

function renderOverrideEditor() {
  if (!ENABLE_EDITOR || !editorPanel) return;
  const list = editorPanel.querySelector(".editor-list");
  if (!list) return;
  list.innerHTML = "";

  if (!state.matchups || state.matchups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "editor-empty";
    empty.textContent = "No matchups loaded.";
    list.appendChild(empty);
    return;
  }

  state.matchups.forEach((matchupData, index) => {
    list.appendChild(buildEditorCard(matchupData, index));
  });
}

function getMatchupAnchor(matchup, index) {
  const base = normalizeKey(
    matchup?.matchup?.id || matchup?.matchup?.title || `matchup-${index + 1}`
  );
  return base || `matchup-${index + 1}`;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function getMatchupTheme(matchup) {
  const category = normalizeKey(matchup?.matchup?.category || "");
  const title = normalizeKey(matchup?.matchup?.title || "");
  if (category.includes("politic") || title.includes("mayor")) {
    return "matchup-card--mayor";
  }
  if (
    category.includes("business") ||
    category.includes("finance") ||
    category.includes("startup") ||
    category.includes("company") ||
    title.includes("business")
  ) {
    return "matchup-card--business";
  }
  if (
    category.includes("food") ||
    category.includes("restaurant") ||
    category.includes("drink") ||
    title.includes("food") ||
    title.includes("taco") ||
    title.includes("burger")
  ) {
    return "matchup-card--food";
  }
  return "";
}

function getEntryImage(entry) {
  if (!entry) return "";
  if (entry.image_url) return entry.image_url;
  const key = normalizeKey(entry.id || entry.name || "");
  return IMAGE_OVERRIDES[key] || "";
}

function getMatchupLabel(matchup) {
  const category = matchup?.matchup?.category || "";
  if (category) return `VOTE ${category.toUpperCase()}`;
  const title = matchup?.matchup?.title || "MATCHUP";
  return `VOTE ${title.toUpperCase()}`;
}

function getCadenceLabel(cadence) {
  const value = String(cadence || "").toLowerCase();
  if (value === "daily") return "Daily Battle";
  if (value === "weekly") return "Weekly Spotlight";
  if (value === "flash") return "Flash Fight";
  return value ? value.toUpperCase() : "";
}

function resolvePreviewUrl(entry) {
  if (!entry) return "";
  const direct = entry.website || entry.url || entry.site || entry.link || "";
  if (direct) return direct;

  const keys = [entry.id, entry.name].filter(Boolean).map(normalizeKey);
  for (const key of keys) {
    if (PREVIEW_OVERRIDES[key]) {
      return PREVIEW_OVERRIDES[key];
    }
  }
  return "";
}

function setEntryPreview(entryEl, url, name) {
  if (!entryEl) return;
  const preview = entryEl.querySelector(".entry-preview");
  if (!preview) return;

  preview.innerHTML = "";
  if (!url) {
    entryEl.classList.remove("entry--has-preview");
    return;
  }

  entryEl.classList.add("entry--has-preview");

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = `${name} website preview`;
  iframe.loading = "lazy";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  preview.appendChild(iframe);
}

async function loadMatchup() {
  if (!hasApi()) return;

  try {
    const resp = await fetch(`${API_URL}/matchup`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    state.rawMatchups = data.matchups || [];
    applyOverridesToState();
    console.log('Loaded matchups:', state.matchups.length, state.matchups);
    initOverrideEditor();
    renderOverrideEditor();
  } catch (err) {
    console.error("Failed to load matchup:", err);
  }
}

function setMatchupEmpty(message) {
  const container = document.getElementById("matchup-container");
  if (!container) return;
  container.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "tiny";
  empty.style.textAlign = "center";
  empty.style.padding = "20px";
  empty.style.color = "var(--muted)";
  empty.textContent = message;
  container.appendChild(empty);
}

function buildFighter(entry, side, matchupId, hasVoted, votedSide, count, pct) {
  const fighter = document.createElement("div");
  fighter.className = `fighter fighter-${side}`;
  fighter.dataset.entry = side;
  if (hasVoted) {
    fighter.classList.toggle("fighter--selected", votedSide === side);
    fighter.classList.toggle("fighter--dim", votedSide !== side);
  }

  const imageUrl = getEntryImage(entry);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.className = "fighter-img";
    img.alt = entry?.name || "Matchup entry";
    fighter.appendChild(img);
  }

  const corner = document.createElement("div");
  corner.className = "fighter-corner";
  corner.textContent = (entry?.tag || "Local").toUpperCase();
  fighter.appendChild(corner);

  const name = document.createElement("h3");
  name.textContent = entry?.name || "TBD";
  fighter.appendChild(name);

  const sub = document.createElement("div");
  sub.className = "fighter-sub";
  sub.textContent = entry?.neighborhood || entry?.blurb || "";
  fighter.appendChild(sub);

  const button = document.createElement("button");
  button.className = "btn vote";
  button.dataset.side = side;
  button.dataset.matchupId = matchupId;
  if (hasVoted && votedSide === side) {
    button.textContent = "VOTED";
    button.classList.add("vote-selected");
  } else {
    button.textContent = "VOTE";
  }
  button.disabled = hasVoted;
  fighter.appendChild(button);

  const score = document.createElement("div");
  score.className = "fighter-score";

  const countEl = document.createElement("span");
  countEl.className = "count";
  const pctEl = document.createElement("span");
  pctEl.className = "pct";

  if (hasVoted) {
    countEl.textContent = count;
    pctEl.textContent = `${pct}%`;
    countEl.style.opacity = "1";
    pctEl.style.opacity = "1";
  } else {
    countEl.textContent = "?";
    pctEl.textContent = "?";
    countEl.style.opacity = "0.3";
    pctEl.style.opacity = "0.3";
  }

  score.appendChild(countEl);
  score.appendChild(pctEl);
  fighter.appendChild(score);

  return fighter;
}

function buildMatchupCard(matchupData, index, anchor) {
  const matchup = matchupData.matchup || {};
  const matchupId = matchup.id || `matchup-${index + 1}`;
  const votedSide = state.voted ? state.voted[matchupId] : null;
  const hasVoted = Boolean(votedSide);

  const votes = matchupData.votes || { left: 0, right: 0 };
  const total = votes.left + votes.right;
  const leftPct = total ? Math.round((votes.left / total) * 100) : 0;
  const rightPct = total ? 100 - leftPct : 0;

  const card = document.createElement("div");
  const theme = getMatchupTheme(matchupData);
  card.className = `matchup-card${theme ? ` ${theme}` : ""}`;
  card.id = anchor;
  card.dataset.matchupId = matchupId;
  card.dataset.matchupAnchor = anchor;

  const title = document.createElement("div");
  title.className = "matchup-title";

  const titleText = document.createElement("div");
  titleText.className = "matchup-title-text";
  const headerText = (matchup.message || matchup.title || matchup.category || "Matchup").toUpperCase();
  titleText.textContent = headerText;
  const cadenceLabel = getCadenceLabel(matchup.cadence);
  if (cadenceLabel) {
    const cadence = document.createElement("span");
    cadence.className = "cadence-badge";
    cadence.textContent = cadenceLabel;
    titleText.appendChild(cadence);
  }
  if (matchup.ends_at) {
    const timer = document.createElement("span");
    timer.className = "matchup-timer";
    timer.textContent = `Vote ends: ${getTimeRemaining(matchup.ends_at)}`;
    titleText.appendChild(timer);
  }

  const badge = document.createElement("div");
  badge.className = "vote-badge";
  const leftLabel = matchupData.left?.name || "Left";
  const rightLabel = matchupData.right?.name || "Right";
  if (hasVoted) {
    const votedLabel = votedSide === "left" ? leftLabel : rightLabel;
    badge.textContent = `Voted: ${votedLabel}`;
    badge.classList.add("is-visible");
  } else {
    badge.textContent = "You voted";
  }

  title.appendChild(titleText);
  title.appendChild(badge);

  const diagonal = document.createElement("div");
  diagonal.className = "diagonal-matchup";
  const left = buildFighter(matchupData.left, "left", matchupId, hasVoted, votedSide, votes.left, leftPct);
  const right = buildFighter(matchupData.right, "right", matchupId, hasVoted, votedSide, votes.right, rightPct);
  const vs = document.createElement("div");
  vs.className = "vs-diagonal";
  vs.textContent = "VS";

  diagonal.appendChild(left);
  diagonal.appendChild(vs);
  diagonal.appendChild(right);

  const actions = document.createElement("div");
  actions.className = "matchup-actions";
  const share = document.createElement("a");
  share.className = "share-link";
  share.href = `#${anchor}`;
  share.textContent = "Share this matchup";
  if (hasVoted) share.classList.add("is-visible");
  actions.appendChild(share);

  card.appendChild(title);
  card.appendChild(diagonal);
  card.appendChild(actions);

  return card;
}

function render() {
  const container = document.getElementById("matchup-container");
  if (!container) return;

  if (!state.matchups || state.matchups.length === 0) {
    setMatchupEmpty("No live matchups right now.");
    updateStickyVote();
    return;
  }

  const fragment = document.createDocumentFragment();
  const usedAnchors = new Set();
  state.anchorById = {};

  state.matchups.forEach((matchupData, idx) => {
    const matchupId = matchupData.matchup?.id || `matchup-${idx + 1}`;
    const baseAnchor = getMatchupAnchor(matchupData, idx);
    let anchor = baseAnchor;
    let suffix = 2;
    while (usedAnchors.has(anchor)) {
      anchor = `${baseAnchor}-${suffix}`;
      suffix += 1;
    }
    usedAnchors.add(anchor);
    state.anchorById[matchupId] = anchor;

    fragment.appendChild(buildMatchupCard(matchupData, idx, anchor));
  });

  container.innerHTML = "";
  container.appendChild(fragment);

  updateStickyVote();
}

function getTimeRemaining(endsAt) {
  const end = new Date(endsAt);
  const now = new Date();
  const diff = end - now;
  
  if (diff <= 0) return 'ENDED';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function getFingerprint() {
  const key = "scrumble-fp";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const value = `fp-${Date.now()}-${Math.random()}`;
  localStorage.setItem(key, value);
  return value;
}

function loadVotedState() {
  const key = "scrumble-voted";
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveVotedState(matchupId, side) {
  const key = "scrumble-voted";
  const current = loadVotedState();
  current[matchupId] = side;
  localStorage.setItem(key, JSON.stringify(current));
}

function getNextUnvotedIndex() {
  if (!state.matchups || state.matchups.length === 0) return 0;
  return state.matchups.findIndex((m) => !state.voted || !state.voted[m.matchup.id]);
}

function scrollToMatchupIndex(index) {
  if (!state.matchups || !state.matchups[index]) return;
  const matchupId = state.matchups[index].matchup?.id;
  const anchor = (state.anchorById && matchupId && state.anchorById[matchupId])
    ? state.anchorById[matchupId]
    : getMatchupAnchor(state.matchups[index], index);
  const target = document.querySelector(`.matchup-card[data-matchup-anchor="${anchor}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function updateStickyVote() {
  const btn = document.getElementById("sticky-vote-btn");
  if (!btn) return;

  if (!state.matchups || state.matchups.length === 0) {
    btn.textContent = "VOTE NOW";
    btn.dataset.text = "VOTE NOW";
    btn.disabled = false;
    btn.dataset.target = "arena";
    return;
  }

  const nextIdx = getNextUnvotedIndex();
  if (nextIdx === -1) {
    btn.textContent = "ALL VOTED";
    btn.dataset.text = "ALL VOTED";
    btn.disabled = true;
    btn.dataset.target = "";
    return;
  }

  const nextMatchup = state.matchups[nextIdx];
  const matchupId = nextMatchup.matchup?.id;
  const anchor = (state.anchorById && matchupId && state.anchorById[matchupId])
    ? state.anchorById[matchupId]
    : getMatchupAnchor(nextMatchup, nextIdx);
  const label = getMatchupLabel(nextMatchup);
  btn.textContent = label;
  btn.dataset.text = label;
  btn.disabled = false;
  btn.dataset.target = anchor;
}

function handleHashNavigation() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  const target = document.querySelector(`.matchup-card[data-matchup-anchor="${hash}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function vote(side, btn) {
  if (!hasApi() || !state.matchups || state.matchups.length === 0) return;
  if (side !== "left" && side !== "right") return;

  const matchupId = btn?.dataset.matchupId
    || btn?.closest(".matchup-card")?.dataset.matchupId;
  const matchup = state.matchups.find((m) => m.matchup?.id === matchupId);

  console.log('Vote attempt:', side, 'matchupId:', matchupId, 'matchup:', matchup);

  if (!matchup || !matchup.matchup) {
    console.error('Matchup not found for id', matchupId);
    return;
  }
  
  const actualSide = side;
  
  if (state.voted && state.voted[matchupId]) {
    if (btn) {
      btn.textContent = 'ALREADY VOTED!';
      btn.style.background = 'var(--muted)';
      setTimeout(() => {
        btn.textContent = 'VOTE';
        btn.style.background = '';
      }, 1500);
    }
    return;
  }
  
  const fingerprint = getFingerprint();

  try {
    const resp = await fetch(`${API_URL}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchup_id: matchupId,
        side: actualSide,
        fingerprint,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    if (!state.voted) state.voted = {};
    state.voted[matchupId] = actualSide;
    saveVotedState(matchupId, actualSide);
    
    matchup.votes[actualSide] += 1;
    render();

    const card = document.querySelector(`.matchup-card[data-matchup-id="${matchupId}"]`);
    if (card) {
      card.classList.add("vote-confirm");
      setTimeout(() => card.classList.remove("vote-confirm"), 500);
    }

    if (navigator.vibrate) {
      navigator.vibrate(25);
    }
    showToast("Vote locked in.");
    
    const nextMatchupIdx = getNextUnvotedIndex();
    if (nextMatchupIdx >= 0) {
      setTimeout(() => scrollToMatchupIndex(nextMatchupIdx), 800);
    }
  } catch (err) {
    console.error("Vote failed:", err);
  }
}

function init() {
  state.voted = loadVotedState();
  
  loadMatchup();
  updateStickyVote();

  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("vote") && e.target.dataset.side) {
      vote(e.target.dataset.side, e.target);
    }

    const shareLink = e.target.closest(".share-link");
    if (shareLink) {
      const hash = shareLink.getAttribute("href") || "";
      const base = window.location.href.split("#")[0];
      const url = `${base}${hash}`;
      if (navigator.share) {
        e.preventDefault();
        navigator.share({
          title: "Scrumble",
          text: "Vote on this matchup.",
          url
        }).then(() => {
          showToast("Share link ready.");
        }).catch(() => {});
        window.location.hash = hash;
        return;
      }
      if (navigator.clipboard) {
        e.preventDefault();
        navigator.clipboard.writeText(url).then(() => {
          showToast("Link copied.");
        }).catch(() => {});
        window.location.hash = hash;
      }
    }
  });

  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });
  
  const navToggle = document.querySelector('.navbar-toggle');
  const navMenu = document.querySelector('.navbar-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
    });
    
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }

  const stickyVoteBtn = document.getElementById("sticky-vote-btn");
  if (stickyVoteBtn) {
    stickyVoteBtn.addEventListener("click", () => {
      const target = stickyVoteBtn.dataset.target;
      if (!target) return;
      if (target === "arena") {
        const arena = document.getElementById("arena");
        if (arena) arena.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const match = document.getElementById(target);
      if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  
  const navBrand = document.querySelector('.navbar-brand');
  const navTime = document.querySelector('.navbar-time');
  if (navBrand) {
    let expanded = false;
    let timeInterval = null;
    
    function updateTime() {
      if (navTime && expanded) {
        const now = new Date().toLocaleString('en-US', { 
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        navTime.textContent = now;
      }
    }
    
    window.addEventListener('scroll', () => {
      if (window.scrollY > 100 && !expanded) {
        navBrand.textContent = 'SCENIC CITY RUMBLE';
        navBrand.classList.add('expanded');
        if (navTime) navTime.style.opacity = '1';
        expanded = true;
        updateTime();
        if (!timeInterval) {
          timeInterval = setInterval(updateTime, 1000);
        }
      } else if (window.scrollY <= 100 && expanded) {
        navBrand.textContent = 'SCRUMBLE';
        navBrand.classList.remove('expanded');
        if (navTime) navTime.style.opacity = '0';
        expanded = false;
        if (timeInterval) {
          clearInterval(timeInterval);
          timeInterval = null;
        }
      }
    });
  }
  
  setInterval(() => {
    if (state.matchups) render();
  }, 60000);

  window.addEventListener("hashchange", handleHashNavigation);
  setTimeout(handleHashNavigation, 400);
}

async function loadHistory() {
  if (!hasApi()) return;
  
  try {
    const resp = await fetch(`${API_URL}/history`);
    const data = await resp.json();
    
    const list = document.getElementById('history-list');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="tiny" style="text-align: center; padding: 20px; color: var(--muted);">No past brawls yet</div>';
      return;
    }
    
    list.innerHTML = data.history.filter(h => !h.active).map(h => {
      const leftWon = h.votes.left > h.votes.right;
      const total = h.votes.left + h.votes.right;
      return `
        <div class="history-item">
          <div class="history-matchup">
            <div class="history-title">${h.title}</div>
            <div class="history-meta">${h.category} • ${total} votes</div>
          </div>
          <div class="history-result">
            <div class="history-winner">${leftWon ? h.left.name : h.right.name} ${leftWon ? h.votes.left : h.votes.right}</div>
            <div class="history-loser">${leftWon ? h.right.name : h.left.name} ${leftWon ? h.votes.right : h.votes.left}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

init();
