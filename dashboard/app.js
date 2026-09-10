// ============================================================
// LeadFlow AI — Agent Control Center (frontend)
// Live monitoring, auto-refresh, safe rendering
// ============================================================

const $ = (id) => document.getElementById(id);

const el = {
  statsGrid: $('statsGrid'),
  agentList: $('agentList'),
  activityFeed: $('activityFeed'),
  leadTableBody: $('leadTableBody'),
  leadCount: $('leadCount'),
  pipelineStages: $('pipelineStages'),
  pipelineTotal: $('pipelineTotal'),
  searchInput: $('leadSearchInput'),
  citySelect: $('citySelect'),
  categorySelect: $('categorySelect'),
  runDiscoveryBtn: $('runDiscoveryBtn'),
  runOutreachBtn: $('runOutreachBtn'),
  runFullPipelineBtn: $('runFullPipelineBtn'),
  refreshBtn: $('refreshBtn'),
  autoRefreshToggle: $('autoRefreshToggle'),
  toast: $('toastNotification'),
  googleStatusDot: $('googleStatusDot'),
  googleStatusText: $('googleStatusText'),
  quotaMonthText: $('quotaMonthText'),
  quotaProgressBar: $('quotaProgressBar'),
  quotaRemainingText: $('quotaRemainingText'),
  quotaCostBadge: $('quotaCostBadge'),
  emailStatusBadge: $('emailStatusBadge'),
  emailDayText: $('emailDayText'),
  emailProgressBar: $('emailProgressBar'),
  emailRemainingText: $('emailRemainingText'),
};

let allLeads = [];
let lastActivityIds = new Set();
let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 15000;

// ---------- API key (for mutating endpoints) ----------
function getApiKey() {
  let key = localStorage.getItem('leadflow_api_key');
  if (!key) {
    key = window.prompt('Δώσε το API key για να τρέξεις agents:') || '';
    if (key) localStorage.setItem('leadflow_api_key', key.trim());
  }
  return (key || '').trim();
}

// Wrapper for protected POST calls: attaches x-api-key and re-prompts on 401.
async function apiPost(url, body) {
  const doFetch = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401) {
    localStorage.removeItem('leadflow_api_key');
    showToast('Λάθος API key — δοκίμασε ξανά', 'error');
    res = await doFetch();
  }
  return res;
}

// ---------- helpers ----------
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return 'μόλις τώρα';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} λεπτά πριν`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ώρες πριν`;
  const d = Math.round(h / 24);
  return `${d} μέρες πριν`;
}

function showToast(message, type = 'info') {
  if (!el.toast) return;
  el.toast.className = `toast ${type}`;
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.add('hidden'), 4500);
}

function progressColor(pct) {
  if (pct >= 90) return 'linear-gradient(90deg, rgba(255,111,145,0.5), var(--danger))';
  if (pct >= 70) return 'linear-gradient(90deg, rgba(245,184,77,0.5), var(--warning))';
  return 'linear-gradient(90deg, var(--success), var(--primary-2))';
}

// ---------- icons ----------
const ICONS = {
  discovered: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  qualified: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  emails: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  replies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 4h6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>',
};

const STAT_META = [
  { icon: ICONS.discovered, cls: '' },
  { icon: ICONS.qualified, cls: 'accent-2' },
  { icon: ICONS.emails, cls: 'accent-3' },
  { icon: ICONS.replies, cls: 'accent-2' },
  { icon: ICONS.replies, cls: 'accent-4' },
  { icon: ICONS.emails, cls: '' },
];

