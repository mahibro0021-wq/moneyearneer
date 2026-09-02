const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const initData = tg?.initData || '';
const urlParams = new URLSearchParams(window.location.search);
// Priority: real startapp param (if Mini App short-link ever configured) → fallback ?ref= from bot.js → nothing
const startParam = tg?.initDataUnsafe?.start_param || urlParams.get('ref') || '';

let state = {
  balance: 0,
  adsWatchedToday: 0,
  adsWatchedTotal: 0,
  referralsCount: 0,
  referralLink: '',
  achievements: { ref10Claimed: false, ads17ClaimedDate: null }
};

const AD_DAILY_LIMIT = 17;
const AD_MILESTONE_TODAY = () => new Date().toISOString().slice(0, 10);

// ---------- helpers ----------
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => { el.className = 'toast ' + type; }, 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'error');
  return data;
}

function fmt(n) {
  return Number(n).toFixed(2);
}

// ---------- tabs ----------
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${name}"]`).classList.add('active');
  if (name === 'task') loadTasks();
  if (name === 'withdraw') { loadLiveWithdraws(); loadHistory(); refreshActivationGate(); }
  else stopLiveWithdrawTicker(); // pause the ticker while user isn't looking at it
}

// ---------- load user ----------
async function loadUser() {
  try {
    const qs = new URLSearchParams({ initData, startParam });
    const data = await api('/api/user?' + qs.toString());
    state = { ...state, ...data };
    renderHome();
  } catch (e) {
    console.error(e);
    toast('ইউজার লোড করা যায়নি', 'error');
  }
}

function renderHome() {
  document.getElementById('profileName').textContent = state.name || 'User';
  document.getElementById('profileBalance').textContent = `ব্যালেন্স: ৳${fmt(state.balance)} টাকা`;
  document.getElementById('homeBalance').textContent = fmt(state.balance);
  document.getElementById('adsWatchedStat').textContent = state.adsWatchedTotal ?? 0;
  document.getElementById('referralsStat').textContent = state.referralsCount ?? 0;
  document.getElementById('refLinkBox').textContent = state.referralLink || '';
  document.getElementById('wdBalance').textContent = fmt(state.balance);
  document.getElementById('wdReferrals').textContent = state.referralsCount ?? 0;

  if (state.photoUrl) {
    document.getElementById('avatarImg').src = state.photoUrl;
    document.getElementById('avatarImg').style.display = 'block';
    document.getElementById('avatarFallback').style.display = 'none';
  } else {
    document.getElementById('avatarFallback').textContent = (state.name || 'U').charAt(0).toUpperCase();
  }

  updateAdProgress();
  renderAchievements();
}

// ---------- referral actions ----------
document.getElementById('copyRefBtn').addEventListener('click', () => {
  navigator.clipboard?.writeText(state.referralLink || '');
  toast('রেফারেল লিংক কপি হয়েছে ✅', 'success');
});
document.getElementById('shareRefBtn').addEventListener('click', () => {
  const url = `https://t.me/share/url?url=${encodeURIComponent(state.referralLink)}&text=${encodeURIComponent('প্রতিদিন টাকা আয় করুন! আমার রেফারেল দিয়ে জয়েন করুন 🎁')}`;
  if (tg) tg.openTelegramLink(url); else window.open(url, '_blank');
});

// ---------- rewarded ad ----------
function updateAdProgress() {
  document.getElementById('adProgressLabel').textContent = `${state.adsWatchedToday} / ${AD_DAILY_LIMIT} TODAY`;
  const pct = Math.min(100, (state.adsWatchedToday / AD_DAILY_LIMIT) * 100);
  document.getElementById('adProgressFill').style.width = pct + '%';
  const btn = document.getElementById('watchAdBtn');
  if (state.adsWatchedToday >= AD_DAILY_LIMIT) {
    btn.textContent = 'আজকের লিমিট শেষ';
    btn.disabled = true;
  } else {
    btn.textContent = 'Watch Ad';
    btn.disabled = false;
  }
}

