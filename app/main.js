const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const PREVIEW_OVERRIDES = window.SCRUMBLE_PREVIEW_OVERRIDES || {};
const MATCHUP_OVERRIDES = window.SCRUMBLE_MATCHUP_OVERRIDES || {};
const MATCHUP_OVERRIDES_BY_INDEX = window.SCRUMBLE_MATCHUP_OVERRIDES_BY_INDEX || {};
const SEED_VOTES_CONFIG = normalizeSeedVotesConfig(window.SCRUMBLE_SEED_VOTES);
const ENABLE_EDITOR = window.SCRUMBLE_ENABLE_EDITOR !== false;
const UI_OVERRIDE_STORAGE_KEY = "scrumble-ui-overrides";

let state = { voted: null, loading: {} };
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

const ANALYTICS_DEBUG = window.SCRUMBLE_ANALYTICS_DEBUG === true;

function trackEvent(name, params = {}) {
  try {
    if (ANALYTICS_DEBUG) {
      console.info('[analytics]', name, params);
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
    if (typeof window.plausible === 'function') {
      window.plausible(name, { props: params });
    }
  } catch (err) {
    console.debug('trackEvent failed', name, err);
  }
}

function winnerSummary(matchupData) {
  const leftVotes = Number(matchupData?.votes?.left || 0);
  const rightVotes = Number(matchupData?.votes?.right || 0);
  const leftName = matchupData?.left?.name || 'Left';
  const rightName = matchupData?.right?.name || 'Right';
  if (leftVotes >= rightVotes) {
    return { winner: leftName, loser: rightName, winnerVotes: leftVotes, loserVotes: rightVotes };
  }
  return { winner: rightName, loser: leftName, winnerVotes: rightVotes, loserVotes: leftVotes };
}

function makeShareCardDataUrl(matchupData) {
  const matchup = matchupData?.matchup || {};
  const summary = winnerSummary(matchupData);
  const width = 1200;
  const height = 630;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f1115');
  gradient.addColorStop(1, '#1f2533');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#f7b24d';
  ctx.font = '700 52px "Space Grotesk", sans-serif';
  ctx.fillText('SCRUMBLE', 60, 95);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px "Space Grotesk", sans-serif';
  ctx.fillText((matchup.title || matchup.message || 'Chattanooga Matchup').slice(0, 46), 60, 185);

  ctx.font = '600 34px "Space Grotesk", sans-serif';
  ctx.fillText(`${summary.winner} wins`, 60, 280);

  ctx.font = '500 28px "Space Grotesk", sans-serif';
  ctx.fillStyle = '#d6d8de';
  ctx.fillText(`${summary.winnerVotes} - ${summary.loserVotes} vs ${summary.loser}`, 60, 330);

  ctx.fillStyle = '#f7b24d';
  ctx.font = '500 24px "Space Grotesk", sans-serif';
  ctx.fillText('Vote local at scrumble.cc', 60, 560);

  return canvas.toDataURL('image/png');
}

async function shareMatchupCard(url, matchupData) {
  const dataUrl = makeShareCardDataUrl(matchupData);
  const filename = `scrumble-${matchupData?.matchup?.id || 'matchup'}.png`;

  try {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Scrumble',
        text: 'Chattanooga voted. See this matchup.',
        url,
        files: [file]
      });
      return 'shared';
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
    return 'downloaded';
  } catch (err) {
    console.debug('share card fallback', err);
    return 'failed';
  }
}

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  const fetchOptions = {
    ...options,
    signal: controller.signal
  };
  
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        // Handle both old and new response formats
        if (data.success === false) {
          throw new Error(data.error || 'Request failed');
        }
        // New format: {success: true, data: {...}}
        // Old format: {matchups: [...]} or {history: [...]}
        const actualData = data.data || data;
        return { ok: true, data: actualData };
      }
      
      if (response.status >= 400 && response.status < 500) {
        const data = await response.json();
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error('Request timeout');
      } else {
        lastError = err;
      }
    }
    if (attempt < maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function setLoading(key, isLoading) {
  state.loading[key] = isLoading;
  updateLoadingUI(key, isLoading);
}

function updateLoadingUI(key, isLoading) {
  if (key === 'matchup') {
    const container = document.getElementById('matchup-container');
    if (container && isLoading) {
      container.innerHTML = '<div class="tiny" style="text-align: center; padding: 20px; color: var(--muted);">Loading matchups...</div>';
    }
  }
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
  // Disabled - admin mode on main page instead
  return;
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
  if (entry.image_url) {
    // Increase Google Places image size from 400 to 800
    return entry.image_url.replace('maxWidthPx=400', 'maxWidthPx=800');
  }
  const key = normalizeKey(entry.id || entry.name || "");
  return IMAGE_OVERRIDES[key] || "";
}

function createOptimizedImage(src, alt) {
  // Create picture element with WebP/AVIF fallbacks
  if (!src) return null;
  
  const picture = document.createElement('picture');
  
  // Try AVIF first (best compression)
  if (src.endsWith('.jpg') || src.endsWith('.jpeg') || src.endsWith('.png')) {
    const avifSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.avif');
    const sourceAvif = document.createElement('source');
    sourceAvif.type = 'image/avif';
    sourceAvif.srcset = avifSrc;
    picture.appendChild(sourceAvif);
    
    // WebP fallback
    const webpSrc = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    const sourceWebp = document.createElement('source');
    sourceWebp.type = 'image/webp';
    sourceWebp.srcset = webpSrc;
    picture.appendChild(sourceWebp);
  }
  
  // Original format fallback
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'fighter-img';
  img.loading = 'lazy';
  picture.appendChild(img);
  
  return picture;
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

  setLoading('matchup', true);
  try {
    const result = await fetchWithRetry(`${API_URL}/matchup`);
    console.log('Fetch result:', result);
    const data = result.data;
    console.log('Data:', data);

    state.rawMatchups = (data && data.matchups) || [];
    applyOverridesToState();
    console.log('Loaded matchups:', state.matchups.length, state.matchups);
    initOverrideEditor();
    renderOverrideEditor();
  } catch (err) {
    console.error("Failed to load matchup:", err);
    setMatchupEmpty("Failed to load matchups. Retrying...");
    setTimeout(loadMatchup, 3000);
  } finally {
    setLoading('matchup', false);
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
    fighter.style.setProperty('--fighter-bg', `url(${imageUrl})`);
  }

  const corner = document.createElement("div");
  corner.className = "fighter-corner";
  const tag = entry?.tag || "";
  const normalizedTag = tag.toLowerCase() === "local" ? "" : tag;
  corner.textContent = normalizedTag.toUpperCase();
  if (normalizedTag) fighter.appendChild(corner);

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
    button.innerHTML = `<span class="count">${count}</span> <span class="pct">${pct}%</span>`;
    button.classList.add("vote-selected");
  } else if (hasVoted) {
    button.innerHTML = `<span class="count">${count}</span> <span class="pct">${pct}%</span>`;
  } else {
    button.textContent = "VOTE";
  }
  button.disabled = hasVoted;
  fighter.appendChild(button);

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
    const votedCount = votedSide === "left" ? votes.left : votes.right;
    const isMajority = votedCount > (total / 2);
    badge.innerHTML = `Voted: ${votedLabel}<br><span style="font-size: 0.85em; opacity: 0.9;">${isMajority ? "You're in the majority" : "You're in the minority"}</span>`;
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
  
  const commentsBtn = document.createElement("button");
  commentsBtn.className = "comments-toggle";
  commentsBtn.textContent = "💬 Comments";
  commentsBtn.dataset.matchupId = matchupId;
  commentsBtn.id = `comments-btn-${matchupId}`;
  actions.appendChild(commentsBtn);
  
  const share = document.createElement("a");
  share.className = "share-link";
  share.href = `#${anchor}`;
  share.textContent = "Share";
  if (hasVoted) share.classList.add("is-visible");
  actions.appendChild(share);

  const copyBtn = document.createElement("button");
  copyBtn.className = "share-copy-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy link";
  copyBtn.dataset.matchupId = matchupId;
  if (hasVoted) copyBtn.classList.add("is-visible");
  actions.appendChild(copyBtn);
  
  const commentsSection = document.createElement("div");
  commentsSection.className = "comments-section";
  commentsSection.id = `comments-${matchupId}`;
  commentsSection.innerHTML = '<div class="comments-loading">Loading...</div>';

  card.appendChild(title);
  card.appendChild(diagonal);
  card.appendChild(actions);
  card.appendChild(commentsSection);
  
  if (adminMode) {
    const adminBar = document.createElement('div');
    adminBar.className = 'admin-bar';
    adminBar.innerHTML = `
      <button class="admin-btn admin-edit-matchup" data-matchup-id="${matchupId}">Edit</button>
      <button class="admin-btn admin-reset-votes" data-matchup-id="${matchupId}">Reset Votes</button>
      <button class="admin-btn admin-seed-comments" data-matchup-id="${matchupId}">Seed Comments</button>
      <button class="admin-btn admin-toggle-active" data-matchup-id="${matchupId}">${matchup.active ? 'Deactivate' : 'Activate'}</button>
      <button class="admin-btn admin-delete-matchup" data-matchup-id="${matchupId}">Delete</button>
    `;
    card.appendChild(adminBar);
  }

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
    trackEvent('matchup_impression', { matchup_id: matchupId, index: idx });
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
  loadCommentCounts();
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
  trackEvent('vote_click', { matchup_id: matchupId, side });

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

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'VOTING...';
  }

  try {
    const result = await fetchWithRetry(`${API_URL}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchup_id: matchupId,
        side: actualSide,
        fingerprint,
      }),
    });

    if (!result.ok) {
      throw new Error('Vote failed');
    }

    if (!state.voted) state.voted = {};
    state.voted[matchupId] = actualSide;
    saveVotedState(matchupId, actualSide);
    
    matchup.votes[actualSide] += 1;

    trackEvent('vote_success', { matchup_id: matchupId, side: actualSide });

    const total = matchup.votes.left + matchup.votes.right;
    const votedCount = matchup.votes[actualSide];
    const isMajority = votedCount > (total / 2);
    
    render();
    
    const card = document.querySelector(`.matchup-card[data-matchup-id="${matchupId}"]`);
    if (card) {
      const badge = card.querySelector('.vote-badge');
      if (badge) {
        const votedLabel = actualSide === "left" ? matchup.left.name : matchup.right.name;
        badge.innerHTML = `Voted: ${votedLabel}<br><span style="font-size: 0.85em; opacity: 0.9;">${isMajority ? "You're in the majority" : "You're in the minority"}</span>`;
      }
    }

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
      setTimeout(() => scrollToMatchupIndex(nextMatchupIdx), 1600);
    } else {
      // All matchups voted - show rating prompt
      setTimeout(() => showBatchRatingPrompt(), 1600);
    }
  } catch (err) {
    console.error("Vote failed:", err);
    showToast("Vote failed. Try again.");
    if (btn) {
      btn.textContent = 'RETRY';
      btn.disabled = false;
    }
  }
}

function init() {
  state.voted = loadVotedState();
  
  loadMatchup();
  updateStickyVote();

  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("vote") && e.target.dataset.side) {
      vote(e.target.dataset.side, e.target);
    }

    const copyBtn = e.target.closest('.share-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      const matchupId = copyBtn.dataset.matchupId;
      const anchor = state.anchorById?.[matchupId] || matchupId;
      const base = window.location.href.split('#')[0];
      const shareUrl = new URL(base);
      shareUrl.searchParams.set('utm_source', 'scrumble_share');
      shareUrl.searchParams.set('utm_medium', 'copy');
      shareUrl.searchParams.set('utm_campaign', 'matchup_share');
      const url = `${shareUrl.toString()}#${anchor}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          trackEvent('share_click', { matchup_id: matchupId || 'unknown', mode: 'copy_button' });
          showToast('Link copied.');
        }).catch(() => {});
      }
      return;
    }

    const shareLink = e.target.closest(".share-link");
    if (shareLink) {
      e.preventDefault();
      const hash = shareLink.getAttribute("href") || "";
      const base = window.location.href.split("#")[0];
      const shareUrl = new URL(base);
      shareUrl.searchParams.set('utm_source', 'scrumble_share');
      shareUrl.searchParams.set('utm_medium', 'social');
      shareUrl.searchParams.set('utm_campaign', 'matchup_share');
      const url = `${shareUrl.toString()}${hash}`;
      const matchupId = shareLink.closest('.matchup-card')?.dataset?.matchupId;
      const matchupData = (state.matchups || []).find(m => m.matchup?.id === matchupId);

      trackEvent('share_click', { matchup_id: matchupId || 'unknown' });

      if (matchupData) {
        const shareResult = await shareMatchupCard(url, matchupData);
        if (shareResult === 'shared') {
          showToast('Shared card.');
        } else if (shareResult === 'downloaded') {
          showToast('Card downloaded. Share it anywhere.');
        }
      }

      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('Link copied.');
        }).catch(() => {});
      }
      window.location.hash = hash;
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
  
  // Future matchups button
  const futureBtn = document.getElementById('future-matchups-btn');
  if (futureBtn) {
    futureBtn.addEventListener('click', showFutureMatchups);
  }
  
  // Modal close handlers
  const modal = document.getElementById('future-modal');
  if (modal) {
    modal.querySelector('.modal-close')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.querySelector('.modal-overlay')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
}