// ---------- health ----------
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (data.googleMaps) {
      const q = data.googleMaps.quota;
      if (data.googleMaps.configured) {
        if (q && q.isBlocked) {
          el.googleStatusText.textContent = 'Όριο ασφαλείας';
          el.googleStatusDot.className = 'dot';
          el.googleStatusDot.style.background = 'var(--danger)';
        } else {
          el.googleStatusText.textContent = 'Live · 0€';
          el.googleStatusDot.className = 'dot online';
          el.googleStatusDot.style.background = '';
        }
      } else {
        el.googleStatusText.textContent = 'Mock mode';
        el.googleStatusDot.className = 'dot';
        el.googleStatusDot.style.background = 'var(--warning)';
      }

      if (q) {
        el.quotaMonthText.textContent = `${q.monthlyCount} / ${q.monthlyLimit}`;
        const pct = Math.min(100, Math.round((q.monthlyCount / q.monthlyLimit) * 100));
        el.quotaProgressBar.style.width = `${pct}%`;
        el.quotaProgressBar.style.background = progressColor(pct);
        el.quotaProgressBar.parentElement.setAttribute('aria-valuenow', pct);
        el.quotaRemainingText.textContent = `${q.remainingMonth} κλήσεις · Σήμερα ${q.dailyCount}/${q.dailyLimit}`;
        if (el.quotaCostBadge) el.quotaCostBadge.textContent = q.estimatedCostEur || '0.00 €';
      }
    }

    if (data.email) {
      const e = data.email.usage;
      if (el.emailStatusBadge) {
        if (!data.email.configured) {
          el.emailStatusBadge.textContent = 'Sim';
          el.emailStatusBadge.className = 'badge-pill';
        } else if (e.isBlocked) {
          el.emailStatusBadge.textContent = 'Limit';
          el.emailStatusBadge.className = 'badge-pill danger';
        } else {
          el.emailStatusBadge.textContent = 'Live';
          el.emailStatusBadge.className = 'badge-pill success';
        }
      }
      el.emailDayText.textContent = `${e.dailyCount} / ${e.dailyLimit}`;
      const epct = Math.min(100, Math.round((e.dailyCount / e.dailyLimit) * 100));
      el.emailProgressBar.style.width = `${epct}%`;
      el.emailProgressBar.style.background = progressColor(epct);
      el.emailProgressBar.parentElement.setAttribute('aria-valuenow', epct);
      el.emailRemainingText.textContent = data.email.configured
        ? `${e.remainingDay} email σήμερα · Μήνας ${e.monthlyCount}/${e.monthlyLimit}`
        : 'Simulated — πρόσθεσε RESEND_API_KEY';
    }
  } catch (err) {
    console.warn('Health check failed', err);
    el.googleStatusText.textContent = 'Offline';
    el.googleStatusDot.className = 'dot';
    el.googleStatusDot.style.background = 'var(--danger)';
  }
}

// ---------- dashboard ----------
async function loadDashboard() {
  try {
    await checkHealth();
    const response = await fetch('/api/dashboard/overview');
    const data = await response.json();

    allLeads = data.leads || [];
    renderStats(data.stats || []);
    renderAgents(data.agents || []);
    renderActivity(data.recentEvents || []);
    renderPipeline(allLeads);
    renderLeads(filterLeads(allLeads, el.searchInput ? el.searchInput.value : ''));
  } catch (error) {
    console.error('Failed to load dashboard data', error);
    showToast('Αποτυχία φόρτωσης δεδομένων', 'error');
  }
}

function renderStats(stats) {
  el.statsGrid.innerHTML = stats.map((stat, i) => {
    const meta = STAT_META[i % STAT_META.length];
    return `
      <div class="stat-card ${meta.cls}">
        <div class="label">
          <span>${esc(stat.label)}</span>
          <span class="icon-chip" aria-hidden="true">${meta.icon}</span>
        </div>
        <div class="value">${esc(stat.value)}</div>
        <div class="trend">${esc(stat.trend)}</div>
      </div>`;
  }).join('');
}

