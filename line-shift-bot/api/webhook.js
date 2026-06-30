const { messagingApi, validateSignature } = require("@line/bot-sdk");
const { getSession, setSession, clearSession } = require("../lib/session");
const { STORES } = require("../lib/constants");
const {
  storeSelectMessage,
  employmentTypeMessage,
  registrationCompleteMessage,
  daySelectMessage,
  timePickerMessage,
  summaryMessage,
  buildPeriodDates,
  toISODate,
} = require("../lib/flex");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifySignature(rawBody, signature) {
  return validateSignature(rawBody, config.channelSecret, signature);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(200).send("OK");
    return;
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers["x-line-signature"];

  if (!signature || !verifySignature(rawBody, signature)) {
    res.status(401).send("Invalid signature");
    return;
  }

  const body = JSON.parse(rawBody.toString("utf-8"));
  const events = body.events || [];

  await Promise.all(events.map(handleEvent).map((p) => p.catch((e) => console.error(e))));

  res.status(200).send("OK");
};

async function handleEvent(event) {
  const userId = event.source && event.source.userId;
  const replyToken = event.replyToken;
  if (!userId) return;

  const session = await getSession(userId);

  if (event.type === "message" && event.message.type === "text") {
    await handleTextMessage(userId, replyToken, session, event.message.text.trim());
    return;
  }

  if (event.type === "postback") {
    await handlePostback(userId, replyToken, session, event);
    return;
  }
}

async function handleTextMessage(userId, replyToken, session, text) {
  if (session.registrationStep === "not_started") {
    session.profile.name = text;
    session.registrationStep = "awaiting_store";
    await setSession(userId, session);
    await reply(replyToken, [
      { type: "text", text: `ありがとうございます！\n次に所属店舗を選択してください` },
      storeSelectMessage(),
    ]);
    return;
  }

  if (session.registrationStep === "awaiting_store" || session.registrationStep === "awaiting_employment") {
    const msg =
      session.registrationStep === "awaiting_store" ? storeSelectMessage() : employmentTypeMessage();
    await reply(replyToken, [{ type: "text", text: "上のボタンから選択してください👆" }, msg]);
    return;
  }

  if (session.registrationStep === "registered") {
    if (text === "シフト") {
      await startShiftRequest(userId, replyToken, session);
      return;
    }
    await reply(replyToken, [
      { type: "text", text: `「シフト」と送るとシフト希望の入力を開始します。` },
    ]);
    return;
  }

  await reply(replyToken, [
    { type: "text", text: "初めまして！シフト管理Botです🙌\nまずお名前（本名）を教えてください" },
  ]);
}

async function startShiftRequest(userId, replyToken, session) {
  session.requestStep = "selecting_days";
  session.periodStart = getNextPeriodStart();
  session.selectedDates = [];
  session.dayOffDates = [];
  session.timeEntries = {};
  session.timeEntryQueue = [];
  session.pendingDate = null;
  session.pendingStartTime = null;
  await setSession(userId, session);
  await reply(replyToken, [daySelectMessage(session)]);
}

