const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const ADMIN_KEY_STORAGE = "scrumble-admin-key";

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

async function apiFetch(path, options = {}, needsAdmin = false) {
  const headers = options.headers || {};
  if (needsAdmin) {
    const key = getAdminKey();
    if (!key) throw new Error("Admin key missing");
    headers["x-admin-key"] = key;
  }

  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'submissions') loadSubmissions();
    if (tab === 'active') loadActive();
    if (tab === 'history') loadHistory();
  });
});

// Load submissions
async function loadSubmissions() {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '<div style="color: var(--muted);">Loading...</div>';
  
  try {
    const data = await apiFetch('/admin/submissions', {}, true);
    
    if (!data.submissions || data.submissions.length === 0) {
      list.innerHTML = '<div style="color: var(--muted);">No submissions yet</div>';
      return;
    }
    
    list.innerHTML = data.submissions.map(s => `
      <div class="submission-item">
        <div class="submission-header">
          <div class="submission-title">${s.left_name} vs ${s.right_name}</div>
          <span style="font-size: 0.8rem; color: var(--accent);">${s.status}</span>
        </div>
        <div class="submission-meta">Category: ${s.category}</div>
        ${s.email ? `<div class="submission-meta">Email: ${s.email}</div>` : ''}
        ${s.reason ? `<div style="color: var(--muted); font-size: 0.9rem; margin-top: 8px;">${s.reason}</div>` : ''}
        <div class="submission-meta" style="margin-top: 8px;">Submitted: ${new Date(s.timestamp).toLocaleString()}</div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="color: var(--accent);">Error: ${err.message}</div>`;
  }
}

// Load active matchup
async function loadActive() {
  const container = document.getElementById('active-matchup');
  container.innerHTML = '<div style="color: var(--muted);">Loading...</div>';
  
  try {
    const data = await apiFetch('/matchup');
    
    container.innerHTML = `
      <div class="matchup-card">
        <div class="matchup-title">${data.matchup.title}</div>
        <div class="matchup-details">
          <div><strong>Left:</strong> ${data.left.name} (${data.votes.left} votes)</div>
          <div><strong>Right:</strong> ${data.right.name} (${data.votes.right} votes)</div>
          <div><strong>Category:</strong> ${data.matchup.category}</div>
          <div><strong>Total Votes:</strong> ${data.votes.left + data.votes.right}</div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent);">Error: ${err.message}</div>`;
  }
}

// Activate matchup
document.getElementById('activate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('activate-status');
  const input = document.getElementById('activate-id');
  const matchupId = input.value.trim();
  
  if (!matchupId) {
    status.style.color = 'var(--accent)';
    status.textContent = 'Enter a matchup ID';
    return;
  }
  
  try {
    await apiFetch('/admin/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchup_id: matchupId })
    }, true);
    
    status.style.color = 'var(--accent)';
    status.textContent = `✓ Activated ${matchupId}`;
    input.value = '';
    loadActive();
  } catch (err) {
    status.style.color = 'var(--accent)';
    status.textContent = 'Error: ' + err.message;
  }
});

// Load history
async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<div style="color: var(--muted);">Loading...</div>';
  
  try {
    const data = await apiFetch('/history');
    
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div style="color: var(--muted);">No matchups yet</div>';
      return;
    }
    
    list.innerHTML = data.history.map(h => {
      const total = h.votes.left + h.votes.right;
      const leftWon = h.votes.left > h.votes.right;
      return `
        <div class="submission-item">
          <div class="submission-header">
            <div class="submission-title">${h.title}</div>
            ${h.active ? '<span style="font-size: 0.8rem; color: var(--accent);">ACTIVE</span>' : ''}
          </div>
          <div class="submission-meta">${h.category} • ${total} votes</div>
          <div style="margin-top: 8px;">
            <div style="color: ${leftWon ? 'var(--accent)' : 'var(--muted)'};">${h.left.name}: ${h.votes.left}</div>
            <div style="color: ${!leftWon ? 'var(--accent)' : 'var(--muted)'};">${h.right.name}: ${h.votes.right}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = `<div style="color: var(--accent);">Error: ${err.message}</div>`;
  }
}

// Admin key management
document.getElementById('key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('admin-key');
  const status = document.getElementById('key-status');
  const value = input.value.trim();
  
  saveAdminKey(value);
  status.style.color = 'var(--accent)';
  status.textContent = value ? '✓ Key saved' : 'Key cleared';
  
  document.getElementById('admin-status').textContent = value ? 'Authenticated' : 'Not authenticated';
});

document.getElementById('clear-key').addEventListener('click', () => {
  document.getElementById('admin-key').value = '';
  saveAdminKey('');
  document.getElementById('key-status').style.color = 'var(--accent)';
  document.getElementById('key-status').textContent = 'Key cleared';
  document.getElementById('admin-status').textContent = 'Not authenticated';
});

// Init
const savedKey = getAdminKey();
if (savedKey) {
  document.getElementById('admin-key').value = savedKey;
  document.getElementById('admin-status').textContent = 'Authenticated';
  loadSubmissions();
} else {
  document.getElementById('admin-status').textContent = 'Not authenticated - Enter admin key in Settings';
}
