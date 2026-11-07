// Monitor interno de InnovaFit.
// Cada 5 minutos revisa base de datos, disco, memoria, CPU, certificado HTTPS, backups y errores
// del sitio. Si algo cambia de estado manda un aviso push (ntfy.sh) con el problema puntual y cómo
// resolverlo. Guarda una muestra diaria de capacidad para proyectar cuándo hay que escalar.
const fs = require("fs");
const os = require("os");
const path = require("path");
const tls = require("tls");
const env = require("./env");
const { pb } = require("./pb");

const INTERVAL_MS = 5 * 60 * 1000;
const REMIND_MS = 6 * 60 * 60 * 1000; // repite el aviso de un problema que sigue abierto
const HISTORY_FILE = path.join(env.ROOT, "data", "monitor-history.json");
const DOMAIN = process.env.APP_DOMAIN || "campusinnovafit.tech";
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";
const NTFY_SERVER = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const isProd = process.platform === "linux";

/* ---------- Errores 5xx del sitio (los registra un middleware de server.js) ---------- */
const serverErrors = []; // {t, route, status}
function recordResponse(route, status) {
  if (status < 500) return;
  serverErrors.push({ t: Date.now(), route, status });
  if (serverErrors.length > 500) serverErrors.splice(0, serverErrors.length - 500);
}

/* ---------- Utilidades ---------- */
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const fmtBytes = (b) => (b >= GB ? round(b / GB) + " GB" : round(b / MB) + " MB");

function dirSize(dir) {
  let total = 0, files = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; files++; } catch {} }
    }
  }
  return { bytes: total, files };
}

function fileSize(p) {
  try { return fs.statSync(p).size; } catch { return 0; }
}

// En Linux freemem() no cuenta la caché que el sistema libera solo: usamos MemAvailable.
function memory() {
  const total = os.totalmem();
  let available = os.freemem();
  try {
    const m = fs.readFileSync("/proc/meminfo", "utf8").match(/MemAvailable:\s+(\d+) kB/);
    if (m) available = Number(m[1]) * 1024;
  } catch {}
  return { total, available, usedPct: round(((total - available) / total) * 100) };
}

function certDaysLeft() {
  return new Promise((resolve) => {
    const sock = tls.connect({ host: "127.0.0.1", port: 443, servername: DOMAIN, rejectUnauthorized: false, timeout: 5000 }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      resolve(cert && cert.valid_to ? Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000) : null);
    });
    sock.on("error", () => resolve(null));
    sock.on("timeout", () => { sock.destroy(); resolve(null); });
  });
}

/* ---------- Historial diario de capacidad ---------- */
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return []; }
}
function saveSample(sample) {
  const hist = loadHistory();
  const day = new Date().toISOString().slice(0, 10);
  const i = hist.findIndex((h) => h.day === day);
  const row = { day, ...sample };
  if (i >= 0) hist[i] = row; else hist.push(row);
  const trimmed = hist.slice(-180);
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed));
  } catch {}
  return trimmed;
}

// Crecimiento diario del disco (promedio de los últimos 30 días con datos) y días hasta llenarlo al 90%.
function projection(hist, disk) {
  const pts = hist.filter((h) => h.diskUsed).slice(-30);
  if (pts.length < 3) return { perDay: null, daysTo90: null };
  const first = pts[0], last = pts[pts.length - 1];
  const days = (new Date(last.day) - new Date(first.day)) / 86400000;
  if (days <= 0) return { perDay: null, daysTo90: null };
  const perDay = (last.diskUsed - first.diskUsed) / days;
  const room = disk.total * 0.9 - disk.used;
  return { perDay, daysTo90: perDay > 0 ? Math.max(0, Math.floor(room / perDay)) : null };
}

/* ---------- Revisiones ---------- */
let storageCache = { at: 0, value: { bytes: 0, files: 0 } };