function renderAgents(agents) {
  el.agentList.innerHTML = agents.map((agent) => {
    const badgeClass = (agent.health || '').toLowerCase();
    return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-name">
            <span class="agent-icon" aria-hidden="true">${ICONS.agent}</span>
            ${esc(agent.name)}
          </div>
          <span class="badge ${esc(badgeClass)}">${esc(agent.health)}</span>
        </div>
        <small>${esc(agent.note)}</small>
        <div class="agent-metric">
          <span>Success rate</span>
          <strong>${esc(agent.success)}%</strong>
        </div>
        <div class="progress"><span style="width:${Number(agent.success) || 0}%"></span></div>
      </div>`;
  }).join('');
}

function renderActivity(events) {
  if (!el.activityFeed) return;
  if (!events.length) {
    el.activityFeed.innerHTML = '<li class="empty-row">Καμία δραστηριότητα ακόμη. Τρέξε έναν agent!</li>';
    return;
  }
  el.activityFeed.innerHTML = events.map((ev) => {
    const isNew = !lastActivityIds.has(ev.id);
    const company = ev.company ? ` · <b>${esc(ev.company)}</b>` : '';
    return `
      <li class="activity-item ${isNew ? 'activity-enter' : ''}">
        <span class="activity-marker" aria-hidden="true">${ICONS.bolt}</span>
        <div class="activity-body">
          <div class="activity-title">${esc(ev.title)}${company}</div>
          <div class="activity-meta">
            <span class="activity-agent">${esc(ev.agent)}</span>
            <span>·</span>
            <span>${esc(timeAgo(ev.createdAt))}</span>
          </div>
        </div>
      </li>`;
  }).join('');
  lastActivityIds = new Set(events.map((e) => e.id));
}

const FUNNEL_STAGES = [
  { key: 'discovered', label: 'Discovered', match: (l) => l.status === 'new' || l.status === 'scanned' },
  { key: 'qualified', label: 'Qualified', match: (l) => l.status === 'qualified' },
  { key: 'outreach', label: 'Outreach', match: (l) => l.status === 'outreach' },
  { key: 'followup', label: 'Follow-up', match: (l) => l.status === 'followup' },
  { key: 'replied', label: 'Replied', match: (l) => l.status === 'replied' },
];

function renderPipeline(leads) {
  if (!el.pipelineStages) return;
  const counts = FUNNEL_STAGES.map((s) => ({ ...s, count: leads.filter(s.match).length }));
  const max = Math.max(1, ...counts.map((c) => c.count));

  el.pipelineStages.innerHTML = counts.map((c) => {
    const pct = Math.round((c.count / max) * 100);
    return `
      <div class="funnel-row">
        <span class="funnel-label"><span class="funnel-swatch sw-${c.key}"></span>${esc(c.label)}</span>
        <div class="funnel-bar"><div class="funnel-fill fill-${c.key}" style="width:${c.count ? Math.max(pct, 6) : 0}%"></div></div>
        <span class="funnel-count">${c.count}</span>
      </div>`;
  }).join('');

  if (el.pipelineTotal) el.pipelineTotal.textContent = `${leads.length} leads`;
}

function scoreClass(pct) {
  const n = parseInt(pct, 10) || 0;
  if (n >= 75) return 'high';
  if (n >= 45) return 'mid';
  return '';
}

function renderLeads(leads) {
  if (el.leadCount) el.leadCount.textContent = leads.length;
  if (!leads.length) {
    el.leadTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">Δεν βρέθηκαν leads με αυτά τα κριτήρια.</td></tr>';
    return;
  }
  el.leadTableBody.innerHTML = leads.map((lead) => `
    <tr>
      <td>
        <div class="lead-company">${esc(lead.company)}</div>
        <div class="lead-email">${esc(lead.email || 'Χωρίς email')}</div>
      </td>
      <td>${esc(lead.category)}</td>
      <td>${esc(lead.location)}</td>
      <td><span class="score-chip ${scoreClass(lead.score)}">${esc(lead.score)}</span></td>
      <td><span class="badge ${esc(lead.status)}">${esc(lead.status)}</span></td>
      <td><small style="color:var(--muted-soft)">${esc(lead.lastAction || '—')}</small></td>
      <td>
        ${lead.status === 'replied'
          ? '<span class="converted">★ Converted</span>'
          : `<button class="btn-inline" data-reply="${esc(lead.id)}">Simulate Reply</button>`}
      </td>
    </tr>`).join('');
}

function filterLeads(leads, term) {
  if (!term || !term.trim()) return leads;
  const q = term.toLowerCase().trim();
  return leads.filter((l) =>
    (l.company && l.company.toLowerCase().includes(q)) ||
    (l.location && l.location.toLowerCase().includes(q)) ||
    (l.category && l.category.toLowerCase().includes(q)) ||
    (l.status && l.status.toLowerCase().includes(q)));
}

async function simulateReply(leadId) {
  try {
    const res = await apiPost('/api/agents/reply-handler', { leadId, sentiment: 'positive' });
    const result = await res.json();
    if (result.ok) {
      showToast('Ο lead απάντησε θετικά! Μετακινήθηκε σε Replied.', 'success');
      await loadDashboard();
    }
  } catch (err) {
    showToast(`Σφάλμα: ${err.message}`, 'error');
  }
}

// ---------- auto refresh ----------
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadDashboard();
  }, AUTO_REFRESH_MS);
}
function stopAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

// ---------- events ----------
if (el.searchInput) {
  el.searchInput.addEventListener('input', (e) => {
    renderLeads(filterLeads(allLeads, e.target.value));
  });
}

if (el.leadTableBody) {
  el.leadTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reply]');
    if (btn) simulateReply(btn.getAttribute('data-reply'));
  });
}

if (el.refreshBtn) {
  el.refreshBtn.addEventListener('click', async () => {
    el.refreshBtn.classList.add('spinning');
    await loadDashboard();
    showToast('Ανανεώθηκε');
    setTimeout(() => el.refreshBtn.classList.remove('spinning'), 600);
  });
}

if (el.autoRefreshToggle) {
  el.autoRefreshToggle.addEventListener('change', (e) => {
    if (e.target.checked) { startAutoRefresh(); showToast('Live monitoring ενεργό'); }
    else { stopAutoRefresh(); showToast('Live monitoring ανενεργό'); }
  });
}

if (el.runDiscoveryBtn) {
  el.runDiscoveryBtn.addEventListener('click', async () => {
    const city = el.citySelect ? el.citySelect.value : 'Athens';
    const category = el.categorySelect ? el.categorySelect.value : 'Dental Clinic';
    setBtnLoading(el.runDiscoveryBtn, 'Αναζήτηση…');
    try {
      const res = await apiPost('/api/agents/discovery/run', { city, category, limit: 5, onlyWithoutWebsite: true });
      const data = await res.json();
      if (data.ok) {
        showToast(`Βρέθηκαν ${data.insertedCount} νέες επιχειρήσεις στην ${city}!`, 'success');
        await loadDashboard();
      } else {
        showToast(data.error || 'Discovery απέτυχε', 'error');
      }
    } catch (err) {
      showToast(`Σφάλμα: ${err.message}`, 'error');
    } finally {
      resetBtn(el.runDiscoveryBtn);
    }
  });
}

if (el.runOutreachBtn) {
  el.runOutreachBtn.addEventListener('click', async () => {
    setBtnLoading(el.runOutreachBtn, 'Αποστολή…');
    try {
      const res = await apiPost('/api/agents/outreach/run');
      const data = await res.json();
      if (data.ok) {
        const mode = data.usage && data.usage.configured ? 'στάλθηκαν' : 'simulated';
        let msg = `Outreach: ${data.emailsSent} ${mode}`;
        if (data.skipped) msg += `, ${data.skipped} skipped`;
        if (data.blocked) msg += `, ${data.blocked} blocked`;
        if (data.failed) msg += `, ${data.failed} failed`;
        showToast(msg, data.failed ? 'error' : 'success');
        await loadDashboard();
      } else {
        showToast(data.error || 'Outreach απέτυχε', 'error');
      }
    } catch (err) {
      showToast(`Σφάλμα: ${err.message}`, 'error');
    } finally {
      resetBtn(el.runOutreachBtn);
    }
  });
}

if (el.runFullPipelineBtn) {
  el.runFullPipelineBtn.addEventListener('click', async () => {
    setBtnLoading(el.runFullPipelineBtn, 'Εκτέλεση…');
    try {
      const city = el.citySelect ? el.citySelect.value : 'Athens';
      const category = el.categorySelect ? el.categorySelect.value : 'Dental Clinic';

      showToast('1/4 · Discovery Agent…');
      await apiPost('/api/agents/discovery/run', { city, category, limit: 3, onlyWithoutWebsite: true });
      showToast('2/4 · Scanner Agent…');
      await apiPost('/api/agents/scanner/run');
      showToast('3/4 · Qualification Agent…');
      await apiPost('/api/agents/qualification/run');
      showToast('4/4 · Outreach Agent…');
      await apiPost('/api/agents/outreach/run');

      showToast('Pipeline ολοκληρώθηκε! Όλοι οι agents έτρεξαν.', 'success');
      await loadDashboard();
    } catch (err) {
      showToast(`Pipeline απέτυχε: ${err.message}`, 'error');
    } finally {
      resetBtn(el.runFullPipelineBtn);
    }
  });
}

function setBtnLoading(btn, text) {
  btn.dataset.original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>⏳ ${text}</span>`;
}
function resetBtn(btn) {
  btn.disabled = false;
  if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
}

// Nav (visual only for single-page overview)
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    const view = item.getAttribute('data-view');
    const target = {
      leads: '.table-panel',
      agents: '.agents-panel',
      activity: '.activity-panel',
    }[view];
    if (target) document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ---------- init ----------
loadDashboard();
startAutoRefresh();
