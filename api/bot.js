const { sendMessage } = require('./_telegram');
const { isAdmin } = require('./_utils');

module.exports = async (req, res) => {
  try {
    // If TELEGRAM_WEBHOOK_SECRET is set, only accept requests carrying the
    // matching secret token header — this stops anyone who discovers this
    // URL from POSTing fake Telegram "updates" to it directly. Telegram
    // adds this header automatically once you set it via setWebhook (see
    // README). Left optional (skipped if unset) so nothing breaks before
    // you configure it.
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
      return res.status(401).json({ ok: false });
    }

    const update = req.body;
    const msg = update.message;

    if (msg && msg.text && msg.text.startsWith('/start')) {
      const appUrl = process.env.APP_URL;

      // Capture referral payload: Telegram sends "/start 123456" as the
      // message text when the user came from a
      // https://t.me/BotUsername?start=123456 referral link.
      const parts = msg.text.trim().split(/\s+/);
      const refPayload = parts.length > 1 ? parts[1] : '';

      // Forward it as a normal URL query param so app.js can read it
      // (this button is a plain web_app link, not a startapp deep link,
      // so Telegram won't put it into initDataUnsafe.start_param on its own).
      const finalUrl = refPayload
        ? `${appUrl}${appUrl.includes('?') ? '&' : '?'}ref=${encodeURIComponent(refPayload)}`
        : appUrl;

      await sendMessage(
        msg.chat.id,
        `স্বাগতম <b>প্রতিদিন টাকা</b> তে! 🎉\n\nবিজ্ঞাপন দেখে এবং বন্ধুদের রেফার করে প্রতিদিন টাকা আয় করুন।`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '💰 অ্যাপ চালু করুন', web_app: { url: finalUrl } }]]
          }
        }
      );
    }

    // Admin-only: opens the admin panel as a real Telegram Mini App,
    // so it gets valid initData (opening the plain URL in a normal
    // browser tab will NOT work — Telegram never sends initData there).
    if (msg && msg.text && msg.text.startsWith('/admin')) {
      if (!isAdmin(msg.from.id)) {
        await sendMessage(msg.chat.id, '🔒 এই কমান্ড শুধুমাত্র অ্যাডমিনের জন্য।');
        return res.status(200).json({ ok: true });
      }
      const appUrl = process.env.APP_URL;
      await sendMessage(
        msg.chat.id,
        '⚙️ Admin Panel',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '⚙️ Open Admin Panel', web_app: { url: `${appUrl}/admin.html` } }]]
          }
        }
      );
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(200).json({ ok: true });
  }
};