async function runChecks() {
  const checks = [];
  const add = (id, label, level, message, fix) => checks.push({ id, label, level, message, fix: level === "ok" ? "" : fix || "" });

  // 1) Base de datos: el servidor tiene que operar como superusuario (si no, nadie puede registrarse).
  let counts = {};
  try {
    await pb("/api/collections/users");
    const [users, attempts, enrollments, certs] = await Promise.all(
      ["users", "attempts", "enrollments", "certificates"].map((c) => pb("/api/collections/" + c + "/records?perPage=1&fields=id"))
    );
    counts = { users: users.totalItems, attempts: attempts.totalItems, enrollments: enrollments.totalItems, certificates: certs.totalItems };
    add("db", "Base de datos", "ok", "El servidor lee y escribe en PocketBase.");
  } catch (err) {
    const msg = err.status === 403 || err.status === 400
      ? "El servidor perdió los permisos de superusuario en PocketBase: los registros y evaluaciones van a fallar."
      : "PocketBase no responde (" + (err.status || err.message) + "): el sitio no puede leer ni guardar datos.";
    add("db", "Base de datos", "critical", msg,
      "En el VPS: systemctl restart innovafit. Si sigue, revisá que PB_SUPERUSER_EMAIL/PASSWORD del .env coincidan con el superusuario (npm run setup los repara).");
  }

  // 2) Disco
  let disk = null;
  try {
    const s = fs.statfsSync(env.PB_DIR);
    const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
    disk = { total, free, used: total - free, usedPct: round(((total - free) / total) * 100) };
    const lvl = disk.usedPct >= 90 ? "critical" : disk.usedPct >= 80 ? "warning" : "ok";
    add("disk", "Disco", lvl, "Usado " + disk.usedPct + "% (" + fmtBytes(disk.used) + " de " + fmtBytes(disk.total) + ", libres " + fmtBytes(free) + ").",
      "Liberá espacio (journalctl --vacuum-size=200M, borrá backups viejos de pb_data/backups o videos que ya no uses) o ampliá el disco del VPS en Hostinger.");
  } catch (err) {
    add("disk", "Disco", "warning", "No se pudo leer el disco: " + err.message);
  }

  // 3) Memoria
  const mem = memory();
  add("memory", "Memoria RAM", mem.usedPct >= 95 ? "critical" : mem.usedPct >= 85 ? "warning" : "ok",
    "Usada " + mem.usedPct + "% (" + fmtBytes(mem.total - mem.available) + " de " + fmtBytes(mem.total) + ").",
    "Si se repite seguido, pasá a un plan de VPS con más RAM. Para salir del paso: systemctl restart innovafit.");

  // 4) CPU (carga promedio de 15 minutos por núcleo)
  const cores = os.cpus().length || 1;
  const [l1, l5, l15] = os.loadavg();
  const perCore = round(l15 / cores, 2);
  add("cpu", "Procesador", perCore >= 1.5 ? "critical" : perCore >= 0.9 ? "warning" : "ok",
    "Carga de los últimos 15 min: " + round(l15, 2) + " en " + cores + " núcleos (" + Math.round(perCore * 100) + "% de capacidad).",
    "El procesador está saturado: el sitio se vuelve lento. Si dura más de unas horas, pasá a un VPS con más núcleos.");

  // 5) Certificado HTTPS (solo en el servidor)
  let certDays = null;
  if (isProd) {
    certDays = await certDaysLeft();
    if (certDays === null) add("https", "Certificado HTTPS", "warning", "No se pudo leer el certificado de " + DOMAIN + ".", "Revisá nginx: systemctl status nginx.");
    else add("https", "Certificado HTTPS", certDays < 7 ? "critical" : certDays < 14 ? "warning" : "ok",
      "Vence en " + certDays + " días.", "La renovación automática falló. En el VPS: certbot renew && systemctl reload nginx.");
  }

  // 6) Backups automáticos de PocketBase
  let lastBackup = null;
  try {
    const list = await pb("/api/backups");
    const newest = (list || []).map((b) => new Date(String(b.modified).replace(" ", "T"))).sort((a, b) => b - a)[0];
    if (newest) lastBackup = newest.toISOString();
    const ageH = newest ? (Date.now() - newest) / 3600000 : Infinity;
    // Sin copias no se cae nada para los usuarios: es advertencia, no crítico.
    add("backup", "Copias de seguridad", ageH > 30 ? "warning" : "ok",
      newest ? "Última copia: hace " + Math.round(ageH) + " h." : "No hay ninguna copia de seguridad.",
      "Las copias son automáticas cada noche. Si no aparecen, corré npm run setup en el VPS o creá una a mano en PocketBase → Settings → Backups.");
  } catch (err) {
    add("backup", "Copias de seguridad", "warning", "No se pudo consultar las copias: " + (err.status || err.message));
  }

  // 7) Errores del sitio en los últimos 15 minutos
  const since = Date.now() - 15 * 60 * 1000;
  const recent = serverErrors.filter((e) => e.t >= since);
  const byRoute = {};
  recent.forEach((e) => (byRoute[e.route] = (byRoute[e.route] || 0) + 1));
  const top = Object.entries(byRoute).sort((a, b) => b[1] - a[1]).map(([r, n]) => r + " (" + n + ")").join(", ");
  add("errors", "Errores del sitio", recent.length >= 10 ? "critical" : recent.length >= 3 ? "warning" : "ok",
    recent.length ? recent.length + " errores en 15 min: " + top + "." : "Sin errores en los últimos 15 minutos.",
    "Los usuarios están viendo fallas. Mirá el detalle en el VPS: journalctl -u innovafit -n 100 --no-pager");

  // Capacidad
  if (Date.now() - storageCache.at > 60 * 60 * 1000) {
    storageCache = { at: Date.now(), value: dirSize(path.join(env.PB_DIR, "storage")) };
  }
  const dbBytes = fileSize(path.join(env.PB_DIR, "data.db")) + fileSize(path.join(env.PB_DIR, "data.db-wal"));
  const auxBytes = fileSize(path.join(env.PB_DIR, "auxiliary.db")) + fileSize(path.join(env.PB_DIR, "auxiliary.db-wal"));
  const backupsBytes = dirSize(path.join(env.PB_DIR, "backups")).bytes;

  const hist = saveSample({
    diskUsed: disk ? disk.used : null,
    diskTotal: disk ? disk.total : null,
    memPct: mem.usedPct,
    load15: round(l15, 2),
    db: dbBytes,
    storage: storageCache.value.bytes,
    ...counts,
  });
  const proj = disk ? projection(hist, disk) : { perDay: null, daysTo90: null };

  const order = { critical: 2, warning: 1, ok: 0 };
  const worst = checks.reduce((w, c) => (order[c.level] > order[w] ? c.level : w), "ok");

  return {
    status: worst,
    checkedAt: new Date().toISOString(),
    checks,
    capacity: {
      disk,
      memory: mem,
      cpu: { cores, load1: round(l1, 2), load5: round(l5, 2), load15: round(l15, 2), perCore },
      data: { db: dbBytes, auxiliary: auxBytes, storage: storageCache.value.bytes, storageFiles: storageCache.value.files, backups: backupsBytes },
      counts,
      growth: { diskPerDay: proj.perDay, daysTo90: proj.daysTo90 },
      certDays,
      lastBackup,
    },
    history: hist.slice(-30),
    uptime: { process: Math.round(process.uptime()), system: Math.round(os.uptime()) },
    notify: { enabled: !!NTFY_TOPIC, topic: NTFY_TOPIC, url: NTFY_TOPIC ? NTFY_SERVER + "/" + NTFY_TOPIC : "" },
  };
}

