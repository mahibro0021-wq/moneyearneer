const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const initData = tg?.initData || '';

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

// ---------- access gate ----------
(async function init() {
  try {
    const qs = new URLSearchParams({ initData, action: 'check' });
    await api('/api/admin?' + qs.toString());
    document.getElementById('app').style.display = 'block';
    document.getElementById('lockScreen').style.display = 'none';
    loadTasks();
    loadWithdraws('pending');
  } catch (e) {
    document.getElementById('lockScreen').style.display = 'block';
  }
})();

// ---------- section tabs ----------
document.getElementById('mainAdminTabs').querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('mainAdminTabs').querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('s-' + btn.dataset.s).classList.add('active');
    if (btn.dataset.s === 'activations') loadActivations('pending');
    if (btn.dataset.s === 'deposits') loadDeposits('pending');
    if (btn.dataset.s === 'allusers') loadAllUsers();
    if (btn.dataset.s === 'settings') loadSettings();
  });
});

// ---------- tasks ----------
document.getElementById('createTaskBtn').addEventListener('click', async () => {
  const title = document.getElementById('taskTitle').value.trim();
  const description = document.getElementById('taskDesc').value.trim();
  const link = document.getElementById('taskLink').value.trim();
  const channelUsername = document.getElementById('taskChannel').value.trim();
  const reward = document.getElementById('taskReward').value;
  const type = document.getElementById('taskType').value;

  if (!title || !link || !reward) { toast('সব ফিল্ড পূরণ করুন', 'error'); return; }

  try {
    await api('/api/admin', { method: 'POST', body: { initData, action: 'create_task', title, description, link, channelUsername, reward, type } });
    toast('✅ Task যোগ হয়েছে', 'success');
    ['taskTitle','taskDesc','taskLink','taskChannel','taskReward'].forEach(id => document.getElementById(id).value = '');
    loadTasks();
  } catch (e) {
    toast('Task যোগ করা যায়নি', 'error');
  }
});

async function loadTasks() {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_tasks' });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('taskListAdmin');
    list.innerHTML = data.tasks.map(t => `
      <div class="task-row">
        <div class="row-line"><b>${escapeHtml(t.title)}</b><span>+৳${t.reward}</span></div>
        <div style="color:var(--text-muted)">${escapeHtml(t.description || '')}</div>
        <div style="color:var(--text-muted);margin-top:4px">Type: ${t.type} • ${t.active ? '🟢 Active' : '⚪ Disabled'}</div>
        <div class="row-actions">
          <button class="btn-toggle" data-id="${t._id}" data-active="${t.active}">${t.active ? 'Disable' : 'Enable'}</button>
          <button class="btn-reject" data-del="${t._id}">Delete</button>
        </div>
      </div>
    `).join('') || '<div class="empty-state">কোনো task নেই</div>';

    list.querySelectorAll('.btn-toggle').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin', { method: 'POST', body: { initData, action: 'toggle_task', taskId: b.dataset.id, active: b.dataset.active !== 'true' } });
      loadTasks();
    }));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      await api('/api/admin', { method: 'POST', body: { initData, action: 'delete_task', taskId: b.dataset.del } });
      loadTasks();
    }));
  } catch (e) { console.error(e); }
}

// ---------- withdraws ----------
document.getElementById('withdrawSubTabs').querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('withdrawSubTabs').querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadWithdraws(btn.dataset.wstatus);
  });
});

async function loadWithdraws(status) {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_withdraws', status });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('withdrawListAdmin');
    list.innerHTML = data.withdraws.map(w => `
      <div class="withdraw-row">
        <div class="row-line"><b>${escapeHtml(w.displayName)}</b><span>৳${w.amount}</span></div>
        <div style="color:var(--text-muted)">${w.method.toUpperCase()} • ${escapeHtml(w.accountNumber)}</div>
        <div style="color:var(--text-muted)">UID: ${w.telegramId}</div>
        ${status === 'pending' ? `
          <div class="row-actions">
            <button class="btn-approve" data-approve="${w._id}">Approve</button>
            <button class="btn-reject" data-reject="${w._id}">Reject</button>
          </div>` : ''}
      </div>
    `).join('') || '<div class="empty-state">কিছু নেই</div>';

    list.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin', { method: 'POST', body: { initData, action: 'approve_withdraw', withdrawId: b.dataset.approve } });
      toast('✅ Approved', 'success');
      loadWithdraws('pending');
    }));
    list.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const reason = prompt('Reject reason (optional):') || '';
      await api('/api/admin', { method: 'POST', body: { initData, action: 'reject_withdraw', withdrawId: b.dataset.reject, reason } });
      toast('❌ Rejected', 'success');
      loadWithdraws('pending');
    }));
  } catch (e) { console.error(e); }
}

// ---------- account activations (withdraw security gate) ----------
document.getElementById('activationSubTabs').querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('activationSubTabs').querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadActivations(btn.dataset.astatus);
  });
});

