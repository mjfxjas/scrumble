const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
const ADMIN_KEY_STORAGE = "scrumble-admin-key";

function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function saveAdminKey(value) {
  if (!value) {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    return;
  }
  sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
}

function setAuthState(isAuthed, message = "") {
  const authShell = document.getElementById("auth-shell");
  const adminApp = document.getElementById("admin-app");
  const authError = document.getElementById("auth-error");
  const authStatus = document.getElementById("auth-status");
  const realVisits = document.getElementById("visit-real");
  const allVisits = document.getElementById("visit-all");
  const visitsStatus = document.getElementById("visits-status");

  if (authShell) authShell.hidden = isAuthed;
  if (adminApp) adminApp.hidden = !isAuthed;
  if (authError) authError.textContent = message;
  if (authStatus) {
    authStatus.textContent = isAuthed ? "Authenticated" : "";
  }
  if (!isAuthed) {
    if (realVisits) realVisits.textContent = "--";
    if (allVisits) allVisits.textContent = "--";
    if (visitsStatus) visitsStatus.textContent = "";
  }
}

async function verifyAdminKey(key) {
  const resp = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": key }
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return true;
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
  return data.data || data;
}

function toLocalInputValue(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatRelativeTime(targetDate) {
  if (!targetDate || Number.isNaN(targetDate.getTime())) return '';
  const diffMs = targetDate.getTime() - Date.now();
  const future = diffMs >= 0;
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || parts.length === 0) parts.push(`${hours}h`);
  if (!days && minutes) parts.push(`${minutes}m`);

  const label = parts.join(' ');
  return future ? `in ${label}` : `${label} ago`;
}

function formatCount(value) {
  if (value === null || value === undefined) return "--";
  return new Intl.NumberFormat().format(value);
}

function getStatusLine(matchup) {
  const now = new Date();
  const startsAt = parseDate(matchup.starts_at);
  const endsAt = parseDate(matchup.ends_at);

  let status = 'Live';
  if (!matchup.active) {
    status = 'Inactive';
  } else if (startsAt && now < startsAt) {
    status = 'Scheduled';
  } else if (endsAt && now > endsAt) {
    status = 'Ended';
  }

  const parts = [`Status: ${status}`];
  if (startsAt && now < startsAt) {
    parts.push(`Starts ${formatRelativeTime(startsAt)}`);
  }
  if (endsAt) {
    parts.push(now < endsAt ? `Ends ${formatRelativeTime(endsAt)}` : `Ended ${formatRelativeTime(endsAt)}`);
  }

  return parts.join(' · ');
}

async function loadVisits() {
  const realVisits = document.getElementById("visit-real");
  const allVisits = document.getElementById("visit-all");
  const visitsStatus = document.getElementById("visits-status");
  if (!realVisits || !allVisits) return;

  if (visitsStatus) {
    visitsStatus.style.color = "var(--muted)";
    visitsStatus.textContent = "Loading…";
  }

  try {
    const data = await apiFetch('/admin/visits', {}, true);
    realVisits.textContent = formatCount(data.real || 0);
    allVisits.textContent = formatCount(data.all || 0);
    if (visitsStatus) {
      if (data.updated_at) {
        const stamp = new Date(data.updated_at);
        visitsStatus.textContent = Number.isNaN(stamp.getTime())
          ? ""
          : `Updated ${stamp.toLocaleString()}`;
      } else {
        visitsStatus.textContent = "";
      }
    }
  } catch (err) {
    if (err.message.toLowerCase().includes('forbidden') || err.message.toLowerCase().includes('admin key')) {
      saveAdminKey('');
      setAuthState(false, 'Session expired. Please log in again.');
      return;
    }
    if (visitsStatus) {
      visitsStatus.style.color = "var(--danger)";
      visitsStatus.textContent = `Error: ${err.message}`;
    }
  }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'matchups') loadMatchups();
    if (tab === 'submissions') loadSubmissions();
  });
});