/* ---------- Avisos push (ntfy.sh) ---------- */
// Se publica en JSON (no con encabezados) para que acentos y emojis lleguen bien.
async function push(title, message, priority = 3, tags = []) {
  if (!NTFY_TOPIC) return false;
  try {
    const r = await fetch(NTFY_SERVER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: NTFY_TOPIC, title, message, priority, tags }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function notify(title, lines, level) {
  const priority = level === "critical" ? 5 : level === "warning" ? 4 : 3;
  const tags = [level === "ok" ? "white_check_mark" : level === "critical" ? "rotating_light" : "warning"];
  return push(title, lines.join("\n\n"), priority, tags);
}

const open = new Map(); // id → {level, notifiedAt}
let latest = null;

async function tick() {
  let report;
  try { report = await runChecks(); } catch (err) { console.error("[monitor]", err.message); return; }
  latest = report;
  const now = Date.now();
  for (const c of report.checks) {
    const prev = open.get(c.id);
    if (c.level === "ok") {
      if (prev) {
        open.delete(c.id);
        await notify("Resuelto: " + c.label, [c.message], "ok");
      }
      continue;
    }
    const changed = !prev || prev.level !== c.level;
    if (changed || now - prev.notifiedAt > REMIND_MS) {
      const ok = await notify((c.level === "critical" ? "URGENTE · " : "Atención · ") + c.label + " · InnovaFit", [c.message, "Qué hacer: " + c.fix], c.level);
      open.set(c.id, { level: c.level, notifiedAt: ok ? now : (prev ? prev.notifiedAt : 0) });
      console.error("[monitor]", c.level, c.label, "-", c.message);
    }
  }
}

function start() {
  setTimeout(tick, 20 * 1000); // primera revisión al minuto de arrancar
  setInterval(tick, INTERVAL_MS).unref();
}

async function getReport(fresh) {
  if (fresh || !latest) latest = await runChecks();
  return latest;
}

module.exports = { start, getReport, recordResponse, push, notify };
