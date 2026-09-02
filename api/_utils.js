const crypto = require('crypto');

// initData is considered stale (and rejected) past this age. Telegram
// regenerates initData fresh every time the Mini App is opened, so a
// legitimate user is always well inside this window. This exists purely
// to stop an *old* initData value from being replayed forever if it ever
// leaks (e.g. through server logs, since it's sent as a URL query param
// on GET requests) — without this check, a leaked value never expires.
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

// Verifies Telegram WebApp initData signature and returns the parsed user object,
// or null if the data is missing/invalid/tampered/expired.
function verifyInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const pairs = [];
    for (const [key, value] of params.entries()) {
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // Constant-time comparison — a plain !== comparison leaks timing
    // information that could theoretically help an attacker guess the hash.
    const hashBuf = Buffer.from(hash, 'hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    if (hashBuf.length !== computedBuf.length || !crypto.timingSafeEqual(hashBuf, computedBuf)) {
      return null;
    }

    const authDate = Number(params.get('auth_date'));
    if (!authDate || (Date.now() / 1000 - authDate) > INIT_DATA_MAX_AGE_SECONDS) {
      return null;
    }

    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    console.error('verifyInitData error', e);
    return null;
  }
}

// Admin IDs come ONLY from the ADMIN_TELEGRAM_ID env var (comma-separated,
// e.g. "111111111"). There is intentionally NO hardcoded fallback list —
// a hardcoded fallback means anyone who ever sees this source file (a
// template, a GitHub repo, an AI chat export) gets a permanent backdoor
// into every deployment that forgets to set the env var. If the env var
// isn't set, admin access is closed for everyone rather than silently
// open to whoever's ID happens to be baked into the code.
function getAdminIds() {
  if (!process.env.ADMIN_TELEGRAM_ID) return [];
  return process.env.ADMIN_TELEGRAM_ID.split(',').map(id => id.trim()).filter(Boolean);
}

function isAdmin(telegramId) {
  return getAdminIds().includes(String(telegramId));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Account-activation auto-approve (withdraw security gate) ----------
// If the admin doesn't manually approve/reject an activation submission
// within this window, it approves itself so a genuine user is never stuck
// waiting forever. The admin can still catch fraud on the *next* withdraw
// review — this window only unlocks the withdraw form, it isn't the final
// say on the money itself.
const ACTIVATION_AUTO_APPROVE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function autoApproveExpiredActivations(db) {
  const cutoff = new Date(Date.now() - ACTIVATION_AUTO_APPROVE_MS);
  const expired = await db.collection('activation_requests')
    .find({ status: 'pending', createdAt: { $lte: cutoff } })
    .toArray();

  for (const a of expired) {
    await db.collection('activation_requests').updateOne(
      { _id: a._id, status: 'pending' },
      { $set: { status: 'approved', approvedAt: new Date(), autoApproved: true } }
    );
    await db.collection('users').updateOne(
      { telegramId: a.telegramId },
      { $set: { accountActive: true } }
    );
  }
  return expired.length;
}

// ---------- Configurable activation notice text (admin-editable, 2 variants)
// + the copy-button label (also admin-editable). The button no longer
// copies the user's real Telegram info — clicking it just copies its own
// label text, so it reads as a normal "copy" action without actually
// handing out real account data. ----------
const DEFAULT_ACTIVATION_TEXTS = {
  normal: 'নিচে আপনার সঠিক Telegram Username ও UID (TGID) লিখে Submit করুন। Admin Approve করলেই Withdraw সম্পন্ন হবে। Approve না হলেও ২৪ ঘণ্টা পর এটি automatically সম্পন্ন হয়ে যাবে।',
  warning: '⚠️ সতর্কতা: ভুয়া তথ্য বা একাধিক অ্যাকাউন্ট ব্যবহার করলে আপনার Withdraw স্থায়ীভাবে বাতিল ও অ্যাকাউন্ট ব্লক করা হবে। সঠিক তথ্য দিয়েই Submit করুন।',
  copyButtonText: '📋 আমার Username ও UID কপি করুন',
  usernamePlaceholder: 'Telegram Username (Paste করুন)',
  tgidPlaceholder: 'Telegram ID / UID (Paste করুন)'
};

async function getActivationSettings(db) {
  const s = await db.collection('settings').findOne({ key: 'activation_notice' });
  if (!s) {
    return {
      textNormal: DEFAULT_ACTIVATION_TEXTS.normal,
      textWarning: DEFAULT_ACTIVATION_TEXTS.warning,
      activeVariant: 'normal',
      copyButtonText: DEFAULT_ACTIVATION_TEXTS.copyButtonText,
      usernamePlaceholder: DEFAULT_ACTIVATION_TEXTS.usernamePlaceholder,
      tgidPlaceholder: DEFAULT_ACTIVATION_TEXTS.tgidPlaceholder
    };
  }
  return {
    textNormal: s.textNormal || DEFAULT_ACTIVATION_TEXTS.normal,
    textWarning: s.textWarning || DEFAULT_ACTIVATION_TEXTS.warning,
    activeVariant: s.activeVariant === 'warning' ? 'warning' : 'normal',
    copyButtonText: s.copyButtonText || DEFAULT_ACTIVATION_TEXTS.copyButtonText,
    usernamePlaceholder: s.usernamePlaceholder || DEFAULT_ACTIVATION_TEXTS.usernamePlaceholder,
    tgidPlaceholder: s.tgidPlaceholder || DEFAULT_ACTIVATION_TEXTS.tgidPlaceholder
  };
}

module.exports = {
  verifyInitData, isAdmin, getAdminIds, todayStr,
  autoApproveExpiredActivations, getActivationSettings, DEFAULT_ACTIVATION_TEXTS
};
