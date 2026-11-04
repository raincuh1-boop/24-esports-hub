import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const store = getStore("24-esports-hub");
const allowedTypes = new Set(["players", "tournaments", "announcements"]);
const secret = () => process.env.SESSION_SECRET || "";
const sign = value => createHmac("sha256", secret()).update(value).digest("base64url");
const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  body: JSON.stringify(body)
});
function sessionCookie(event) {
  const header = event.headers?.cookie || event.headers?.Cookie || "";
  return header.split(";").map(part => part.trim()).find(part => part.startsWith("hub_session="))?.slice("hub_session=".length) || "";
}
function isAdmin(event) {
  try {
    if (!secret()) return false;
    const [payload, signature] = sessionCookie(event).split(".");
    if (!payload || !signature) return false;
    const expected = sign(payload);
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp > Date.now();
  } catch { return false; }
}
async function readData() {
  const result = { players: [], tournaments: [], announcements: [] };
  for (const key of Object.keys(result)) {
    const value = await store.get(key, { type: "json" });
    if (Array.isArray(value)) result[key] = value;
  }
  return result;
}
export default async function handler(event) {
  if (event.httpMethod === "GET") {
    try { return json(200, await readData()); }
    catch { return json(500, { error: "Unable to load hub data." }); }
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." }, { allow: "GET, POST" });
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "Invalid request body." }); }

  if (body.action === "login") {
    const configured = Buffer.from(process.env.ADMIN_PASSWORD || "");
    const supplied = Buffer.from(String(body.password || ""));
    if (!configured.length || configured.length !== supplied.length || !timingSafeEqual(configured, supplied))
      return json(401, { error: "Incorrect admin password." });
    if (!secret()) return json(500, { error: "Set SESSION_SECRET in Netlify environment variables." });
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
    const cookie = "hub_session=" + payload + "." + sign(payload) + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800";
    return json(200, { ok: true }, { "set-cookie": cookie });
  }
  if (body.action === "logout")
    return json(200, { ok: true }, { "set-cookie": "hub_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
  if (!isAdmin(event)) return json(401, { error: "Please sign in again." });
  if (!allowedTypes.has(body.type)) return json(400, { error: "Invalid data type." });

  const existing = await store.get(body.type, { type: "json" }) || [];
  if (body.action === "delete") {
    const next = existing.filter(item => item.id !== body.id);
    await store.setJSON(body.type, next);
    return json(200, { ok: true });
  }
  if (body.action !== "save") return json(400, { error: "Unknown action." });

  const input = body.item || {};
  const item = { ...input, id: input.id || randomUUID() };
  if (body.type === "players") {
    item.name = String(item.name || "").trim().slice(0, 40);
    item.game = String(item.game || "").trim().slice(0, 50);
    item.region = item.region === "NA" ? "NA" : "EU";
    if (!item.name || !item.game) return json(400, { error: "Player name and game are required." });
    for (const field of ["wins", "losses", "points"]) item[field] = Math.max(0, Math.min(1000000, Number(item[field]) || 0));
  } else {
    item.title = String(item.title || "").trim().slice(0, 100);
    if (!item.title) return json(400, { error: "A title is required." });
    if (body.type === "announcements") item.body = String(item.body || "").slice(0, 2500);
    else {
      item.game = String(item.game || "").slice(0, 60);
      item.date = String(item.date || "").slice(0, 80);
      item.region = String(item.region || "All").slice(0, 20);
      item.status = String(item.status || "Upcoming").slice(0, 30);
      item.link = String(item.link || "").slice(0, 500);
    }
  }
  item.date = item.date || new Date().toISOString().slice(0, 10);
  const next = [...existing.filter(entry => entry.id !== item.id), item];
  await store.setJSON(body.type, next);
  return json(200, { ok: true, item });
}