document.getElementById('watchAdBtn').addEventListener('click', () => {
  showAd(async () => {
    // this callback only fires after the ad network confirms a full/rewarded view
    try {
      const data = await api('/api/earn', { method: 'POST', body: { initData, action: 'watch_ad' } });
      state.balance += data.reward;
      state.adsWatchedToday = data.adsWatchedToday;
      state.adsWatchedTotal += 1;
      renderHome();
      toast(`🎉 ৳${data.reward} যোগ হয়েছে!`, 'success');
    } catch (e) {
      toast('রিওয়ার্ড দেওয়া যায়নি, আবার চেষ্টা করুন', 'error');
    }
  });
});

// Plug your ad network SDK in here (Monetag / Adsgram / GigaPub / Adexium).
// onReward() must be called ONLY when the ad network itself confirms a
// completed/rewarded view (its own callback) — never on a plain timeout,
// so a user can't skip early and still get paid.
function showAd(onReward) {
  if (window.show_11678821) {
    window.show_11678821().then(onReward).catch(() => toast('বিজ্ঞাপন লোড করা যায়নি', 'error'));
    return;
  }
  toast('⚠️ Ad SDK এখনো কনফিগার করা হয়নি (index.html-এ যোগ করুন)', 'error');
}

// ---------- achievements ----------
function renderAchievements() {
  const list = document.getElementById('achievementList');
  const refDone = Math.min(state.referralsCount, 10);
  const refClaimable = state.referralsCount >= 10 && !state.achievements.ref10Claimed;
  const refClaimed = state.achievements.ref10Claimed;

  const adsToday = state.adsWatchedToday;
  const adClaimedToday = state.achievements.ads17ClaimedDate === AD_MILESTONE_TODAY();
  const adClaimable = adsToday >= 17 && !adClaimedToday;

  list.innerHTML = `
    <div class="ach-card">
      <div class="ach-reward">+৳150</div>
      <div class="ach-top">
        <div class="ach-icon">👥</div>
        <div>
          <div class="ach-title">১০ রেফারেল বোনাস 🎉</div>
          <div class="ach-desc">১০ টি রেফার কমপ্লিট করুন এবং ১৫০ টাকা বোনাস পান নিশ্চিতে 🎉</div>
        </div>
      </div>
      <div class="ach-progress-label"><span>REFER</span><span>${refDone} / 10 (${Math.round(refDone/10*100)}%)</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${refDone/10*100}%"></div></div>
      ${refClaimed
        ? `<div class="ach-status">✅ CLAIMED</div>`
        : refClaimable
          ? `<button class="ach-claim-btn" id="claimRefBtn">Claim ৳150</button>`
          : `<div class="ach-status">🔒 LOCKED · ${10 - refDone} more</div>`
      }
    </div>

    <div class="ach-card">
      <div class="ach-reward">+৳70</div>
      <div class="ach-top">
        <div class="ach-icon">📹</div>
        <div>
          <div class="ach-title">১৭ এড কমপ্লিট বোনাস 🎁</div>
          <div class="ach-desc">১৭ টি এড দেখা কমপ্লিট করুন এবং প্রতিদিন ফ্রিতে ৭০ টাকা বোনাস পান 🎉🎁</div>
        </div>
      </div>
      <div class="ach-progress-label"><span>ADS TODAY</span><span>${adsToday} / 17 (${Math.round(adsToday/17*100)}%)</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, adsToday/17*100)}%"></div></div>
      ${adClaimedToday
        ? `<div class="ach-status">✅ CLAIMED TODAY</div>`
        : adClaimable
          ? `<button class="ach-claim-btn" id="claimAdBtn">Claim ৳70</button>`
          : `<div class="ach-status">🔒 LOCKED · ${17 - adsToday} more</div>`
      }
    </div>
  `;

  const claimRefBtn = document.getElementById('claimRefBtn');
  if (claimRefBtn) claimRefBtn.addEventListener('click', () => claimAchievement('claim_referral_bonus'));
  const claimAdBtn = document.getElementById('claimAdBtn');
  if (claimAdBtn) claimAdBtn.addEventListener('click', () => claimAchievement('claim_ad_bonus'));
}

