// Every word @MockOnlineMaterials_bot says, in English and Uzbek, plus its keyboards.
//
// Pure and import-free (unit-tested without the @/ alias, like router.ts), and
// client-safe: the /tg Mini App page reads its own strings from here too.
//
// The language is the user's Telegram app language (`from.language_code`):
// anything starting "uz" gets Uzbek, everyone else English. Nothing is stored,
// so the 10:00 daily push (a cron with no update to read it from) stays English.

export type Lang = "en" | "uz";

export function pickLang(code: string | null | undefined): Lang {
  return typeof code === "string" && code.toLowerCase().startsWith("uz") ? "uz" : "en";
}

/** callback_data for the welcome buttons. Telegram caps it at 64 bytes. */
export const CB = { test: "m:test", help: "m:help" } as const;

/** The 🎉 message effect (private chats only). If Telegram ever rejects it, the send is retried without. */
export const EFFECT_CONFETTI = "5046509860389126442";

/** Structurally the same as InlineButton in types.ts (this file imports nothing). */
export type CopyButton = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
  style?: "primary" | "success" | "danger";
};

export const CHANNEL_URL = "https://t.me/ReadinMarathons";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The Mini App entry: /tg signs a linked student in, then goes to `next`. */
export function miniAppUrl(site: string, next: string): string {
  return `${site.replace(/\/+$/, "")}/tg?next=${encodeURIComponent(next)}`;
}

type Copy = {
  welcome: (firstName: string | null) => string;
  help: string;
  nudge: string;
  error: string;
  btn: {
    test: string;
    help: string;
    open: string;
    premium: string;
    channel: string;
    site: string;
    dashboard: string;
    startTest: string;
    seeUltima: string;
  };
  // Teacher PDFs
  pdfExpired: string;
  pdfUnlinked: string;
  pdfNotUltima: string;
  pdfNone: string;
  pdfLoadFailed: string;
  pdfSendFailed: string;
  // Student daily test
  linkExpired: string;
  connected: string;
  notLinked: string;
  paused: string;
  resumed: string;
  nothingLeft: string;
  // The /tg Mini App page
  tg: {
    signingIn: string;
    notLinkedTitle: string;
    notLinkedBody: string;
    linkThis: (name: string) => string;
    linked: string;
    signInEmail: string;
    openBrowser: string;
    adminTitle: string;
    adminBody: string;
    failedTitle: string;
    failedBody: string;
    tryAgain: string;
    webTitle: string;
    webBody: string;
  };
};

