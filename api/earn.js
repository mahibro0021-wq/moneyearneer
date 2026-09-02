const { connectToDatabase } = require('./_db');
const { verifyInitData, todayStr } = require('./_utils');

const PER_AD_REWARD = 10;
const DAILY_AD_LIMIT = 17;
const AD_COMPLETE_BONUS = 70;
const REFERRAL_MILESTONE_BONUS = 150;
const REFERRAL_MILESTONE_COUNT = 10;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { initData, action } = req.body;
    const tgUser = verifyInitData(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

    const db = await connectToDatabase();
    const users = db.collection('users');
    const user = await users.findOne({ telegramId: tgUser.id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const today = todayStr();
    let adsWatchedToday = user.adsDate === today ? (user.adsWatchedToday || 0) : 0;

    if (action === 'watch_ad') {
      if (adsWatchedToday >= DAILY_AD_LIMIT) {
        return res.status(400).json({ error: 'daily_limit_reached' });
      }
      adsWatchedToday += 1;
      await users.updateOne(
        { telegramId: tgUser.id },
        {
          $set: { adsWatchedToday, adsDate: today },
          $inc: { balance: PER_AD_REWARD, adsWatchedTotal: 1 }
        }
      );
      return res.status(200).json({ success: true, reward: PER_AD_REWARD, adsWatchedToday });
    }

    if (action === 'claim_ad_bonus') {
      const alreadyClaimed = user.achievements?.ads17ClaimedDate === today;
      if (adsWatchedToday < DAILY_AD_LIMIT) {
        return res.status(400).json({ error: 'not_enough_ads' });
      }
      if (alreadyClaimed) {
        return res.status(400).json({ error: 'already_claimed' });
      }
      await users.updateOne(
        { telegramId: tgUser.id },
        { $inc: { balance: AD_COMPLETE_BONUS }, $set: { 'achievements.ads17ClaimedDate': today } }
      );
      return res.status(200).json({ success: true, reward: AD_COMPLETE_BONUS });
    }

    if (action === 'claim_referral_bonus') {
      if ((user.referralsCount || 0) < REFERRAL_MILESTONE_COUNT) {
        return res.status(400).json({ error: 'not_enough_referrals' });
      }
      if (user.achievements?.ref10Claimed) {
        return res.status(400).json({ error: 'already_claimed' });
      }
      await users.updateOne(
        { telegramId: tgUser.id },
        { $inc: { balance: REFERRAL_MILESTONE_BONUS }, $set: { 'achievements.ref10Claimed': true } }
      );
      return res.status(200).json({ success: true, reward: REFERRAL_MILESTONE_BONUS });
    }

    res.status(400).json({ error: 'unknown_action' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