async function handlePostback(userId, replyToken, session, event) {
  const params = new URLSearchParams(event.postback.data);
  const action = params.get("action");

  switch (action) {
    case "select_store": {
      const storeId = params.get("storeId");
      const store = STORES.find((s) => s.id === storeId);
      session.profile.storeId = storeId;
      session.profile.storeName = store ? store.name : storeId;
      session.registrationStep = "awaiting_employment";
      await setSession(userId, session);
      await reply(replyToken, [employmentTypeMessage()]);
      return;
    }

    case "select_employment": {
      session.profile.employmentType = params.get("type");
      session.registrationStep = "registered";
      await setSession(userId, session);
      await reply(replyToken, [registrationCompleteMessage(session.profile)]);
      return;
    }

    case "cycle_day": {
      if (session.requestStep !== "selecting_days") return;
      const date = params.get("date");
      const isEmployee = session.profile.employmentType === "fulltime";
      cycleDayState(session, date, isEmployee);
      await setSession(userId, session);
      await reply(replyToken, [daySelectMessage(session)]);
      return;
    }

    case "days_done": {
      if (session.requestStep !== "selecting_days") return;
      if (session.selectedDates.length === 0 && session.dayOffDates.length === 0) {
        await reply(replyToken, [{ type: "text", text: "希望日が選択されていません。日付をタップして選んでください。" }]);
        return;
      }
      session.requestStep = "entering_time";
      session.timeEntryQueue = [...session.selectedDates].sort();
      await setSession(userId, session);
      await advanceTimeEntry(userId, replyToken, session);
      return;
    }

    case "set_time": {
      if (session.requestStep !== "entering_time") return;
      const which = params.get("which");
      const date = params.get("date");
      const time = event.postback.params && event.postback.params.time;
      if (!time || date !== session.pendingDate) return;

      if (which === "start") {
        session.pendingStartTime = time;
        await setSession(userId, session);
        await reply(replyToken, [timePickerMessage(date, "end")]);
        return;
      }

      if (which === "end") {
        session.timeEntries[date] = { start: session.pendingStartTime, end: time };
        session.pendingStartTime = null;
        session.timeEntryQueue.shift();
        await setSession(userId, session);
        await advanceTimeEntry(userId, replyToken, session);
        return;
      }
      return;
    }

    case "edit_restart": {
      session.requestStep = "selecting_days";
      session.timeEntries = {};
      session.timeEntryQueue = [];
      session.pendingDate = null;
      session.pendingStartTime = null;
      await setSession(userId, session);
      await reply(replyToken, [daySelectMessage(session)]);
      return;
    }

    case "submit": {
      console.log("SHIFT_SUBMISSION", JSON.stringify({
        userId,
        profile: session.profile,
        periodStart: session.periodStart,
        selectedDates: session.selectedDates,
        dayOffDates: session.dayOffDates,
        timeEntries: session.timeEntries,
      }));
      session.requestStep = "idle";
      await setSession(userId, session);
      await reply(replyToken, [{ type: "text", text: "希望を受け付けました！ありがとうございます😊" }]);
      return;
    }
  }
}

function cycleDayState(session, date, isEmployee) {
  const isSelected = session.selectedDates.includes(date);
  const isDayOff = session.dayOffDates.includes(date);

  if (!isSelected && !isDayOff) {
    session.selectedDates.push(date);
    return;
  }
  if (isSelected) {
    session.selectedDates = session.selectedDates.filter((d) => d !== date);
    if (isEmployee) {
      session.dayOffDates.push(date);
    }
    return;
  }
  if (isDayOff) {
    session.dayOffDates = session.dayOffDates.filter((d) => d !== date);
  }
}

async function advanceTimeEntry(userId, replyToken, session) {
  if (session.timeEntryQueue.length === 0) {
    session.requestStep = "confirming";
    session.pendingDate = null;
    await setSession(userId, session);
    await reply(replyToken, [summaryMessage(session)]);
    return;
  }
  const nextDate = session.timeEntryQueue[0];
  session.pendingDate = nextDate;
  await setSession(userId, session);
  await reply(replyToken, [timePickerMessage(nextDate, "start")]);
}

function getNextPeriodStart() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const day = jstNow.getDay();
  const diffToNextMonday = ((8 - day) % 7) || 7;
  const next = new Date(jstNow);
  next.setDate(jstNow.getDate() + diffToNextMonday);
  return toISODate(next);
}

/**
 * replyToken（無料）を使って返信する。
 * 締切リマインダーや確定通知など「Botから能動的に送る」プッシュ通知は、
 * このファイルとは別の、本部ダッシュボードからのセグメント配信機能側で
 * client.pushMessage（または multicast）を使って実装する想定。
 */
async function reply(replyToken, messages) {
  if (!replyToken) return;
  await client.replyMessage({ replyToken, messages });
}