const EN: Copy = {
  welcome: (name) =>
    [
      `👋 <b>${name ? `Hi, ${esc(name)}!` : "Hi!"}</b>`,
      "I'm the MockOnline bot: IELTS practice in your pocket.",
      "",
      "📚 <b>Test now</b>: a reading test picked for your weakest question type",
      "🔔 <b>Daily test</b>: one every morning at 10:00 (/daily on, /stop off)",
      "🎯 <b>Open MockOnline</b>: the full site right here in Telegram",
      "",
      "👇 Choose below",
    ].join("\n"),
  help: [
    "<b>How MockOnline works</b>",
    "",
    "📚 /test: a reading test right now",
    "🔔 /daily: one test every morning at 10:00",
    "⏸ /stop: pause the morning test",
    "🎯 <b>MockOnline</b> button: the site inside Telegram, already signed in",
    "",
    "<b>Questions</b>",
    "<blockquote expandable><b>How do I connect my account?</b>",
    "Tap MockOnline, sign in, then tap <b>Connect Telegram</b>. You only do it once.",
    "",
    "<b>Is it free?</b>",
    "Free tests are always free, and you get 3 Premium tests free every week. Premium opens everything.",
    "",
    "<b>I'm a teacher. How do I get PDFs?</b>",
    "On the Ultima plan, open any test on the site and tap <b>Get a PDF</b>. It arrives here with the answers.</blockquote>",
  ].join("\n"),
  nudge: "I answer to buttons and commands. Pick one below 👇",
  error: "Something went wrong. Please try again in a minute.",
  btn: {
    test: "📚 Test now",
    help: "ℹ️ Help",
    open: "🎯 Open MockOnline",
    premium: "⭐ Premium",
    channel: "📢 Channel",
    site: "🌐 Open the site",
    dashboard: "🎯 Open my dashboard",
    startTest: "▶️ Start the test",
    seeUltima: "⭐ See Ultima",
  },
  pdfExpired: "That link has expired. Go back to the test page and press <b>Get a PDF</b> again.",
  pdfUnlinked:
    "I don't know which account this chat belongs to yet. Sign in on the site, open the test and press <b>Get a PDF</b>.",
  pdfNotUltima:
    "PDF downloads (with the answers) are part of the <b>Ultima</b> plan for teachers, which also includes Premium. Your account is connected, so they will start working here as soon as Ultima is active.",
  pdfNone: "This test doesn't have a PDF yet. It is being prepared.",
  pdfLoadFailed: "I couldn't load that PDF right now. Please try again in a minute.",
  pdfSendFailed: "I couldn't send the PDF. Please try again in a minute.",
  linkExpired: "That link has expired. Open your dashboard on the site and press <b>Connect Telegram</b> again.",
  connected: "✅ <b>Connected!</b> You'll get one test every morning at 10:00. Here is today's:",
  notLinked:
    "First connect your account: tap <b>Open MockOnline</b>, sign in, then tap <b>Connect Telegram</b> on your dashboard.",
  paused: "⏸ Paused. Send /daily any time to get the morning test again.",
  resumed: "🔔 Done. You'll get a test every morning at 10:00.",
  nothingLeft: "You've done every test I can offer right now. New ones are added every week!",
  tg: {
    signingIn: "Signing you in…",
    notLinkedTitle: "Connect your Telegram",
    notLinkedBody:
      "This Telegram isn't connected to a MockOnline account yet. Sign in once and connect it, and next time you'll go straight in.",
    linkThis: (name) => `Connect this Telegram to ${name}`,
    linked: "Connected! Taking you in…",
    signInEmail: "Sign in with email",
    openBrowser: "Open in browser (Google sign-in)",
    adminTitle: "Admins sign in normally",
    adminBody: "For safety, admin accounts are never signed in automatically. Use the normal sign-in page.",
    failedTitle: "Couldn't sign you in",
    failedBody: "The sign-in link from Telegram was too old or not valid. Close this window and open it again.",
    tryAgain: "Try again",
    webTitle: "Opening in your browser",
    webBody: "Telegram on the web can't keep you signed in here, so MockOnline opens in a new tab.",
  },
};

