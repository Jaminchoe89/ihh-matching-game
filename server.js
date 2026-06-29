// Static file server + leaderboard API for the IHH Matching Game.
// Talks to Supabase via its REST API using the service-role key (server-side
// only), so the database keys and phone numbers never reach the browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// The admin panel is reached only via this secret path segment (no password);
// keep the resulting URL private. /admin without the token returns 404.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

const TABLE = "leaderboard";
const TOP_N = 5;
const MAX_TIME_MS = 21000; // a round can last at most 20s; small buffer for safety

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 10000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

async function supabase(pathQuery, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return response;
}

async function getTopScores() {
  const response = await supabase(
    `${TABLE}?select=name,time_ms&order=time_ms.asc,created_at.asc&limit=${TOP_N}`
  );
  if (!response.ok) throw new Error(`supabase select ${response.status}`);
  return response.json();
}

async function insertScore(entry) {
  const response = await supabase(TABLE, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([entry]),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase insert ${response.status} ${detail}`);
  }
}

async function getAllLeads() {
  const response = await supabase(
    `${TABLE}?select=name,phone,time_ms,created_at&order=time_ms.asc,created_at.asc`
  );
  if (!response.ok) throw new Error(`supabase select ${response.status}`);
  return response.json();
}

function adminTokenOk(token) {
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

function serveStatic(res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.join(ROOT, path.normalize(pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return sendText(res, 403, "Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=300",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return sendText(res, 400, "Bad request");
  }

  // --- Public leaderboard (names + times only, no phone numbers) ---
  if (pathname === "/api/leaderboard" && req.method === "GET") {
    if (!supabaseConfigured()) return sendJson(res, 200, { leaderboard: [] });
    try {
      return sendJson(res, 200, { leaderboard: await getTopScores() });
    } catch (error) {
      console.error("leaderboard error:", error.message);
      return sendJson(res, 500, { error: "leaderboard_failed" });
    }
  }

  // --- Submit a qualifying score ---
  if (pathname === "/api/score" && req.method === "POST") {
    if (!supabaseConfigured()) return sendJson(res, 503, { error: "storage_unavailable" });
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: "bad_json" });
    }
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();
    const timeMs = Math.round(Number(payload.time_ms));
    const phoneDigits = phone.replace(/[^\d]/g, "");

    if (name.length < 1 || name.length > 40) return sendJson(res, 400, { error: "bad_name" });
    if (phoneDigits.length < 6 || phone.length > 25) return sendJson(res, 400, { error: "bad_phone" });
    if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs > MAX_TIME_MS) {
      return sendJson(res, 400, { error: "bad_time" });
    }

    try {
      await insertScore({ name, phone, time_ms: timeMs });
      return sendJson(res, 200, { leaderboard: await getTopScores() });
    } catch (error) {
      console.error("score error:", error.message);
      return sendJson(res, 500, { error: "score_failed" });
    }
  }

  // --- Admin: all leads incl. phone numbers (access via secret token in URL) ---
  if (pathname.startsWith("/api/leads/") && req.method === "GET") {
    if (!adminTokenOk(pathname.slice("/api/leads/".length))) {
      return sendText(res, 404, "Not found");
    }
    if (!supabaseConfigured()) return sendJson(res, 200, { leads: [] });
    try {
      return sendJson(res, 200, { leads: await getAllLeads() });
    } catch (error) {
      console.error("leads error:", error.message);
      return sendJson(res, 500, { error: "leads_failed" });
    }
  }

  // --- Admin page (served only at the secret token path) ---
  if (pathname.startsWith("/admin/")) {
    if (!adminTokenOk(pathname.slice("/admin/".length))) {
      return sendText(res, 404, "Not found");
    }
    return serveStatic(res, "/admin.html");
  }
  if (pathname === "/admin" || pathname === "/admin.html") {
    return sendText(res, 404, "Not found");
  }

  // --- Everything else: static files ---
  return serveStatic(res, pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`IHH Matching Game on 0.0.0.0:${PORT} (supabase: ${supabaseConfigured()})`);
});