async function claimAchievement(action) {
  try {
    const data = await api('/api/earn', { method: 'POST', body: { initData, action } });
    state.balance += data.reward;
    if (action === 'claim_referral_bonus') state.achievements.ref10Claimed = true;
    if (action === 'claim_ad_bonus') state.achievements.ads17ClaimedDate = AD_MILESTONE_TODAY();
    renderHome();
    toast(`🎉 ৳${data.reward} বোনাস পেয়েছেন!`, 'success');
  } catch (e) {
    toast('ক্লেইম করা যায়নি', 'error');
  }
}

// ---------- social tasks ----------
async function loadTasks() {
  try {
    const qs = new URLSearchParams({ initData });
    const data = await api('/api/task?' + qs.toString());
    renderTasks(data.tasks);
  } catch (e) {
    console.error(e);
  }
}

function renderTasks(tasks) {
  const list = document.getElementById('taskList');
  if (!tasks.length) {
    list.innerHTML = `<div class="empty-state">এই মুহূর্তে কোনো টাস্ক নেই</div>`;
    return;
  }
  list.innerHTML = tasks.map(t => `
    <div class="task-card">
      <div class="task-icon">📢</div>
      <div class="task-body">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-desc">${escapeHtml(t.description || '')}</div>
        <div class="task-reward">+৳${t.reward} বোনাস</div>
      </div>
      <button class="task-btn ${t.completed ? 'done' : ''}" data-id="${t.id}" data-link="${escapeHtml(t.link)}" ${t.completed ? 'disabled' : ''}>
        ${t.completed ? '✓ Done' : 'JOIN'}
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.task-btn:not(.done)').forEach(btn => {
    btn.addEventListener('click', () => handleTaskJoin(btn));
  });
}

function handleTaskJoin(btn) {
  const link = btn.dataset.link;
  const id = btn.dataset.id;
  if (tg) tg.openTelegramLink(link); else window.open(link, '_blank');

  // "normal" tasks: complete as soon as user comes back to the mini app.
  // "verified" tasks: same trigger, but the server checks real channel
  // membership and simply won't reward it if they didn't actually join.
  const onReturn = async () => {
    document.removeEventListener('visibilitychange', visHandler);
    try {
      const data = await api('/api/task', { method: 'POST', body: { initData, taskId: id } });
      state.balance += data.reward;
      renderHome();
      toast(`🎉 ৳${data.reward} বোনাস পেয়েছেন!`, 'success');
      loadTasks();
    } catch (e) {
      if (String(e.message) === 'not_joined') {
        toast('আপনি এখনো জয়েন করেননি — জয়েন করে আবার চেষ্টা করুন', 'error');
      } else if (String(e.message) === 'already_completed') {
        loadTasks();
      } else {
        toast('টাস্ক কমপ্লিট করা যায়নি', 'error');
      }
    }
  };
  const visHandler = () => { if (document.visibilityState === 'visible') onReturn(); };
  document.addEventListener('visibilitychange', visHandler);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ---------- withdraw ----------
document.getElementById('requestWithdrawBtn').addEventListener('click', async () => {
  const method = document.getElementById('methodSelect').value;
  const accountNumber = document.getElementById('accountNumberInput').value.trim();
  const amount = document.getElementById('amountInput').value;

  try {
    await api('/api/withdraw', { method: 'POST', body: { initData, method, accountNumber, amount } });
    toast('✅ Withdraw রিকুয়েস্ট পাঠানো হয়েছে!', 'success');
    document.getElementById('accountNumberInput').value = '';
    document.getElementById('amountInput').value = '';
    loadUser();
    loadHistory();
  } catch (e) {
    const msg = {
      below_minimum: 'সর্বনিম্ন উইথড্র এমাউন্ট পূরণ হয়নি (৳1000)',
      insufficient_balance: 'পর্যাপ্ত ব্যালেন্স নেই',
      invalid_account_number: 'সঠিক অ্যাকাউন্ট নাম্বার দিন',
      invalid_method: 'সঠিক মেথড বাছাই করুন',
      activation_required: 'উইথড্র করার জন্য প্রথমে আপনার Account Active করতে হবে'
    }[e.message] || 'উইথড্র রিকুয়েস্ট পাঠানো যায়নি';

    if (e.message === 'activation_required') {
      // Only reachable once the user actually qualifies for withdraw
      // (right amount + balance) — this is the moment the security
      // check kicks in, so simulate a brief verification pause before
      // revealing the form instead of popping it open instantly.
      toast('🔍 নিরাপত্তা যাচাই করা হচ্ছে...', '');
      setTimeout(() => {
        refreshActivationGate({ forceShow: true });
        document.getElementById('activationGate').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 900);
    } else {
      toast(msg, 'error');
    }
  }
});

// ---------- account activation gate (withdraw security step) ----------
// Username/UID fields are left empty on purpose — the user must Copy
// their own info and Paste it in manually rather than have it silently
// auto-filled, since that friction is part of the check.

// Shows the activation form (until approved), a "pending review" notice,
// or the normal withdraw form — depending on the account's current
// activation state. forceShow reveals the gate immediately even when the
// user hasn't submitted anything yet (used right when the gate first
// triggers from a withdraw attempt).
async function refreshActivationGate({ forceShow = false } = {}) {
  const gate = document.getElementById('activationGate');
  const form = document.getElementById('withdrawForm');
  const badge = document.getElementById('activationStatusBadge');

  try {
    const qs = new URLSearchParams({ initData, type: 'activation_status' });
    const data = await api('/api/withdraw?' + qs.toString());
    state.accountActive = data.active;
    document.getElementById('activationNoticeText').textContent = data.noticeText || '';
    if (data.copyButtonText) {
      document.getElementById('copyMyInfoBtn').textContent = data.copyButtonText;
    }
    if (data.usernamePlaceholder) {
      document.getElementById('actUsernameInput').placeholder = data.usernamePlaceholder;
    }
    if (data.tgidPlaceholder) {
      document.getElementById('actTgIdInput').placeholder = data.tgidPlaceholder;
    }

    if (data.active) {
      gate.style.display = 'none';
      form.style.display = 'block';
      badge.style.display = 'inline-block';
      badge.className = 'activation-status-badge active';
      badge.textContent = '✅ Active';
      return;
    }

    badge.style.display = 'inline-block';

    if (data.pending) {
      badge.className = 'activation-status-badge pending';
      badge.textContent = '⏳ Pending';
      gate.style.display = 'block';
      form.style.display = 'none';
      document.getElementById('activationPendingNotice').style.display = 'block';
      document.getElementById('activationFormWrap').style.display = 'none';
    } else {
      badge.className = 'activation-status-badge locked';
      badge.textContent = '🔒 Locked';
      document.getElementById('activationPendingNotice').style.display = 'none';
      document.getElementById('activationFormWrap').style.display = 'block';
      if (forceShow) {
        gate.style.display = 'block';
        form.style.display = 'none';
      } else {
        // Not yet triggered — keep the normal withdraw form showing.
        gate.style.display = 'none';
        form.style.display = 'block';
      }
    }
  } catch (e) { console.error(e); }

  loadActivationHistory();
}

// This button no longer touches the user's real Telegram data — it's a
// plain "copy" action that just copies its own visible label (admin-editable
// from the panel), so clicking it doesn't actually hand out real account
// info to anyone probing the page.
document.getElementById('copyMyInfoBtn').addEventListener('click', (e) => {
  const text = e.currentTarget.textContent.trim();
  navigator.clipboard?.writeText(text);
  toast('কপি হয়েছে ✅', 'success');
});

// Copies the admin-configured notice text itself (not the user's data).
document.getElementById('copyNoticeTextBtn').addEventListener('click', () => {
  const text = document.getElementById('activationNoticeText').textContent.trim();
  navigator.clipboard?.writeText(text);
  toast('কপি হয়েছে ✅', 'success');
});

document.getElementById('submitActivationBtn').addEventListener('click', async () => {
  const telegramUsername = document.getElementById('actUsernameInput').value.trim();
  const telegramId = document.getElementById('actTgIdInput').value.trim();

  if (!telegramId) { toast('আপনার TGID দিন', 'error'); return; }

  try {
    await api('/api/withdraw', { method: 'POST', body: { initData, action: 'activate', telegramUsername, telegramId } });
    toast('✅ Submission পাঠানো হয়েছে — Pending', 'success');
    refreshActivationGate();
  } catch (e) {
    const msg = {
      invalid_telegram_id: 'সঠিক TGID দিন',
      already_active: 'আপনার অ্যাকাউন্ট ইতিমধ্যে Active আছে',
      already_pending: 'আপনার একটি Submission ইতিমধ্যে Pending আছে'
    }[e.message] || 'Submission পাঠানো যায়নি';
    toast(msg, 'error');
  }
});

async function loadActivationHistory() {
  try {
    const qs = new URLSearchParams({ initData, type: 'activation_history' });
    const data = await api('/api/withdraw?' + qs.toString());
    const list = document.getElementById('activationHistoryList');
    if (!data.history.length) {
      list.innerHTML = `<div class="empty-state">এখনো কোনো Submission নেই</div>`;
      return;
    }
    const statusText = { pending: 'PENDING', approved: 'ACTIVE', rejected: 'REJECTED' };
    list.innerHTML = data.history.map(s => `
      <div class="history-item">
        <div class="live-avatar">📮</div>
        <div>
          <div class="live-name">@${escapeHtml(s.telegramUsername || '-')}</div>
          <div class="live-meta">TGID: ${escapeHtml(String(s.telegramId))} • ${timeAgo(s.createdAt)}</div>
        </div>
        <span class="history-status ${s.status}">${statusText[s.status]}</span>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// ---------- live withdraw ticker ----------
// Instead of stacking every live withdraw as a separate row, we keep ONE
// slot on screen and rotate through the list every few seconds. If there
// are only 2 entries, those same 2 will just keep alternating forever —
// which is exactly the "loop through whoever's in the list" behaviour asked for.
let liveWithdrawQueue = [];
let liveWithdrawIndex = 0;
let liveWithdrawTimer = null;
const LIVE_WITHDRAW_ROTATE_MS = 3000; // how long each name stays on screen

async function loadLiveWithdraws() {
  try {
    const qs = new URLSearchParams({ initData, type: 'live' });
    const data = await api('/api/withdraw?' + qs.toString());
    liveWithdrawQueue = data.live || [];
    liveWithdrawIndex = 0;
    startLiveWithdrawTicker();
  } catch (e) { console.error(e); }
}

function startLiveWithdrawTicker() {
  stopLiveWithdrawTicker();
  const list = document.getElementById('liveWithdrawList');
  if (!liveWithdrawQueue.length) {
    list.innerHTML = `<div class="empty-state">এখনো কোনো লাইভ উইথড্র নেই</div>`;
    return;
  }
  renderLiveWithdrawItem(true); // show the first one immediately, no fade-out needed
  if (liveWithdrawQueue.length > 1) {
    liveWithdrawTimer = setInterval(() => {
      liveWithdrawIndex = (liveWithdrawIndex + 1) % liveWithdrawQueue.length;
      renderLiveWithdrawItem(false);
    }, LIVE_WITHDRAW_ROTATE_MS);
  }
}

function stopLiveWithdrawTicker() {
  if (liveWithdrawTimer) {
    clearInterval(liveWithdrawTimer);
    liveWithdrawTimer = null;
  }
}

function renderLiveWithdrawItem(isFirst) {
  const list = document.getElementById('liveWithdrawList');
  const w = liveWithdrawQueue[liveWithdrawIndex];
  if (!w) return;

  const buildEl = () => {
    const el = document.createElement('div');
    el.className = 'live-item ticker-enter';
    el.innerHTML = `
      <div class="live-avatar">${escapeHtml(w.name.charAt(0))}</div>
      <div>
        <div class="live-name">${escapeHtml(w.name)}</div>
        <div class="live-meta">${w.method === 'bkash' ? 'bKash' : 'Nagad'} • ${timeAgo(w.time)}</div>
      </div>
      <div class="live-amount">+৳${w.amount}</div>
    `;
    return el;
  };

  if (isFirst || !list.firstElementChild) {
    list.innerHTML = '';
    const el = buildEl();
    list.appendChild(el);
    requestAnimationFrame(() => el.classList.add('ticker-enter-active'));
    return;
  }

  // fade + slide the current name out, then swap in the next one
  const current = list.firstElementChild;
  current.classList.add('ticker-exit');
  setTimeout(() => {
    list.innerHTML = '';
    const el = buildEl();
    list.appendChild(el);
    requestAnimationFrame(() => el.classList.add('ticker-enter-active'));
  }, 300);
}

async function loadHistory() {
  try {
    const qs = new URLSearchParams({ initData });
    const data = await api('/api/withdraw?' + qs.toString());
    const list = document.getElementById('historyList');
    if (!data.history.length) {
      list.innerHTML = `<div class="empty-state">এখনো কোনো উইথড্র রিকুয়েস্ট নেই</div>`;
      return;
    }
    const statusText = { pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED' };
    list.innerHTML = data.history.map(w => `
      <div class="history-item">
        <div class="live-avatar">${w.method === 'bkash' ? '💗' : '🧡'}</div>
        <div>
          <div class="live-name">${w.method === 'bkash' ? 'bKash' : 'Nagad'} • ৳${w.amount}</div>
          <div class="live-meta">${timeAgo(w.createdAt)}</div>
        </div>
        <span class="history-status ${w.status}">${statusText[w.status]}</span>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

function timeAgo(dateStr) {
  const diff = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'এইমাত্র';
  if (diff < 3600) return `${Math.floor(diff/60)} মিনিট আগে`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ঘন্টা আগে`;
  return `${Math.floor(diff/86400)} দিন আগে`;
}

// ---------- notifications (bell icon) ----------
// Checks for a new admin broadcast and shows/hides the green dot on the
// bell. Doesn't mark anything as seen — that only happens once the user
// actually opens the panel.
async function checkNotifications() {
  try {
    const qs = new URLSearchParams({ initData });
    const data = await api('/api/notifications?' + qs.toString());
    document.getElementById('bellDot').style.display = data.hasUnread ? 'block' : 'none';
  } catch (e) { console.error(e); }
}

async function loadNotifications() {
  const list = document.getElementById('notifList');
  try {
    const qs = new URLSearchParams({ initData });
    const data = await api('/api/notifications?' + qs.toString());
    if (!data.notifications.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">🔔</div>
          <div>কোনো notification নেই</div>
        </div>`;
      return;
    }
    list.innerHTML = data.notifications.map(n => `
      <div class="notif-item">
        <div>${escapeHtml(n.message)}</div>
        <div class="notif-item-time">${timeAgo(n.createdAt)}</div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

document.getElementById('bellBtn').addEventListener('click', async () => {
  document.getElementById('notifOverlay').classList.add('show');
  document.getElementById('bellDot').style.display = 'none';
  await loadNotifications();
  try {
    await api('/api/notifications', { method: 'POST', body: { initData, action: 'mark_seen' } });
  } catch (e) { console.error(e); }
});

document.getElementById('notifCloseBtn').addEventListener('click', () => {
  document.getElementById('notifOverlay').classList.remove('show');
});

document.getElementById('notifOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'notifOverlay') {
    document.getElementById('notifOverlay').classList.remove('show');
  }
});

// ---------- init ----------
loadUser();
checkNotifications();
