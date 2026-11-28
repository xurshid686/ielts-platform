// Drives the teacher/student bot webhook (/api/telegram-teacher) against a FAKE Telegram,
// so the replies, keyboards, button colours and callback answers can be asserted without
// touching the real bot.
//
//   1. node scripts/e2e-bot-chat.mjs spy                 (starts the fake Telegram on :4599)
//   2. TELEGRAM_API_BASE=http://127.0.0.1:4599 TELEGRAM_TEACHER_BOT_TOKEN=1:e2e \
//      TELEGRAM_TEACHER_WEBHOOK_SECRET=e2e-secret npx next start -p 3199
//   3. node scripts/e2e-bot-chat.mjs run [http://localhost:3199]
//
// The chat ids are random and linked to nothing, so the database is only read.

import http from "node:http";

const SPY_PORT = 4599;
const mode = process.argv[2];

if (mode === "spy") {
  const calls = [];
  let refuseEffects = false;
  http
    .createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (req.url === "/__calls") {
          res.end(JSON.stringify(calls.splice(0)));
          return;
        }
        if (req.url === "/__refuse-effects") {
          refuseEffects = true;
          res.end("ok");
          return;
        }
        const method = req.url.split("/").pop();
        let json = {};
        try {
          json = JSON.parse(body);
        } catch {}
        calls.push({ method, body: json });
        res.setHeader("Content-Type", "application/json");
        if (refuseEffects && json.message_effect_id) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: EFFECT_ID_INVALID" }));
          return;
        }
        res.end(JSON.stringify({ ok: true, result: method === "answerCallbackQuery" ? true : { message_id: calls.length } }));
      });
    })
    .listen(SPY_PORT, () => console.log(`fake Telegram on :${SPY_PORT}`));
} else if (mode === "run") {
  const base = process.argv[3] || "http://localhost:3199";
  const spy = `http://127.0.0.1:${SPY_PORT}`;
  let fails = 0;
  const check = (ok, what) => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
    if (!ok) fails++;
  };
  let updateId = Math.floor(Math.random() * 1e9);
  const chat = 700000000 + Math.floor(Math.random() * 1e6);
  const from = (lang) => ({ id: chat, is_bot: false, first_name: "Aziz <x>", language_code: lang });

  async function send(update, secret = "e2e-secret") {
    const res = await fetch(`${base}/api/telegram-teacher`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
      body: JSON.stringify(update),
    });
    return res.status;
  }
  const msg = (text, lang = "en", type = "private") => ({
    update_id: ++updateId,
    message: { message_id: 1, from: from(lang), chat: { id: type === "private" ? chat : -100123, type }, text },
  });
  // after() runs once the 200 is out, and a database lookup can take seconds: poll until
  // `min` calls have arrived (or 20 s), then wait a beat for any stragglers.
  async function calls(min = 1) {
    const got = [];
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 300));
      got.push(...(await (await fetch(`${spy}/__calls`)).json()));
      if (got.length >= min) break;
    }
    await new Promise((r) => setTimeout(r, 700));
    got.push(...(await (await fetch(`${spy}/__calls`)).json()));
    return got;
  }
  await calls(0); // drain
  const flat = (c) => (c.body.reply_markup?.inline_keyboard ?? []).flat();

  check((await send(msg("/start"), "wrong")) === 404, "wrong secret is a bare 404");

  await send(msg("/start", "uz"));
  let c = await calls();
  check(c.length === 1 && c[0].method === "sendMessage", "/start: one message");
  check(c[0]?.body.text.includes("Salom, Aziz!"), "/start uz: Uzbek welcome with first name");
  const kb = flat(c[0] ?? { body: {} });
  check(kb.some((b) => b.callback_data === "m:test" && b.style === "success"), "welcome: green Test now button");
  check(kb.some((b) => b.web_app?.url?.endsWith("/tg?next=%2Fdashboard") && b.style === "primary"), "welcome: blue Mini App button");
  check(kb.some((b) => b.url === "https://t.me/ReadinMarathons"), "welcome: channel link");

  await send(msg("/start", "ru"));
  c = await calls();
  check(c[0]?.body.text.includes("Hi, Aziz"), "/start ru: English welcome");

  await send(msg("/help"));
  c = await calls();
  check(c[0]?.body.text.includes("<blockquote expandable>"), "/help: FAQ in an expandable quote");

  await send(msg("salom"));
  c = await calls();
  check(c[0]?.body.text.startsWith("I answer to buttons"), "free text: short nudge");
  check(flat(c[0] ?? { body: {} }).length === 5, "free text: same keyboard");

  await send(msg("/test", "uz"));
  c = await calls();
  check(c[0]?.body.text.includes("Avval akkauntingizni ulang"), "/test unlinked: Uzbek connect hint");

  const pdfId = "11111111-2222-3333-4444-555555555555";
  await send(msg(`/start pdf_${pdfId}`));
  c = await calls();
  check(c[0]?.body.text.startsWith("I don't know which account"), "unlinked PDF request: explains");

  const cbUpdate = {
    update_id: ++updateId,
    callback_query: { id: "cbq-1", from: from("en"), message: { message_id: 9, chat: { id: chat, type: "private" } }, data: "m:help" },
  };
  await send(cbUpdate);
  c = await calls(2);
  check(c[0]?.method === "answerCallbackQuery" && c[0]?.body.callback_query_id === "cbq-1", "callback: spinner answered first");
  check(c[1]?.method === "sendMessage" && c[1]?.body.text.includes("How MockOnline works"), "callback m:help: help text");

  await send(cbUpdate);
  c = await calls(0);
  check(c.length === 0, "repeated update_id: ignored");

  await send(msg("/start", "en", "supergroup"));
  c = await calls(0);
  check(c.length === 0, "group chat: ignored");

  const linkCode = "ABCDEFGHJKLM"; // never minted, so it is "expired"
  await send(msg(`/start link_${linkCode}`, "uz"));
  c = await calls();
  check(c[0]?.body.text.includes("muddati tugagan"), "bad link code: Uzbek expired message");

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
} else {
  console.log("usage: spy | run [base]");
}
