const { connectToDatabase } = require('./_db');
const { verifyInitData, todayStr } = require('./_utils');
const { sendMessage } = require('./_telegram');

module.exports = async (req, res) => {
  try {
    const initData = req.method === 'GET' ? req.query.initData : req.body?.initData;
    const startParam = req.method === 'GET' ? req.query.startParam : req.body?.startParam;
    const tgUser = verifyInitData(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

    const db = await connectToDatabase();
    const users = db.collection('users');
    let user = await users.findOne({ telegramId: tgUser.id });

    if (!user) {
      let referredBy = null;
      if (startParam && /^\d+$/.test(String(startParam)) && Number(startParam) !== tgUser.id) {
        referredBy = Number(startParam);
      }
      const newUser = {
        telegramId: tgUser.id,
        firstName: tgUser.first_name || '',
        lastName: tgUser.last_name || '',
        username: tgUser.username || '',
        photoUrl: tgUser.photo_url || '',
        balance: 20, // small welcome balance, matches reference app showing ৳20 for a fresh account
        adsWatchedToday: 0,
        adsWatchedTotal: 0,
        adsDate: todayStr(),
        referralsCount: 0,
        referredBy,
        achievements: { ref10Claimed: false, ads17ClaimedDate: null },
        createdAt: new Date()
      };
      await users.insertOne(newUser);
      user = newUser;

      if (referredBy) {
        const refUser = await users.findOne({ telegramId: referredBy });
        if (refUser) {
          await users.updateOne(
            { telegramId: referredBy },
            { $inc: { balance: 130, referralsCount: 1 } }
          );
          sendMessage(referredBy, `🎉 আপনার একজন নতুন বন্ধু জয়েন করেছে! আপনি পেয়েছেন ৳130 রেফার বোনাস।`);
        }
      }
    } else {
      const updates = {};
      if (user.adsDate !== todayStr()) {
        updates.adsWatchedToday = 0;
        updates.adsDate = todayStr();
        user.adsWatchedToday = 0;
        user.adsDate = todayStr();
      }
      if (tgUser.first_name) updates.firstName = tgUser.first_name;
      if (tgUser.last_name) updates.lastName = tgUser.last_name;
      if (tgUser.username) updates.username = tgUser.username;
      if (tgUser.photo_url) updates.photoUrl = tgUser.photo_url;
      if (Object.keys(updates).length) {
        await users.updateOne({ telegramId: tgUser.id }, { $set: updates });
      }
    }

    const botUsername = process.env.BOT_USERNAME || 'moneyearn12131_bot';
    // Mini App "startapp" deep link (BotFather short name set via /newapp).
    // Clicking this link opens the Mini App DIRECTLY — from anywhere
    // (chat list, browser, another app's share sheet, no prior bot
    // interaction needed) — and Telegram itself fills
    // initDataUnsafe.start_param with the value after "startapp=".
    // app.js already reads that on load, so referral tracking happens
    // automatically the instant the app opens, with no /start message
    // and no button click required.
    const miniAppShortName = process.env.MINIAPP_SHORT_NAME || 'earn';
    const referralLink = `https://t.me/${botUsername}/${miniAppShortName}?startapp=${user.telegramId}`;

    res.status(200).json({
      telegramId: user.telegramId,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || tgUser.username || 'User',
      photoUrl: user.photoUrl,
      balance: user.balance,
      adsWatchedToday: user.adsWatchedToday,
      adsWatchedTotal: user.adsWatchedTotal,
      referralsCount: user.referralsCount,
      referralLink,
      achievements: user.achievements || { ref10Claimed: false, ads17ClaimedDate: null },
      hasDeposited: !!user.hasDeposited
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
