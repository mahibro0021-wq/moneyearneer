const BOT_TOKEN = process.env.BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, extra = {}) {
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) {
    console.error('sendMessage failed', e);
  }
}

// Checks if a user is currently a member of a channel/group.
// channelRef should be like "@channelusername"
async function getChatMember(channelRef, userId) {
  try {
    const res = await fetch(`${TG_API}/getChatMember?chat_id=${encodeURIComponent(channelRef)}&user_id=${userId}`);
    const data = await res.json();
    if (!data.ok) return false;
    const status = data.result.status;
    return ['member', 'administrator', 'creator'].includes(status);
  } catch (e) {
    console.error('getChatMember failed', e);
    return false;
  }
}

module.exports = { sendMessage, getChatMember, TG_API };
