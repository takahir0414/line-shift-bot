const { saveScheduleNotes, getScheduleNotes } = require("../lib/scheduleNotesStore");

module.exports = async function handler(req, res) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (req.method === "GET") {
    const key = req.query.key;
    if (!adminKey || key !== adminKey) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { storeId, periodStart } = req.query;
    if (!storeId || !periodStart) { res.status(400).json({ error: "storeId and periodStart required" }); return; }
    const notes = await getScheduleNotes(storeId, periodStart);
    res.status(200).json({ ok: true, notes });
    return;
  }

  if (req.method === "POST") {
    let body = req.body;
    // Vercelはapplication/jsonをパースしてくれるが念のため
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { res.status(400).json({ error: "Invalid JSON" }); return; }
    }
    if (!adminKey || (body || {}).key !== adminKey) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { storeId, periodStart, notes } = body || {};
    if (!storeId || !periodStart || !notes) { res.status(400).json({ error: "storeId, periodStart, notes required" }); return; }
    await saveScheduleNotes(storeId, periodStart, notes);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