// Create new matchup form
const createForm = document.getElementById('create-matchup-form');
if (createForm) {
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('create-status');
    
    const matchupId = `m${Date.now()}`;
    const leftId = document.getElementById('new-left-id').value.trim();
    const rightId = document.getElementById('new-right-id').value.trim();
    const startsAt = document.getElementById('new-starts-at').value;
    const endsAt = document.getElementById('new-ends-at').value;
    
    const payload = {
      matchup: {
        id: matchupId,
        title: document.getElementById('new-title').value.trim(),
        category: document.getElementById('new-category').value.trim(),
        left_entry_id: leftId,
        right_entry_id: rightId,
        cadence: document.getElementById('new-cadence').value,
        starts_at: startsAt ? new Date(startsAt).toISOString() : '',
        ends_at: endsAt ? new Date(endsAt).toISOString() : '',
        active: document.getElementById('new-active').checked,
        message: ''
      },
      left: {
        id: leftId,
        name: document.getElementById('new-left-name').value.trim()
      },
      right: {
        id: rightId,
        name: document.getElementById('new-right-name').value.trim()
      }
    };
    
    try {
      status.textContent = 'Creating...';
      await apiFetch('/admin/matchup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, true);
      
      status.textContent = '✓ Matchup created!';
      status.style.color = 'var(--accent)';
      createForm.reset();
      setTimeout(() => {
        status.textContent = '';
        document.querySelector('[data-tab="matchups"]').click();
      }, 1500);
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      status.style.color = 'var(--accent)';
    }
  });
}

// Load active matchups
async function loadMatchups() {
  const list = document.getElementById('matchups-list');
  list.innerHTML = '<div style="color: var(--muted); padding: 20px;">Loading...</div>';
  
  try {
    const data = await apiFetch('/admin/matchups', {}, true);
    
    if (!data.matchups || data.matchups.length === 0) {
      list.innerHTML = '<div style="color: var(--muted); padding: 20px;">No active matchups</div>';
      return;
    }
    
    list.innerHTML = data.matchups.map(m => renderMatchupCard(m)).join('');
    attachMatchupHandlers();
  } catch (err) {
    if (err.message.toLowerCase().includes('forbidden') || err.message.toLowerCase().includes('admin key')) {
      saveAdminKey('');
      setAuthState(false, 'Session expired. Please log in again.');
      return;
    }
    list.innerHTML = `<div style="color: var(--accent); padding: 20px;">Error: ${err.message}</div>`;
  }
}

function renderMatchupCard(m) {
  const total = m.votes.left + m.votes.right;
  const leftPct = total ? Math.round((m.votes.left / total) * 100) : 0;
  const cadence = (m.matchup.cadence || '').trim();
  const cadenceBadge = cadence ? `<span class="badge badge--muted">${cadence}</span>` : '';
  const statusLine = getStatusLine(m.matchup);
  
  return `
    <div class="matchup-admin-card" data-id="${m.matchup.id}">
      <div class="card-header">
        <div>
          <h3>${m.matchup.title}</h3>
          <div class="card-subtitle">${statusLine}</div>
        </div>
        <div class="badge-group">
          <span class="badge">${m.matchup.category}</span>
          ${cadenceBadge}
          <input type="checkbox" class="matchup-select" data-id="${m.matchup.id}" />
        </div>
      </div>
      
      <div class="card-body">
        <div class="matchup-stats">
          <div class="stat">
            <div class="stat-label">${m.left.name}</div>
            <div class="stat-value">${m.votes.left} <span class="stat-pct">(${leftPct}%)</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">${m.right.name}</div>
            <div class="stat-value">${m.votes.right} <span class="stat-pct">(${100-leftPct}%)</span></div>
          </div>
          <div class="stat">
            <div class="stat-label">Total Votes</div>
            <div class="stat-value">${total}</div>
          </div>
        </div>
        
        <div class="schedule-grid">
          <div class="edit-section">
            <label>Start</label>
            <input type="datetime-local" class="edit-starts-at" value="${toLocalInputValue(m.matchup.starts_at)}" />
          </div>

          <div class="edit-section">
            <label>End</label>
            <div class="input-group">
              <input type="datetime-local" class="edit-ends-at" value="${toLocalInputValue(m.matchup.ends_at)}" />
              <button class="btn-quick" data-action="extend" data-days="1">+1d</button>
              <button class="btn-quick" data-action="extend" data-days="7">+7d</button>
              <button class="btn-quick" data-action="extend" data-days="14">+14d</button>
            </div>
          </div>

          <div class="edit-section">
            <label>Cadence</label>
            <select class="edit-cadence">
              <option value="" ${!cadence ? 'selected' : ''}>None</option>
              <option value="daily" ${cadence === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${cadence === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="flash" ${cadence === 'flash' ? 'selected' : ''}>Flash</option>
            </select>
          </div>
        </div>
        
        <div class="edit-section">
          <label>Banner Message</label>
          <input type="text" class="edit-message" placeholder="Optional message to display" value="${m.matchup.message || ''}" />
        </div>
        
        <div class="card-actions">
          <button class="btn primary btn-save">Save</button>
          <button class="btn ghost btn-clone">Clone</button>
          <button class="btn danger btn-reset">Reset Votes</button>
        </div>
        
        <div class="status-msg"></div>
      </div>
    </div>
  `;
}