async function loadActivations(status) {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_activations', status });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('activationListAdmin');
    list.innerHTML = data.activations.map(a => `
      <div class="withdraw-row">
        <div class="row-line"><b>${escapeHtml(a.displayName)}</b><span>${status.toUpperCase()}</span></div>
        <div style="color:var(--text-muted)">Telegram Username: @${escapeHtml(a.telegramUsername || '-')}</div>
        <div style="color:var(--text-muted)">TGID Submitted: ${escapeHtml(String(a.telegramIdSubmitted || '-'))}</div>
        <div style="color:var(--text-muted)">UID: ${a.telegramId}</div>
        ${status === 'pending' ? `
          <div class="row-actions">
            <button class="btn-approve" data-approve="${a._id}">Approve</button>
            <button class="btn-reject" data-reject="${a._id}">Reject</button>
          </div>` : ''}
      </div>
    `).join('') || '<div class="empty-state">কিছু নেই</div>';

    list.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api('/api/admin', { method: 'POST', body: { initData, action: 'approve_activation', activationId: b.dataset.approve } });
        toast('✅ Activation Approved', 'success');
        loadActivations('pending');
      } catch (e) { toast('করা যায়নি', 'error'); }
    }));
    list.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const reason = prompt('Reject reason (optional):') || '';
      try {
        await api('/api/admin', { method: 'POST', body: { initData, action: 'reject_activation', activationId: b.dataset.reject, reason } });
        toast('❌ Rejected', 'success');
        loadActivations('pending');
      } catch (e) { toast('করা যায়নি', 'error'); }
    }));
  } catch (e) { console.error(e); }
}

// ---------- deposits ----------
document.getElementById('depositSubTabs').querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('depositSubTabs').querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadDeposits(btn.dataset.dstatus);
  });
});

async function loadDeposits(status) {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_deposits', status });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('depositListAdmin');
    list.innerHTML = data.deposits.map(d => `
      <div class="withdraw-row">
        <div class="row-line"><b>${escapeHtml(d.displayName)}</b><span>৳${d.amount}</span></div>
        <div style="color:var(--text-muted)">${d.method.toUpperCase()} • Sender: ${escapeHtml(d.senderNumber)}</div>
        <div style="color:var(--text-muted)">Transaction ID: ${escapeHtml(d.transactionId)}</div>
        <div style="color:var(--text-muted)">UID: ${d.telegramId}</div>
        ${status === 'pending' ? `
          <div class="row-actions">
            <button class="btn-approve" data-approve="${d._id}">Approve</button>
            <button class="btn-reject" data-reject="${d._id}">Reject</button>
          </div>` : ''}
      </div>
    `).join('') || '<div class="empty-state">কিছু নেই</div>';

    list.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api('/api/admin', { method: 'POST', body: { initData, action: 'approve_deposit', depositId: b.dataset.approve } });
        toast('✅ Deposit Approved', 'success');
        loadDeposits('pending');
      } catch (e) { toast('করা যায়নি', 'error'); }
    }));
    list.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => {
      const reason = prompt('Reject reason (optional):') || '';
      try {
        await api('/api/admin', { method: 'POST', body: { initData, action: 'reject_deposit', depositId: b.dataset.reject, reason } });
        toast('❌ Rejected', 'success');
        loadDeposits('pending');
      } catch (e) { toast('করা যায়নি', 'error'); }
    }));
  } catch (e) { console.error(e); }
}

// ---------- users ----------
document.getElementById('userSearchBtn').addEventListener('click', async () => {
  const q = document.getElementById('userSearchInput').value.trim();
  if (!q) return;
  try {
    const qs = new URLSearchParams({ initData, action: 'search_user', q });
    const data = await api('/api/admin?' + qs.toString());
    const u = data.user;
    document.getElementById('userResult').innerHTML = `
      <div class="task-row">
        <div class="row-line"><b>${escapeHtml(u.firstName || '')} ${escapeHtml(u.lastName || '')}</b><span>UID: ${u.telegramId}</span></div>
        <div>Username: @${escapeHtml(u.username || 'নেই')}</div>
        <div>Balance: ৳${Number(u.balance).toFixed(2)}</div>
        <div>Ads watched (total): ${u.adsWatchedTotal || 0}</div>
        <div>Referrals: ${u.referralsCount || 0}</div>
        <div>Account Active: ${u.accountActive ? '✅ হ্যাঁ' : '❌ না'}</div>
        <div>Deposit করেছে: ${u.hasDeposited ? '✅ হ্যাঁ' : '❌ না'}</div>
        <div>Withdrawals approved: ${data.withdrawCount} (মোট ৳${data.totalPaid})</div>
        <div class="field-label" style="margin-top:10px">Balance +/- করুন</div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <input class="admin-input" type="number" id="adjustAmountInput" placeholder="যেমন: 100 বা -50" style="flex:1">
          <button class="btn-toggle" id="adjustBalanceBtn" data-uid="${u.telegramId}" style="white-space:nowrap;padding:0 14px;border-radius:8px">Apply</button>
        </div>
      </div>
    `;
    document.getElementById('adjustBalanceBtn').addEventListener('click', async () => {
      const amount = document.getElementById('adjustAmountInput').value;
      if (!amount || Number(amount) === 0) { toast('একটি amount দিন', 'error'); return; }
      if (!confirm(`${amount > 0 ? '+' : ''}${amount} টাকা balance-এ apply করবেন?`)) return;
      try {
        await api('/api/admin', { method: 'POST', body: { initData, action: 'adjust_balance', telegramId: u.telegramId, amount } });
        toast('✅ Balance আপডেট হয়েছে', 'success');
        document.getElementById('userSearchBtn').click();
      } catch (e) {
        toast('Balance আপডেট করা যায়নি', 'error');
      }
    });
  } catch (e) {
    document.getElementById('userResult').innerHTML = `<div class="empty-state">ইউজার পাওয়া যায়নি</div>`;
  }
});