async function showFutureMatchups() {
  const modal = document.getElementById('future-modal');
  const list = document.getElementById('future-list');
  if (!modal || !list) return;
  
  modal.style.display = 'block';
  list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">Loading...</div>';
  
  if (!hasApi()) {
    list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">API not configured</div>';
    return;
  }
  
  try {
    const result = await fetchWithRetry(`${API_URL}/future`);
    const data = result.data;
    
    if (!data || !data.matchups || data.matchups.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">No upcoming matchups</div>';
      return;
    }
    
    const now = new Date();
    const future = data.matchups.filter(m => {
      if (!m.matchup.starts_at) return false;
      const starts = new Date(m.matchup.starts_at);
      return starts > now;
    }).slice(0, 5);
    
    if (future.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">No scheduled matchups yet</div>';
      return;
    }
    
    list.innerHTML = future.map(m => {
      const starts = new Date(m.matchup.starts_at);
      const timeUntil = getTimeUntil(starts);
      return `
        <div style="padding: 16px; border-bottom: 1px solid var(--border);">
          <div style="font-weight: 600; margin-bottom: 4px;">${m.matchup.title}</div>
          <div style="color: var(--muted); font-size: 0.9rem; margin-bottom: 8px;">${m.matchup.category}</div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.85rem;">${m.left.name} vs ${m.right.name}</div>
            </div>
            <div style="color: var(--accent); font-size: 0.85rem; font-weight: 500;">${timeUntil}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load future matchups:', err);
    list.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted);">Failed to load</div>';
  }
}

function getTimeUntil(date) {
  const now = new Date();
  const diff = date - now;
  
  if (diff <= 0) return 'Starting soon';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h`;
  return 'Starting soon';
}

async function loadHistory() {
  if (!hasApi()) return;
  
  const list = document.getElementById('history-list');
  if (list) {
    list.innerHTML = '<div class="tiny" style="text-align: center; padding: 20px; color: var(--muted);">Loading history...</div>';
  }

  try {
    const result = await fetchWithRetry(`${API_URL}/history`);
    const data = result.data;
    
    if (!list) return;
    
    if (!data || !data.history || data.history.length === 0) {
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
    if (list) {
      list.innerHTML = '<div class="tiny" style="text-align: center; padding: 20px; color: var(--muted);">Failed to load history</div>';
    }
  }
}

init();

// Rotating poster background
async function initHeroBackground() {
  const heroBg = document.getElementById('hero-bg');
  if (!heroBg) return;
  
  try {
    const response = await fetch('/SCRUMBLE_POSTERS/posters.json');
    const posters = await response.json();
    if (!posters || posters.length === 0) return;
    
    let currentIndex = Math.floor(Math.random() * posters.length);
    
    function showPoster(index) {
      const poster = posters[index];
      if (!poster) return;
      
      const img = document.createElement('img');
      img.src = poster.hero;
      img.alt = poster.name;
      img.onload = () => {
        heroBg.innerHTML = '';
        heroBg.appendChild(img);
        heroBg.classList.add('active');
      };
    }
    
    showPoster(currentIndex);
    
    setInterval(() => {
      currentIndex = (currentIndex + 1) % posters.length;
      heroBg.classList.remove('active');
      setTimeout(() => showPoster(currentIndex), 1000);
    }, 8000);
  } catch (err) {
    console.error('Failed to load posters:', err);
  }
}

// initHeroBackground();


// Comments
document.body.addEventListener('click', async (e) => {
  if (e.target.classList.contains('comments-toggle')) {
    const matchupId = e.target.dataset.matchupId;
    const section = document.getElementById(`comments-${matchupId}`);
    
    if (section.classList.contains('expanded')) {
      section.classList.remove('expanded');
      return;
    }
    
    section.classList.add('expanded');
    trackEvent('comment_open', { matchup_id: matchupId });
    await loadComments(matchupId);
  }
  
  if (e.target.classList.contains('comment-submit')) {
    const matchupId = e.target.dataset.matchupId;
    await submitComment(matchupId);
  }
  
  if (e.target.classList.contains('comment-delete')) {
    const matchupId = e.target.dataset.matchupId;
    const timestamp = e.target.dataset.timestamp;
    await deleteComment(matchupId, timestamp);
  }
  
  if (e.target.classList.contains('vote-btn')) {
    const matchupId = e.target.dataset.matchupId;
    const timestamp = e.target.dataset.timestamp;
    const voteType = e.target.classList.contains('vote-up') ? 'up' : 'down';
    await voteComment(matchupId, timestamp, voteType);
  }
});

async function loadComments(matchupId) {
  const section = document.getElementById(`comments-${matchupId}`);
  section.innerHTML = '<div class="comments-loading">Loading...</div>';
  
  try {
    const result = await fetchWithRetry(`${API_URL}/comments?matchup_id=${matchupId}`);
    const comments = result.data.comments || [];
    
    updateCommentCount(matchupId, comments.length);
    
    section.innerHTML = `
      <div class="comment-form">
        <input type="text" class="comment-name" placeholder="Your name" maxlength="50" />
        <textarea class="comment-text" placeholder="Add a comment..." maxlength="500"></textarea>
        <button class="btn vote comment-submit" data-matchup-id="${matchupId}">Post</button>
      </div>
      <div class="comment-list">
        ${comments.length === 0 ? '<div class="comment-empty">No comments yet. Be the first!</div>' : ''}
        ${comments.map(c => {
          const score = c.upvotes - c.downvotes;
          return `
          <div class="comment">
            <div class="comment-header">
              <div class="comment-author">${c.author_name}</div>
              <div class="comment-votes">
                <button class="vote-btn vote-up" data-matchup-id="${matchupId}" data-timestamp="${c.timestamp}">👍 ${c.upvotes}</button>
                <span class="vote-score">${score > 0 ? '+' : ''}${score}</span>
                <button class="vote-btn vote-down" data-matchup-id="${matchupId}" data-timestamp="${c.timestamp}">👎 ${c.downvotes}</button>
              </div>
            </div>
            <div class="comment-text">${c.comment_text}</div>
            ${adminMode ? `<button class="comment-delete" data-matchup-id="${matchupId}" data-timestamp="${c.timestamp}">Delete</button>` : ''}
          </div>
        `}).join('')}
      </div>
    `;
  } catch (err) {
    section.innerHTML = '<div class="comments-error">Failed to load comments</div>';
  }
}

function updateCommentCount(matchupId, count) {
  const btn = document.getElementById(`comments-btn-${matchupId}`);
  if (btn) {
    btn.textContent = `💬 Comments (${count})`;
  }
}

async function loadCommentCounts() {
  if (!state.matchups) return;
  
  for (const matchup of state.matchups) {
    const matchupId = matchup.matchup.id;
    try {
      const result = await fetchWithRetry(`${API_URL}/comments?matchup_id=${matchupId}`);
      const count = result.data.comments?.length || 0;
      updateCommentCount(matchupId, count);
    } catch (err) {
      // Ignore errors
    }
  }
}

async function submitComment(matchupId) {
  const section = document.getElementById(`comments-${matchupId}`);
  const nameInput = section.querySelector('.comment-name');
  const textInput = section.querySelector('.comment-text');
  
  const name = nameInput.value.trim();
  const text = textInput.value.trim();
  
  if (!name || !text) {
    showToast('Name and comment required');
    return;
  }
  
  try {
    await fetchWithRetry(`${API_URL}/comment`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        matchup_id: matchupId,
        author_name: name,
        comment_text: text,
        fingerprint: getFingerprint()
      })
    });
    
    nameInput.value = '';
    textInput.value = '';
    showToast('Comment posted!');
    await loadComments(matchupId);
  } catch (err) {
    showToast('Failed to post comment');
  }
}


async function deleteComment(matchupId, timestamp) {
  if (!adminMode || !adminKey) {
    showToast('Admin access required');
    return;
  }
  
  try {
    await fetchWithRetry(`${API_URL}/comment/${matchupId}/${timestamp}`, {
      method: 'DELETE',
      headers: {'X-Admin-Key': adminKey}
    });
    
    showToast('Comment deleted');
    await loadComments(matchupId);
  } catch (err) {
    showToast('Failed to delete comment');
  }
}


// Admin Mode
let adminMode = false;
let adminKey = null;

function checkAdminMode() {
  adminKey = sessionStorage.getItem('scrumble-admin-key');
  if (adminKey) {
    adminMode = true;
    updateAdminUI();
  }
}

function updateAdminUI() {
  const toggle = document.querySelector('.admin-toggle');
  if (!toggle) return;
  
  if (adminMode) {
    toggle.textContent = 'Logout';
    toggle.style.background = 'rgba(255, 68, 68, 0.2)';
    toggle.style.borderColor = '#ff4444';
    document.body.classList.add('admin-mode');
  } else {
    toggle.textContent = 'Admin';
    toggle.style.background = '';
    toggle.style.borderColor = '';
    document.body.classList.remove('admin-mode');
  }
  
  render();
}

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('admin-toggle')) {
    if (adminMode) {
      sessionStorage.removeItem('scrumble-admin-key');
      adminKey = null;
      adminMode = false;
      updateAdminUI();
    } else {
      const key = prompt('Enter admin key:');
      if (!key) return;
      
      try {
        const result = await fetchWithRetry(`${API_URL}/admin/login`, {
          method: 'POST',
          headers: {'X-Admin-Key': key}
        });
        
        if (result.ok) {
          sessionStorage.setItem('scrumble-admin-key', key);
          adminKey = key;
          adminMode = true;
          updateAdminUI();
          showToast('Admin mode enabled');
        }
      } catch (err) {
        showToast('Invalid admin key');
      }
    }
  }
  
  if (e.target.classList.contains('admin-delete-matchup')) {
    const matchupId = e.target.dataset.matchupId;
    if (confirm('Delete this matchup?')) {
      await deleteMatchup(matchupId);
    }
  }
  
  if (e.target.classList.contains('admin-toggle-active')) {
    const matchupId = e.target.dataset.matchupId;
    await toggleMatchupActive(matchupId);
  }
  
  if (e.target.classList.contains('admin-edit-matchup')) {
    const matchupId = e.target.dataset.matchupId;
    await editMatchup(matchupId);
  }
  
  if (e.target.classList.contains('admin-reset-votes')) {
    const matchupId = e.target.dataset.matchupId;
    if (confirm('Reset votes to 0?')) {
      await resetVotes(matchupId);
    }
  }
  
  if (e.target.classList.contains('admin-seed-comments')) {
    const matchupId = e.target.dataset.matchupId;
    await seedComments(matchupId);
  }
});