function attachMatchupHandlers() {
  updateBulkActions();
  
  document.querySelectorAll('.matchup-select').forEach(checkbox => {
    checkbox.addEventListener('change', updateBulkActions);
  });
  
  document.querySelectorAll('.matchup-admin-card').forEach(card => {
    const id = card.dataset.id;
    
    // Quick extend buttons
    card.querySelectorAll('.btn-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.days);
        const input = card.querySelector('.edit-ends-at');
        const current = input.value ? new Date(input.value) : new Date();
        current.setDate(current.getDate() + days);
        input.value = toLocalInputValue(current);
      });
    });
    
    // Save button
    card.querySelector('.btn-save').addEventListener('click', async () => {
      const startsAt = card.querySelector('.edit-starts-at').value;
      const endsAt = card.querySelector('.edit-ends-at').value;
      const cadence = card.querySelector('.edit-cadence').value;
      const message = card.querySelector('.edit-message').value;
      const status = card.querySelector('.status-msg');
      
      try {
        await apiFetch(`/admin/matchup/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            starts_at: startsAt ? new Date(startsAt).toISOString() : '',
            ends_at: endsAt ? new Date(endsAt).toISOString() : '',
            cadence: cadence || '',
            message: message || ''
          })
        }, true);
        
        status.textContent = '✓ Saved';
        status.style.color = 'var(--accent)';
        setTimeout(() => status.textContent = '', 2000);
        loadMatchups();
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = 'var(--accent)';
      }
    });
    
    // Clone button
    card.querySelector('.btn-clone').addEventListener('click', async () => {
      const status = card.querySelector('.status-msg');
      try {
        const result = await apiFetch(`/admin/matchup/${id}/clone`, {
          method: 'POST'
        }, true);
        
        status.textContent = '✓ Cloned';
        status.style.color = 'var(--accent)';
        setTimeout(() => loadMatchups(), 1000);
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = 'var(--accent)';
      }
    });
    
    // Reset votes button
    card.querySelector('.btn-reset').addEventListener('click', async () => {
      if (!confirm('Reset all votes to 0? This cannot be undone.')) return;
      
      const status = card.querySelector('.status-msg');
      try {
        await apiFetch(`/admin/matchup/${id}/reset-votes`, {
          method: 'POST'
        }, true);
        
        status.textContent = '✓ Votes reset';
        status.style.color = 'var(--accent)';
        setTimeout(() => loadMatchups(), 1000);
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.style.color = 'var(--accent)';
      }
    });
  });
}

function updateBulkActions() {
  const checkboxes = document.querySelectorAll('.matchup-select');
  const selected = Array.from(checkboxes).filter(cb => cb.checked);
  const bulkActions = document.getElementById('bulk-actions');
  const bulkCount = document.getElementById('bulk-count');
  
  if (bulkActions) {
    bulkActions.style.display = selected.length > 0 ? 'flex' : 'none';
  }
  if (bulkCount) {
    bulkCount.textContent = `${selected.length} selected`;
  }
}

function getSelectedMatchupIds() {
  return Array.from(document.querySelectorAll('.matchup-select:checked'))
    .map(cb => cb.dataset.id);
}

// Bulk operations
const bulkActivateBtn = document.getElementById('bulk-activate-btn');
if (bulkActivateBtn) {
  bulkActivateBtn.addEventListener('click', async () => {
    const ids = getSelectedMatchupIds();
    if (!ids.length) return;
    
    try {
      await apiFetch('/admin/bulk-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup_ids: ids })
      }, true);
      
      alert(`Activated ${ids.length} matchup(s)`);
      loadMatchups();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

const bulkDeactivateBtn = document.getElementById('bulk-deactivate-btn');
if (bulkDeactivateBtn) {
  bulkDeactivateBtn.addEventListener('click', async () => {
    const ids = getSelectedMatchupIds();
    if (!ids.length) return;
    
    try {
      await apiFetch('/admin/bulk-deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchup_ids: ids })
      }, true);
      
      alert(`Deactivated ${ids.length} matchup(s)`);
      loadMatchups();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

const archiveEndedBtn = document.getElementById('archive-ended-btn');
if (archiveEndedBtn) {
  archiveEndedBtn.addEventListener('click', async () => {
    if (!confirm('Archive all ended matchups?')) return;
    
    try {
      const result = await apiFetch('/admin/archive-ended', {
        method: 'POST'
      }, true);
      
      alert(`Archived ${result.archived} matchup(s)`);
      loadMatchups();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

const clearSelectionBtn = document.getElementById('clear-selection-btn');
if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener('click', () => {
    document.querySelectorAll('.matchup-select').forEach(cb => cb.checked = false);
    updateBulkActions();
  });
}

// Load submissions
async function loadSubmissions() {
  const list = document.getElementById('submissions-list');
  list.innerHTML = '<div style="color: var(--muted); padding: 20px;">Loading...</div>';
  
  try {
    const data = await apiFetch('/admin/submissions', {}, true);
    
    if (!data.submissions || data.submissions.length === 0) {
      list.innerHTML = '<div style="color: var(--muted); padding: 20px;">No submissions yet</div>';
      return;
    }
    
    list.innerHTML = data.submissions.map(s => `
      <div class="submission-card" data-timestamp="${s.timestamp}">
        <div class="card-header">
          <h4>${s.left_name} vs ${s.right_name}</h4>
          <span class="badge badge--${s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : 'muted'}">${s.status}</span>
        </div>
        <div class="card-body">
          <div><strong>Category:</strong> ${s.category}</div>
          ${s.email ? `<div><strong>Email:</strong> ${s.email}</div>` : ''}
          ${s.reason ? `<div style="margin-top: 8px; color: var(--muted);">${s.reason}</div>` : ''}
          ${s.rejection_reason ? `<div style="margin-top: 8px; color: var(--accent);"><strong>Rejection:</strong> ${s.rejection_reason}</div>` : ''}
          <div style="margin-top: 8px; font-size: 0.85rem; color: var(--muted);">
            ${new Date(s.timestamp).toLocaleString()}
          </div>
          ${s.status === 'pending' ? `
            <div class="card-actions" style="margin-top: 12px;">
              <button class="btn primary btn-approve">Approve</button>
              <button class="btn danger btn-reject">Reject</button>
            </div>
            <div class="reject-form" style="display: none; margin-top: 8px;">
              <input type="text" class="reject-reason" placeholder="Rejection reason" style="width: 100%; padding: 8px; margin-bottom: 8px;" />
              <button class="btn danger btn-confirm-reject">Confirm Reject</button>
              <button class="btn ghost btn-cancel-reject">Cancel</button>
            </div>
          ` : ''}
          <div class="status-msg"></div>
        </div>
      </div>
    `).join('');
    
    attachSubmissionHandlers();
  } catch (err) {
    if (err.message.toLowerCase().includes('forbidden') || err.message.toLowerCase().includes('admin key')) {
      saveAdminKey('');
      setAuthState(false, 'Session expired. Please log in again.');
      return;
    }
    list.innerHTML = `<div style="color: var(--accent); padding: 20px;">Error: ${err.message}</div>`;
  }
}

function attachSubmissionHandlers() {
  document.querySelectorAll('.submission-card').forEach(card => {
    const timestamp = card.dataset.timestamp;
    const approveBtn = card.querySelector('.btn-approve');
    const rejectBtn = card.querySelector('.btn-reject');
    const rejectForm = card.querySelector('.reject-form');
    const confirmRejectBtn = card.querySelector('.btn-confirm-reject');
    const cancelRejectBtn = card.querySelector('.btn-cancel-reject');
    const status = card.querySelector('.status-msg');
    
    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        try {
          await apiFetch(`/admin/submission/${timestamp}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' })
          }, true);
          
          status.textContent = '✓ Approved';
          status.style.color = 'var(--accent)';
          setTimeout(() => loadSubmissions(), 1000);
        } catch (err) {
          status.textContent = 'Error: ' + err.message;
          status.style.color = 'var(--accent)';
        }
      });
    }
    
    if (rejectBtn && rejectForm) {
      rejectBtn.addEventListener('click', () => {
        rejectForm.style.display = 'block';
        rejectBtn.style.display = 'none';
        if (approveBtn) approveBtn.style.display = 'none';
      });
    }
    
    if (cancelRejectBtn && rejectForm) {
      cancelRejectBtn.addEventListener('click', () => {
        rejectForm.style.display = 'none';
        if (rejectBtn) rejectBtn.style.display = '';
        if (approveBtn) approveBtn.style.display = '';
      });
    }
    
    if (confirmRejectBtn && rejectForm) {
      confirmRejectBtn.addEventListener('click', async () => {
        const reason = card.querySelector('.reject-reason').value.trim();
        if (!reason) {
          status.textContent = 'Rejection reason required';
          status.style.color = 'var(--accent)';
          return;
        }
        
        try {
          await apiFetch(`/admin/submission/${timestamp}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
          }, true);
          
          status.textContent = '✓ Rejected';
          status.style.color = 'var(--accent)';
          setTimeout(() => loadSubmissions(), 1000);
        } catch (err) {
          status.textContent = 'Error: ' + err.message;
          status.style.color = 'var(--accent)';
        }
      });
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('admin-key');
    const button = loginForm.querySelector('button[type="submit"]');
    const value = input ? input.value.trim() : '';

    if (!value) {
      setAuthState(false, 'Admin key required.');
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Logging in...';
    }

    try {
      await verifyAdminKey(value);
      saveAdminKey(value);
      if (input) input.value = '';
      setAuthState(true);
      loadMatchups();
      loadVisits();
    } catch (err) {
      saveAdminKey('');
      setAuthState(false, err.message || 'Login failed.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Log in';
      }
    }
  });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    saveAdminKey('');
    setAuthState(false, 'Logged out.');
  });
}

const refreshVisitsBtn = document.getElementById('refresh-visits');
if (refreshVisitsBtn) {
  refreshVisitsBtn.addEventListener('click', () => {
    loadVisits();
  });
}

async function initAuth() {
  const savedKey = getAdminKey();
  if (!savedKey) {
    setAuthState(false);
    return;
  }
  try {
    await verifyAdminKey(savedKey);
    setAuthState(true);
    loadMatchups();
    loadVisits();
  } catch (err) {
    saveAdminKey('');
    setAuthState(false, 'Session expired. Please log in.');
  }
}

initAuth();
