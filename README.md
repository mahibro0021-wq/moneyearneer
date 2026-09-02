# Daily Money — Telegram Mini App

Ad-earning + referral + withdraw Telegram Mini App (bKash/Nagad), with an
admin panel restricted to your Telegram account only.

## ⚠️ Secrets — never commit these

`BOT_TOKEN`, `MONGODB_URI`, and `ADMIN_TELEGRAM_ID` must **only** ever live
in Vercel's Environment Variables (Project → Settings → Environment
Variables) — never in this README, never in any file committed to Git.
A previous version of this README had a real token and DB connection
string written directly in it; GitHub's secret scanning caught it as a
public leak. If you ever paste a real secret into a file, git history
still holds it even after you edit the file again — treat the secret as
burned, rotate it, and consider starting the repo fresh instead of trying
to scrub history.

This repo's `.gitignore` excludes `.env*` files for the same reason —
use a local `.env` file (never committed) for local testing if needed.

## 1. Deploy

1. এই ফোল্ডারটা একটা নতুন GitHub repo-তে push করুন।
2. Vercel-এ গিয়ে "Import Project" করে ওই repo সিলেক্ট করুন → Deploy।
3. Deploy হওয়ার পর আপনার লিংক পাবেন, যেমন: `https://your-project.vercel.app`

## 2. Environment Variables (Vercel → Project → Settings → Environment Variables)

Set these directly in the Vercel dashboard — **do not** write real values
anywhere in the repo:

```
BOT_TOKEN=<your bot token from @BotFather>
BOT_USERNAME=<your bot's username, e.g. moneyearn12131_bot>
ADMIN_TELEGRAM_ID=<your numeric Telegram user ID>
MONGODB_URI=<your MongoDB Atlas connection string, with your real password>
APP_URL=https://your-project.vercel.app
TELEGRAM_WEBHOOK_SECRET=<optional — any random string, see step 3>
```

`ADMIN_TELEGRAM_ID` can be a comma-separated list if more than one person
needs admin access (e.g. `111111111,222222222`). There is **no
hardcoded fallback admin list in the code** — if this env var is unset,
admin access is closed to everyone, not silently open to anyone.

Env var বসানোর পর Vercel-এ **Redeploy** করতে হবে।

## 3. Telegram Bot সেটআপ (@BotFather)

1. `/setmenubutton` → আপনার bot সিলেক্ট করুন → button text: `💰 Open App`,
   URL: `https://your-project.vercel.app`
2. Webhook সেট করুন (bot.js-কে কল করার জন্য), browser-এ এই URL খুলুন
   (একবারই লাগবে) — `TELEGRAM_WEBHOOK_SECRET` সেট করা থাকলে সেটাও যোগ করুন,
   এতে অন্য কেউ আপনার bot এর URL এ ভুয়া request পাঠাতে পারবে না:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://your-project.vercel.app/api/bot&secret_token=<TELEGRAM_WEBHOOK_SECRET>
   ```
3. Verified social task-এর জন্য বটকে আপনার channel/group-এ **Admin** বানিয়ে
   রাখুন (getChatMember কল করতে হয়, তাই লাগবে)।

## 4. Ad Network যুক্ত করা

`public/index.html`-এ আপনার ad network-এর (Monetag / Adsgram / GigaPub /
Adexium) SDK script tag যোগ করুন, এবং `public/app.js`-এর `showAd()`
ফাংশনে সেই SDK-এর reward callback বসান। শুধু সেই callback-এই
`/api/earn` কল হয় — মানে ad পুরোপুরি/রিওয়ার্ডেড ভাবে না দেখলে টাকা যোগ
হবে না।

## 5. Admin Panel

`https://your-project.vercel.app/admin.html` — কিন্তু এটা **শুধু Telegram
Mini App হিসেবে খুললেই কাজ করবে** (সরাসরি ব্রাউজারে খুললে "🔒 এই পেজটি
শুধুমাত্র অ্যাডমিন..." দেখাবে, কারণ অ্যাক্সেস Telegram-এর initData
verify করে + আপনার `ADMIN_TELEGRAM_ID`-এর সাথে মিলিয়ে দেওয়া হয়, কোনো
আলাদা password login নেই)।

সহজ উপায়: BotFather দিয়ে আরেকটা ছোট bot/menu button বানিয়ে সেটার URL
`.../admin.html` দিয়ে রাখুন — শুধু আপনি ছাড়া কেউ ঢুকতে পারবে না, যেই
Telegram দিয়ে ঢুকুক না কেন।

## 6. Security notes

- Secrets live only in Vercel env vars — never in code or README.
- `ADMIN_TELEGRAM_ID` has no hardcoded fallback; unset = admin panel closed.
- `initData` is rejected if older than 24 hours, so a leaked/logged value
  (e.g. from a request log) can't be replayed indefinitely.
- Set `TELEGRAM_WEBHOOK_SECRET` so `/api/bot` only accepts real Telegram
  webhook calls, not forged POSTs from anyone who finds the URL.
- If you ever suspect a token or DB password leaked, rotate it
  immediately: BotFather → `/revoke` for the bot token, MongoDB Atlas →
  Database Access → reset password for the DB user.

## 7. যা যা ইতিমধ্যে করা আছে

- Home / Task / Withdraw — ৩ ট্যাব, রেফারেন্স স্ক্রিনশটের মতো UI ও রঙ
- Rewarded ad: ৳10/ad, দৈনিক ১৭টা লিমিট, ১৭টা কমপ্লিট হলে +৳70 বোনাস claim
- Referral: প্রতি রেফারে সাথে সাথে ৳130, ১০ রেফারে +৳150 বোনাস claim
- Social task: normal (join+return) ও verified (আসল membership চেক) দুই
  টাইপ, সম্পূর্ণ admin panel থেকে control
- Withdraw: bKash/Nagad, ন্যূনতম ৳1000 উভয়ে, Live Withdraw (আসল approved
  withdraw থেকে, নাম masked), Withdraw History
- Admin panel: task তৈরি/enable-disable/delete, withdraw approve/reject
  (reject হলে balance ফেরত), user search

## এখনো যা আপনাকে করতে হবে

- Ad network account + SDK integration (কোন network(গুলো) ব্যবহার
  করবেন জানালে সেটাও বসিয়ে দিতে পারি)
- Social task-গুলো (আপনার আসল চ্যানেল লিংক) admin panel দিয়ে add করা
