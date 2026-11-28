// The public face of @MockOnlineMaterials_bot (the teacher + student bot):
// profile photo, bio, description, command menu and, once /tg is live, the
// Mini App menu button. Everything here goes live the moment it runs; no deploy.
//
//   node scripts/teacher-bot-profile.mjs info
//   node scripts/teacher-bot-profile.mjs apply --dry-run
//   node scripts/teacher-bot-profile.mjs apply                 # texts + commands (+ photo if none)
//   node scripts/teacher-bot-profile.mjs apply --photo         # also replace the profile photo
//   node scripts/teacher-bot-profile.mjs apply --miniapp       # also set the "MockOnline" Mini App menu button
//
// TELEGRAM_TEACHER_BOT_TOKEN lives in .env.local only, so this defaults to --env=local.
// The token is never printed (it is embedded in error text Telegram returns).
//
// Not settable through the Bot API (BotFather only): the empty-chat description
// picture (public/brand/bot-banner.jpg) and the profile's main Mini App ("Open App").

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv.some((a) => a.startsWith("--env=")) && !process.env.IELTS_ENV) process.env.IELTS_ENV = "local";
const { loadEnv } = await import("./env.mjs");
loadEnv({ requireServiceRole: false });

const token = process.env.TELEGRAM_TEACHER_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_TEACHER_BOT_TOKEN is not set in the env file you targeted.");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://mockonline.uz";
const redact = (s) => String(s).split(token).join("<TOKEN>");

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith("--")) || "info";
const DRY = args.includes("--dry-run");
const FORCE_PHOTO = args.includes("--photo");
const MINIAPP = args.includes("--miniapp");

// ---------------------------------------------------------------------------
// The words. "" = the default (every language without its own), "uz" = Uzbek.
// ---------------------------------------------------------------------------

const SHORT = {
  "": "Daily IELTS Reading test, picked for your weak spots. Real computer-exam format. mockonline.uz",
  uz: "Har kuni IELTS Reading testi, zaif tomoningizga moslab. Haqiqiy kompyuter imtihoni formati. mockonline.uz",
};

const LAST_LINE = {
  "": MINIAPP ? "Press Start, then tap MockOnline to open the site, already signed in." : "Press Start to begin.",
  uz: MINIAPP ? "Start tugmasini bosing, soʻng MockOnline tugmasi orqali saytga kiring." : "Boshlash uchun Start tugmasini bosing.",
};

const DESCRIPTION = {
  "": [
    "MockOnline: IELTS practice in your pocket.",
    "",
    "📚 A reading test every morning, picked for your weakest question type",
    "🎯 The real computer-delivered IELTS format",
    "⚡ An instant band score and a full answer review",
    "📄 Teachers on Ultima: any test as a PDF, with the answers",
    "",
    LAST_LINE[""],
  ].join("\n"),
  uz: [
    "MockOnline: IELTS tayyorgarligi doim yoningizda.",
    "",
    "📚 Har kuni ertalab bitta Reading testi, eng zaif savol turingizga moslab tanlanadi",
    "🎯 Haqiqiy kompyuterdagi IELTS formati",
    "⚡ Darhol band ball va javoblar tahlili",
    "📄 Ultima tarifidagi oʻqituvchilar uchun: istalgan test PDF shaklida, javoblari bilan",
    "",
    LAST_LINE.uz,
  ].join("\n"),
};

const COMMANDS = {
  "": [
    ["start", "Main menu"],
    ["test", "Get a test now"],
    ["daily", "Turn the daily test on"],
    ["stop", "Pause the daily test"],
    ["help", "How the bot works"],
  ],
  uz: [
    ["start", "Bosh menyu"],
    ["test", "Hozir test olish"],
    ["daily", "Kundalik testni yoqish"],
    ["stop", "Kundalik testni toʻxtatish"],
    ["help", "Bot qanday ishlaydi"],
  ],
};

const MENU_BUTTON = { type: "web_app", text: "MockOnline", web_app: { url: `${SITE}/tg` } };