// ---------- all users ----------
async function loadAllUsers() {
  try {
    const qs = new URLSearchParams({ initData, action: 'list_users' });
    const data = await api('/api/admin?' + qs.toString());
    const list = document.getElementById('allUsersList');
    list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;margin-bottom:10px">মোট ${data.users.length} জন ইউজার</div>` + (data.users.map(u => `
      <div class="task-row">
        <div class="row-line"><b>${escapeHtml(u.firstName || '')} ${escapeHtml(u.lastName || '')}</b><span>৳${Number(u.balance || 0).toFixed(2)}</span></div>
        <div style="color:var(--text-muted)">UID: ${u.telegramId} ${u.username ? '• @' + escapeHtml(u.username) : ''}</div>
        <div style="color:var(--text-muted)">Referrals: ${u.referralsCount || 0}</div>
      </div>
    `).join('') || '<div class="empty-state">কোনো ইউজার নেই</div>');
  } catch (e) { console.error(e); }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ---------- settings (editable "Please Fill Up" notice text) ----------
async function loadSettings() {
  try {
    const qs = new URLSearchParams({ initData, action: 'get_settings' });
    const data = await api('/api/admin?' + qs.toString());
    document.getElementById('settingsTextNormal').value = data.settings.textNormal;
    document.getElementById('settingsTextWarning').value = data.settings.textWarning;
    document.getElementById('settingsActiveVariant').value = data.settings.activeVariant;
    document.getElementById('settingsCopyButtonText').value = data.settings.copyButtonText;
    document.getElementById('settingsUsernamePlaceholder').value = data.settings.usernamePlaceholder;
    document.getElementById('settingsTgidPlaceholder').value = data.settings.tgidPlaceholder;
  } catch (e) { console.error(e); }
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const textNormal = document.getElementById('settingsTextNormal').value.trim();
  const textWarning = document.getElementById('settingsTextWarning').value.trim();
  const activeVariant = document.getElementById('settingsActiveVariant').value;
  const copyButtonText = document.getElementById('settingsCopyButtonText').value.trim();
  const usernamePlaceholder = document.getElementById('settingsUsernamePlaceholder').value.trim();
  const tgidPlaceholder = document.getElementById('settingsTgidPlaceholder').value.trim();

  if (!textNormal || !textWarning || !copyButtonText || !usernamePlaceholder || !tgidPlaceholder) {
    toast('সবগুলো টেক্সট পূরণ করুন', 'error'); return;
  }

  try {
    await api('/api/admin', { method: 'POST', body: { initData, action: 'update_settings', textNormal, textWarning, activeVariant, copyButtonText, usernamePlaceholder, tgidPlaceholder } });
    toast('✅ Settings Saved', 'success');
  } catch (e) {
    toast('Save করা যায়নি', 'error');
  }
});

// ---------- broadcast (send a message to every user via the bot) ----------
document.getElementById('sendBroadcastBtn').addEventListener('click', async () => {
  const message = document.getElementById('broadcastMessage').value.trim();
  const resultEl = document.getElementById('broadcastResult');
  if (!message) { toast('একটি Message লিখুন', 'error'); return; }
  if (!confirm('সব ইউজারকে এই Message পাঠাতে চান?')) return;

  const btn = document.getElementById('sendBroadcastBtn');
  btn.disabled = true;
  btn.textContent = '📤 পাঠানো হচ্ছে...';
  resultEl.textContent = '';

  try {
    const data = await api('/api/admin', { method: 'POST', body: { initData, action: 'broadcast', message } });
    toast('✅ Broadcast পাঠানো হয়েছে', 'success');
    resultEl.textContent = `মোট ${data.total} জন ইউজারকে পাঠানো হয়েছে।`;
    document.getElementById('broadcastMessage').value = '';
  } catch (e) {
    toast('Broadcast পাঠানো যায়নি', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📢 সবাইকে পাঠান';
  }
});