async function deleteMatchup(matchupId) {
  try {
    await fetchWithRetry(`${API_URL}/admin/matchup/${matchupId}`, {
      method: 'DELETE',
      headers: {'X-Admin-Key': adminKey}
    });
    showToast('Matchup deleted');
    await loadMatchup();
  } catch (err) {
    showToast('Failed to delete matchup');
  }
}

async function toggleMatchupActive(matchupId) {
  const matchup = state.matchups.find(m => m.matchup.id === matchupId);
  if (!matchup) return;
  
  try {
    await fetchWithRetry(`${API_URL}/admin/matchup/${matchupId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', 'X-Admin-Key': adminKey},
      body: JSON.stringify({active: !matchup.matchup.active})
    });
    showToast('Matchup updated');
    await loadMatchup();
  } catch (err) {
    showToast('Failed to update matchup');
  }
}

async function editMatchup(matchupId) {
  const matchup = state.matchups.find(m => m.matchup.id === matchupId);
  if (!matchup) return;
  
  const endsAt = prompt('Ends at (ISO format or empty):', matchup.matchup.ends_at || '');
  if (endsAt === null) return;
  
  const message = prompt('Header message:', matchup.matchup.message || '');
  if (message === null) return;
  
  try {
    await fetchWithRetry(`${API_URL}/admin/matchup/${matchupId}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json', 'X-Admin-Key': adminKey},
      body: JSON.stringify({ends_at: endsAt, message: message})
    });
    showToast('Matchup updated');
    await loadMatchup();
  } catch (err) {
    showToast('Failed to update matchup');
  }
}

