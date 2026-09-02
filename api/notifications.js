const { connectToDatabase } = require('./_db');
const { verifyInitData } = require('./_utils');

// In-app notifications shown from the bell icon — separate from the
// Telegram DM broadcast, so the user sees it inside the app too (with a
// green "unread" dot on the bell) even if they never open Telegram itself.
module.exports = async (req, res) => {
  try {
    const db = await connectToDatabase();

    if (req.method === 'GET') {
      const { initData } = req.query;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      const user = await db.collection('users').findOne({ telegramId: tgUser.id });
      const lastSeen = (user && user.lastSeenNotificationAt) || new Date(0);

      const notifications = await db.collection('notifications')
        .find({})
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray();

      const hasUnread = notifications.some(n => new Date(n.createdAt) > new Date(lastSeen));

      return res.status(200).json({
        notifications: notifications.map(n => ({ message: n.message, createdAt: n.createdAt })),
        hasUnread
      });
    }

    if (req.method === 'POST') {
      const { initData, action } = req.body;
      const tgUser = verifyInitData(initData);
      if (!tgUser) return res.status(401).json({ error: 'Invalid Telegram data' });

      // Called right when the user opens the notifications panel, so the
      // green dot clears and won't reappear until a newer broadcast comes in.
      if (action === 'mark_seen') {
        await db.collection('users').updateOne(
          { telegramId: tgUser.id },
          { $set: { lastSeenNotificationAt: new Date() } }
        );
        return res.status(200).json({ success: true });
      }
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
