const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const PREVIEW_OVERRIDES = window.SCRUMBLE_PREVIEW_OVERRIDES || {};

let state = { voted: null };

function hasApi() {
  return API_URL.length > 0;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
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
  if (!hasApi()) {
    return;
  }

  try {
    const resp = await fetch(`${API_URL}/matchup`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();

    state.matchup = data.matchup;
    state.left = data.left;
    state.right = data.right;
    state.votes = data.votes;

    render();
  } catch (err) {
    console.error("Failed to load matchup:", err);
  }
}

function render() {
  if (!state.matchup || !state.left || !state.right || !state.votes) {
    return;
  }

  const total = state.votes.left + state.votes.right;
  const leftPct = total ? Math.round((state.votes.left / total) * 100) : 0;
  const rightPct = total ? 100 - leftPct : 0;

  document.querySelector(".arena-header h2").textContent = state.matchup.title;
  document.querySelector(".arena-sub").textContent = state.matchup.category;

  const leftEntry = document.querySelector('[data-entry="left"]');
  const leftUrl = resolvePreviewUrl(state.left);
  leftEntry.querySelector("h3").innerHTML = `
    ${leftUrl ? `<img src="https://www.google.com/s2/favicons?domain=${new URL(leftUrl).hostname}&sz=32" class="entry-favicon" alt="" onerror="this.style.display='none'">` : ''}
    ${state.left.name}
  `;
  leftEntry.querySelector(".entry-sub").innerHTML = `
    ${state.left.neighborhood} - ${state.matchup.category}
    ${state.left.address ? `<div class="entry-address">${state.left.address}</div>` : ''}
    ${leftUrl ? `<a href="${leftUrl}" target="_blank" rel="noopener noreferrer" class="entry-link">${new URL(leftUrl).hostname.replace('www.', '')}</a>` : ''}
  `;
  leftEntry.querySelector(".tag").textContent = state.left.tag || "Local";
  leftEntry.querySelector("p").textContent = state.left.blurb;
  leftEntry.querySelector(".btn").textContent = `Pick ${state.left.name.split(" ")[0]}`;
  setEntryPreview(leftEntry, leftUrl, state.left.name);

  const rightEntry = document.querySelector('[data-entry="right"]');
  const rightUrl = resolvePreviewUrl(state.right);
  rightEntry.querySelector("h3").innerHTML = `
    ${rightUrl ? `<img src="https://www.google.com/s2/favicons?domain=${new URL(rightUrl).hostname}&sz=32" class="entry-favicon" alt="" onerror="this.style.display='none'">` : ''}
    ${state.right.name}
  `;
  rightEntry.querySelector(".entry-sub").innerHTML = `
    ${state.right.neighborhood} - ${state.matchup.category}
    ${state.right.address ? `<div class="entry-address">${state.right.address}</div>` : ''}
    ${rightUrl ? `<a href="${rightUrl}" target="_blank" rel="noopener noreferrer" class="entry-link">${new URL(rightUrl).hostname.replace('www.', '')}</a>` : ''}
  `;
  rightEntry.querySelector(".tag").textContent = state.right.tag || "Local";
  rightEntry.querySelector("p").textContent = state.right.blurb;
  rightEntry.querySelector(".btn").textContent = `Pick ${state.right.name.split(" ")[0]}`;
  setEntryPreview(rightEntry, rightUrl, state.right.name);

  document.getElementById("left-count").textContent = state.votes.left;
  document.getElementById("right-count").textContent = state.votes.right;
  document.getElementById("left-pct").textContent = `${leftPct}%`;
  document.getElementById("right-pct").textContent = `${rightPct}%`;

  const buttons = document.querySelectorAll(".btn.vote");
  buttons.forEach((btn) => {
    const side = btn.dataset.side;
    if (state.voted) {
      btn.disabled = true;
      btn.textContent = side === state.voted ? "Picked" : "Closed";
      btn.style.opacity = "0.7";
    } else {
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  });
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

async function vote(side) {
  if (!hasApi() || state.voted || !state.matchup || !state.votes) {
    return;
  }

  const fingerprint = getFingerprint();

  try {
    const resp = await fetch(`${API_URL}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchup_id: state.matchup.id,
        side,
        fingerprint,
      }),
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    state.voted = side;
    state.votes[side] += 1;
    
    // Animate winner/loser
    const leftEntry = document.querySelector('[data-entry="left"]');
    const rightEntry = document.querySelector('[data-entry="right"]');
    const winner = side === 'left' ? leftEntry : rightEntry;
    const loser = side === 'left' ? rightEntry : leftEntry;
    
    winner.classList.add('winner');
    loser.classList.add('loser');
    
    // Animate count
    const scoreEl = document.getElementById(`${side}-count`).parentElement;
    scoreEl.classList.add('animate');
    
    render();
  } catch (err) {
    console.error("Vote failed:", err);
  }
}

function init() {
  loadMatchup();
  loadHistory();

  document.querySelectorAll(".btn.vote").forEach((btn) => {
    btn.addEventListener("click", () => vote(btn.dataset.side));
  });

  document.querySelectorAll("[data-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  });
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