async function resetVotes(matchupId) {
  try {
    await fetchWithRetry(`${API_URL}/admin/matchup/${matchupId}/reset-votes`, {
      method: 'POST',
      headers: {'X-Admin-Key': adminKey}
    });
    showToast('Votes reset');
    await loadMatchup();
  } catch (err) {
    showToast('Failed to reset votes');
  }
}

const SEED_COMMENTS = [
  {name: 'Sarah M.', text: 'This is such a tough choice!'},
  {name: 'Mike Johnson', text: 'Both are great, but I have to go with my gut.'},
  {name: 'Jessica R.', text: 'Can\'t believe this is even a question!'},
  {name: 'David Chen', text: 'I\'ve been to both and honestly can\'t decide.'},
  {name: 'Emily Parker', text: 'First!'},
  {name: 'Chris Anderson', text: 'This matchup is fire 🔥'},
  {name: 'Amanda Lee', text: 'Y\'all are sleeping on the other option.'},
  {name: 'Brandon K.', text: 'I love Chattanooga but this one is obvious.'},
  {name: 'Rachel Green', text: 'Been going here for years, no contest.'},
  {name: 'Tom Wilson', text: 'Interesting matchup! Hard to choose.'},
  {name: 'Lisa Brown', text: 'Both have their pros and cons tbh.'},
  {name: 'Kevin Martinez', text: 'The vibes are just better at one of these.'},
  {name: 'Nicole Davis', text: 'This is the matchup we needed!'},
  {name: 'Jason Taylor', text: 'Respect to both but my vote is clear.'},
  {name: 'Megan White', text: 'Can we just appreciate both? 😊'},
  {name: 'Ryan Thompson', text: 'Hot take: neither is that great.'},
  {name: 'Ashley Moore', text: 'Finally someone said it!'},
  {name: 'Daniel Garcia', text: 'This is going to be close.'},
  {name: 'Lauren Hill', text: 'I\'m shocked this is even competitive.'},
  {name: 'Marcus Jones', text: 'Quality matchup right here.'}
];