const UZ: Copy = {
  welcome: (name) =>
    [
      `👋 <b>${name ? `Salom, ${esc(name)}!` : "Salom!"}</b>`,
      "Men MockOnline botiman: IELTS tayyorgarligi doim yoningizda.",
      "",
      "📚 <b>Hozir test</b>: eng zaif savol turingizga moslab tanlangan Reading testi",
      "🔔 <b>Kundalik test</b>: har kuni ertalab soat 10:00 da bitta test (/daily yoqish, /stop toʻxtatish)",
      "🎯 <b>MockOnline</b>: butun sayt shu yerning oʻzida, Telegram ichida",
      "",
      "👇 Quyidan tanlang",
    ].join("\n"),
  help: [
    "<b>MockOnline qanday ishlaydi</b>",
    "",
    "📚 /test: hozirning oʻzida Reading testi",
    "🔔 /daily: har kuni ertalab soat 10:00 da bitta test",
    "⏸ /stop: ertalabki testni toʻxtatish",
    "🎯 <b>MockOnline</b> tugmasi: sayt Telegram ichida, avtomatik kirilgan holda",
    "",
    "<b>Savollar</b>",
    "<blockquote expandable><b>Akkauntimni qanday ulayman?</b>",
    "MockOnline tugmasini bosing, tizimga kiring va <b>Connect Telegram</b> tugmasini bosing. Bu faqat bir marta qilinadi.",
    "",
    "<b>Bu bepulmi?</b>",
    "Bepul testlar doim bepul, va har hafta 3 ta Premium testni bepul ochishingiz mumkin. Premium hamma testlarni ochadi.",
    "",
    "<b>Men oʻqituvchiman. PDF qanday olaman?</b>",
    "Ultima tarifida saytdagi istalgan testni oching va <b>Get a PDF</b> tugmasini bosing. PDF javoblari bilan shu yerga keladi.</blockquote>",
  ].join("\n"),
  nudge: "Men tugmalar va buyruqlarga javob beraman. Quyidan birini tanlang 👇",
  error: "Nimadir xato ketdi. Birozdan keyin qayta urinib koʻring.",
  btn: {
    test: "📚 Hozir test",
    help: "ℹ️ Yordam",
    open: "🎯 MockOnline'ni ochish",
    premium: "⭐ Premium",
    channel: "📢 Kanal",
    site: "🌐 Saytni ochish",
    dashboard: "🎯 Kabinetni ochish",
    startTest: "▶️ Testni boshlash",
    seeUltima: "⭐ Ultima haqida",
  },
  pdfExpired: "Bu havolaning muddati tugagan. Test sahifasiga qayting va <b>Get a PDF</b> tugmasini yana bosing.",
  pdfUnlinked:
    "Bu chat qaysi akkauntga tegishli ekanini hali bilmayman. Saytga kiring, testni oching va <b>Get a PDF</b> tugmasini bosing.",
  pdfNotUltima:
    "PDF yuklab olish (javoblari bilan) oʻqituvchilar uchun <b>Ultima</b> tarifiga kiradi, unga Premium ham kiradi. Akkauntingiz ulangan, Ultima faollashishi bilan PDF shu yerda ishlay boshlaydi.",
  pdfNone: "Bu testning PDF varianti hali yoʻq. U tayyorlanmoqda.",
  pdfLoadFailed: "PDFni hozir yuklay olmadim. Birozdan keyin qayta urinib koʻring.",
  pdfSendFailed: "PDFni yubora olmadim. Birozdan keyin qayta urinib koʻring.",
  linkExpired: "Bu havolaning muddati tugagan. Saytdagi kabinetingizni oching va <b>Connect Telegram</b> tugmasini yana bosing.",
  connected: "✅ <b>Ulandi!</b> Har kuni ertalab soat 10:00 da bitta test olasiz. Mana bugungisi:",
  notLinked:
    "Avval akkauntingizni ulang: <b>MockOnline</b> tugmasini bosing, tizimga kiring va kabinetingizda <b>Connect Telegram</b> tugmasini bosing.",
  paused: "⏸ Toʻxtatildi. Ertalabki testni qayta olish uchun istalgan vaqt /daily yuboring.",
  resumed: "🔔 Tayyor. Har kuni ertalab soat 10:00 da test olasiz.",
  nothingLeft: "Hozircha taklif qila oladigan barcha testlarni ishlab boʻldingiz. Har hafta yangi testlar qoʻshiladi!",
  tg: {
    signingIn: "Kirilmoqda…",
    notLinkedTitle: "Telegramni ulang",
    notLinkedBody:
      "Bu Telegram hali MockOnline akkauntiga ulanmagan. Bir marta kiring va ulang, keyingi safar toʻgʻridan-toʻgʻri kirasiz.",
    linkThis: (name) => `Bu Telegramni ${name} akkauntiga ulash`,
    linked: "Ulandi! Kirilmoqda…",
    signInEmail: "Email orqali kirish",
    openBrowser: "Brauzerda ochish (Google orqali kirish)",
    adminTitle: "Adminlar oddiy usulda kiradi",
    adminBody: "Xavfsizlik uchun admin akkauntlari hech qachon avtomatik kiritilmaydi. Oddiy kirish sahifasidan foydalaning.",
    failedTitle: "Kirib boʻlmadi",
    failedBody: "Telegramdan kelgan kirish havolasi eskirgan yoki notoʻgʻri. Oynani yoping va qayta oching.",
    tryAgain: "Qayta urinish",
    webTitle: "Brauzerda ochilmoqda",
    webBody: "Telegramning veb versiyasi bu yerda sizni tizimda saqlay olmaydi, shuning uchun MockOnline yangi oynada ochiladi.",
  },
};

const COPY: Record<Lang, Copy> = { en: EN, uz: UZ };

export function copy(lang: Lang): Copy {
  return COPY[lang];
}

/** The keyboard under the welcome, the help and the free-text nudge. */
export function welcomeKeyboard(lang: Lang, site: string): CopyButton[][] {
  const b = COPY[lang].btn;
  const base = site.replace(/\/+$/, "");
  return [
    [
      { text: b.test, callback_data: CB.test, style: "success" },
      { text: b.help, callback_data: CB.help },
    ],
    [{ text: b.open, web_app: { url: miniAppUrl(base, "/dashboard") }, style: "primary" }],
    [
      { text: b.premium, url: `${base}/premium` },
      { text: b.channel, url: CHANNEL_URL },
    ],
  ];
}

/** The one button under a test suggestion: opens the paper in the Mini App, signed in. */
export function startTestKeyboard(lang: Lang, site: string, path: string): CopyButton[][] {
  return [[{ text: COPY[lang].btn.startTest, web_app: { url: miniAppUrl(site, path) }, style: "success" }]];
}