// Telegram's own limits, checked here so a too-long text fails loudly instead of being cut.
for (const [lang, s] of Object.entries(SHORT)) if ([...s].length > 120) throw new Error(`short description "${lang}" > 120`);
for (const [lang, s] of Object.entries(DESCRIPTION)) if ([...s].length > 512) throw new Error(`description "${lang}" > 512`);

// ---------------------------------------------------------------------------

async function api(method, body) {
  const init =
    body instanceof FormData
      ? { method: "POST", body }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, init);
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) throw new Error(`${method}: ${redact(data.description)}`);
  return data.result;
}

const langs = (o) => Object.keys(o);
const withLang = (lang, body) => (lang ? { ...body, language_code: lang } : body);
const label = (lang) => (lang ? lang : "default");

async function info() {
  const me = await api("getMe");
  console.log(`bot           @${me.username} (${me.first_name}), main mini app: ${me.has_main_web_app ? "yes" : "no"}`);
  const photos = await api("getUserProfilePhotos", { user_id: me.id, limit: 1 });
  console.log(`photos        ${photos.total_count}`);
  for (const lang of langs(SHORT)) {
    const s = await api("getMyShortDescription", withLang(lang, {}));
    const d = await api("getMyDescription", withLang(lang, {}));
    const c = await api("getMyCommands", withLang(lang, {}));
    console.log(`\n[${label(lang)}]`);
    console.log(`short         ${s.short_description || "(empty)"}`);
    console.log(`description   ${(d.description || "(empty)").replace(/\n/g, "\n              ")}`);
    console.log(`commands      ${c.map((x) => `/${x.command} - ${x.description}`).join("\n              ") || "(none)"}`);
  }
  const mb = await api("getChatMenuButton", {});
  console.log(`\nmenu button   ${mb.type}${mb.web_app ? ` "${mb.text}" -> ${mb.web_app.url}` : ""}`);
  return me;
}

async function apply() {
  const me = await api("getMe");
  const step = async (what, fn) => {
    if (DRY) return console.log(`would set     ${what}`);
    await fn();
    console.log(`set           ${what}`);
  };

  for (const lang of langs(SHORT)) {
    await step(`short description [${label(lang)}]`, () =>
      api("setMyShortDescription", withLang(lang, { short_description: SHORT[lang] })));
    await step(`description [${label(lang)}]`, () =>
      api("setMyDescription", withLang(lang, { description: DESCRIPTION[lang] })));
    await step(`commands [${label(lang)}]`, () =>
      api("setMyCommands", withLang(lang, {
        commands: COMMANDS[lang].map(([command, description]) => ({ command, description })),
      })));
  }

  // A profile photo upload ADDS a photo, so only do it when there is none or on --photo.
  const photos = await api("getUserProfilePhotos", { user_id: me.id, limit: 1 });
  if (photos.total_count === 0 || FORCE_PHOTO) {
    await step("profile photo (public/brand/bot-avatar.jpg)", async () => {
      const form = new FormData();
      form.set("photo", JSON.stringify({ type: "static", photo: "attach://avatar" }));
      form.set("avatar", new Blob([readFileSync(join(root, "public/brand/bot-avatar.jpg"))], { type: "image/jpeg" }), "avatar.jpg");
      await api("setMyProfilePhoto", form);
    });
  } else {
    console.log("kept          profile photo (already set; pass --photo to replace)");
  }

  if (MINIAPP) {
    await step(`menu button -> ${MENU_BUTTON.web_app.url}`, () => api("setChatMenuButton", { menu_button: MENU_BUTTON }));
  } else {
    console.log("skipped       Mini App menu button (pass --miniapp once /tg is live on mockonline.uz)");
  }
}

try {
  if (cmd === "info") await info();
  else if (cmd === "apply") await apply();
  else {
    console.error(`Unknown command "${cmd}". Use: info | apply [--dry-run] [--photo] [--miniapp]`);
    process.exit(1);
  }
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : e));
  process.exit(1);
}