async function seedComments(matchupId) {
  const count = parseInt(prompt('How many comments to seed? (1-10)', '3'));
  if (!count || count < 1 || count > 10) return;
  
  const shuffled = [...SEED_COMMENTS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);
  
  try {
    for (const comment of selected) {
      await fetchWithRetry(`${API_URL}/comment`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          matchup_id: matchupId,
          author_name: comment.name,
          comment_text: comment.text,
          fingerprint: 'seed'
        })
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    showToast(`Seeded ${count} comments`);
    await loadCommentCounts();
  } catch (err) {
    showToast('Failed to seed comments');
  }
}

checkAdminMode();


async function voteComment(matchupId, timestamp, voteType) {
  const fingerprint = getFingerprint();
  
  try {
    await fetchWithRetry(`${API_URL}/comment/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchup_id: matchupId, timestamp, vote_type: voteType, fingerprint })
    });
    
    // Add voted class to clicked button
    const section = document.getElementById(`comments-${matchupId}`);
    const btn = section.querySelector(`.vote-${voteType}[data-timestamp="${timestamp}"]`);
    if (btn) btn.classList.add('voted');
    
    await loadComments(matchupId);
  } catch (err) {
    showToast(err.message || 'Already voted');
  }
}


// Matchup Rating
function showBatchRatingPrompt() {
  // Get all voted matchups that haven't been rated
  const unratedMatchups = state.matchups.filter(m => {
    const matchupId = m.matchup.id;
    const voted = state.voted && state.voted[matchupId];
    const rated = sessionStorage.getItem(`rated-${matchupId}`);
    return voted && !rated;
  });
  
  if (unratedMatchups.length === 0) return;
  
  const modal = document.createElement('div');
  modal.className = 'rating-modal';
  modal.innerHTML = `
    <div class="rating-overlay"></div>
    <div class="rating-content">
      <div class="rating-title">How were today's matchups?</div>
      <div class="rating-subtitle">${unratedMatchups.length} matchup${unratedMatchups.length > 1 ? 's' : ''} to rate</div>
      <div class="rating-buttons">
        <button class="btn vote rating-btn" data-rating="good">👍 Good</button>
        <button class="btn ghost rating-btn" data-rating="bad">👎 Not Great</button>
        <button class="btn link rating-skip">Skip</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', async (e) => {
    if (e.target.classList.contains('rating-btn')) {
      const rating = e.target.dataset.rating;
      // Rate all unrated matchups
      for (const matchup of unratedMatchups) {
        await rateMatchup(matchup.matchup.id, rating);
      }
      modal.remove();
    }
    
    if (e.target.classList.contains('rating-skip') || e.target.classList.contains('rating-overlay')) {
      // Mark all as skipped
      unratedMatchups.forEach(m => {
        sessionStorage.setItem(`rated-${m.matchup.id}`, 'skipped');
      });
      modal.remove();
    }
  });
  
  setTimeout(() => modal.classList.add('show'), 10);
}

function showRatingPrompt(matchupId) {
  const modal = document.createElement('div');
  modal.className = 'rating-modal';
  modal.innerHTML = `
    <div class="rating-overlay"></div>
    <div class="rating-content">
      <div class="rating-title">Was this a good matchup?</div>
      <div class="rating-buttons">
        <button class="btn vote rating-btn" data-rating="good">👍 Yes</button>
        <button class="btn ghost rating-btn" data-rating="bad">👎 No</button>
        <button class="btn link rating-skip">Skip</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.addEventListener('click', async (e) => {
    if (e.target.classList.contains('rating-btn')) {
      const rating = e.target.dataset.rating;
      await rateMatchup(matchupId, rating);
      modal.remove();
    }
    
    if (e.target.classList.contains('rating-skip') || e.target.classList.contains('rating-overlay')) {
      sessionStorage.setItem(`rated-${matchupId}`, 'skipped');
      modal.remove();
    }
  });
  
  setTimeout(() => modal.classList.add('show'), 10);
}

async function rateMatchup(matchupId, rating) {
  const fingerprint = getFingerprint();
  
  try {
    await fetchWithRetry(`${API_URL}/matchup/rate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({matchup_id: matchupId, rating, fingerprint})
    });
    
    sessionStorage.setItem(`rated-${matchupId}`, rating);
    showToast(rating === 'good' ? 'Thanks for the feedback!' : 'Thanks, we\'ll improve!');
  } catch (err) {
    console.error('Rating failed:', err);
  }
}
