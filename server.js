// Servidor web de InnovaFit:
//  - sirve las páginas de /public (landing, evaluación, campus, admin)
//  - /api/exam: entrega preguntas sin respuestas y corrige del lado del servidor
//  - /pb/*: proxy hacia PocketBase, así el navegador usa un único dominio
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const env = require("./lib/env");
const { pb, q } = require("./lib/pb");
const exam = require("./data/questions.json");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

/* ---------- Proxy a PocketBase (antes de cualquier body parser) ---------- */
const pbTarget = new URL(env.PB_URL);
app.use("/pb", (req, res) => {
  const target = new URL(req.originalUrl.replace(/^\/pb/, "") || "/", pbTarget);
  const headers = { ...req.headers, host: target.host };
  headers["x-forwarded-for"] = req.ip;
  const upstream = http.request(target, { method: req.method, headers }, (pr) => {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.status(502).json({ message: "PocketBase no está disponible." });
  });
  req.pipe(upstream);
});

/* ---------- Evaluación ---------- */
const PASS_SCORE = exam.passScore;
const QUESTIONS = exam.questions;
const PUBLIC_QUESTIONS = QUESTIONS.map(({ n, section, q, options }) => ({ n, section, q, options }));

app.get("/api/config", (req, res) => {
  res.json({ waNumber: env.WA_NUMBER, passScore: PASS_SCORE });
});

app.get("/api/exam", (req, res) => {
  res.json({ passScore: PASS_SCORE, questions: PUBLIC_QUESTIONS });
});

// Límite simple por IP para que nadie genere cuentas en masa.
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const list = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
  if (list.length >= 8) {
    return res.status(429).json({ message: "Demasiados intentos. Probá de nuevo en unos minutos." });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}

const EMAIL_RE = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]{2,}$/;

function grade(answers) {
  const sections = {};
  let correct = 0;
  for (const qq of QUESTIONS) {
    const s = (sections[qq.section] ||= { section: qq.section, correct: 0, total: 0 });
    s.total++;
    if (answers[qq.n] === qq.correct) {
      s.correct++;
      correct++;
    }
  }
  const total = QUESTIONS.length;
  const score = Math.round((correct * 100) / total);
  return {
    score,
    correct,
    total,
    passed: score >= PASS_SCORE,
    sections: Object.values(sections).map((s) => ({ ...s, pct: Math.round((s.correct / s.total) * 100) })),
  };
}

function randomPassword() {
  // Sin caracteres ambiguos (0/O, 1/l) para que se pueda dictar por WhatsApp.
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join("");
}

function certCode() {
  return "IF-" + crypto.randomBytes(3).toString("hex").toUpperCase() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 3);
}

// Da acceso al curso de regalo: crea la cuenta si no existe o suma el curso a la existente.
async function grantGift(lead) {
  const gift = await pb("/api/collections/courses/records?perPage=1&sort=order&filter=" + encodeURIComponent("isGift = true"));
  const course = gift.items[0];
  if (!course) return { course: null };

  const found = await pb("/api/collections/users/records?perPage=1&filter=" + encodeURIComponent("email = " + q(lead.email)));
  const existing = found.items[0];
  if (existing) {
    await pb("/api/collections/users/records/" + existing.id, { method: "PATCH", body: { "courses+": course.id } });
    return { course: { id: course.id, title: course.title }, email: lead.email, password: null, existing: true, userId: existing.id };
  }

  const password = randomPassword();
  await pb("/api/collections/users/records", {
    method: "POST",
    body: {
      email: lead.email,
      password,
      passwordConfirm: password,
      name: lead.name,
      phone: lead.phone,
      country: lead.country,
      docId: lead.docId,
      role: "student",
      courses: [course.id],
      emailVisibility: true,
      verified: true,
    },
  });
  // Sesión iniciada para que entre al campus sin escribir nada (cuenta ya verificada).
  const auth = await fetch(env.PB_URL + "/api/collections/users/auth-with-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: lead.email, password }),
  }).then((r) => r.json());
  return {
    course: { id: course.id, title: course.title },
    email: lead.email,
    password,
    existing: false,
    userId: auth.record.id,
    auth: { token: auth.token, record: auth.record },
  };
}

/* ---------- Certificados ---------- */

// Valida el token del navegador contra PocketBase y devuelve el usuario.
async function authUser(req) {
  const token = req.get("authorization");
  if (!token) return null;
  const r = await fetch(env.PB_URL + "/api/collections/users/auth-refresh", { method: "POST", headers: { Authorization: token } });
  if (!r.ok) return null;
  return (await r.json()).record;
}

function todayISO() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Folio correlativo por año: IF-2026-0001, IF-2026-0002…
async function createCertificate(data) {
  const prefix = "IF-" + new Date().getFullYear() + "-";
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await pb("/api/collections/certificates/records?perPage=1&sort=-folio&filter=" + encodeURIComponent("folio ~ " + q(prefix + "%")));
    const seq = last.items[0] ? parseInt(last.items[0].folio.slice(prefix.length), 10) + 1 : 1;
    try {
      return await pb("/api/collections/certificates/records", { method: "POST", body: { ...data, folio: prefix + String(seq).padStart(4, "0") } });
    } catch (e) {
      if (e.status !== 400) throw e; // 400 = folio repetido por una emisión simultánea: reintenta
    }
  }
  throw new Error("No se pudo asignar un folio.");
}

app.post("/api/certificates/claim", express.json({ limit: "4kb" }), async (req, res) => {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ message: "Iniciá sesión de nuevo." });
    const courseId = String((req.body || {}).course || "");
    if (!(user.courses || []).includes(courseId)) return res.status(403).json({ message: "No tenés acceso a ese curso." });

    const course = await pb("/api/collections/courses/records/" + encodeURIComponent(courseId));
    if (!course.certEnabled) return res.status(400).json({ message: "Este curso no emite certificado." });

    const existing = await pb("/api/collections/certificates/records?perPage=1&filter=" + encodeURIComponent("user = " + q(user.id) + " && course = " + q(courseId)));
    if (existing.items[0]) return res.json(existing.items[0]);

    const lessons = await pb("/api/collections/lessons/records?perPage=1&fields=id&filter=" + encodeURIComponent("course = " + q(courseId)));
    const done = await pb("/api/collections/progress/records?perPage=1&fields=id&filter=" + encodeURIComponent("user = " + q(user.id) + " && course = " + q(courseId) + " && lesson.course = " + q(courseId)));
    if (!lessons.totalItems || done.totalItems < lessons.totalItems) {
      return res.status(400).json({ message: "Te faltan lecciones por completar (" + done.totalItems + "/" + lessons.totalItems + ")." });
    }

    const cert = await createCertificate({
      user: user.id,
      course: courseId,
      studentName: user.name || user.email,
      title: course.title,
      hours: course.certHours || "",
      docId: user.docId || "",
      issueDate: todayISO(),
      source: "curso",
    });
    res.json(cert);
  } catch (err) {
    console.error("[claim]", err.status || "", err.message);
    res.status(500).json({ message: "No pudimos generar tu certificado. Probá de nuevo." });
  }
});

app.post("/api/admin/certificates", express.json({ limit: "8kb" }), async (req, res) => {
  try {
    const admin = await authUser(req);
    if (!admin || admin.role !== "admin") return res.status(403).json({ message: "Solo administradores." });
    const b = req.body || {};
    const data = {
      user: String(b.user || ""),
      course: String(b.course || ""),
      studentName: String(b.studentName || "").trim().slice(0, 120),
      title: String(b.title || "").trim().slice(0, 200),
      hours: String(b.hours || "").trim().slice(0, 60),
      docId: String(b.docId || "").trim().slice(0, 40),
      issueDate: /^\d{4}-\d{2}-\d{2}$/.test(b.issueDate || "") ? b.issueDate : todayISO(),
      source: "manual",
    };
    if (data.studentName.length < 2) return res.status(400).json({ message: "Falta el nombre del alumno." });
    if (data.title.length < 3) return res.status(400).json({ message: "Falta el nombre de la certificación." });
    res.json(await createCertificate(data));
  } catch (err) {
    console.error("[admin cert]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
    res.status(500).json({ message: "No se pudo emitir el certificado." });
  }
});

// Verificación pública: cualquiera puede comprobar que un folio es real.
app.get("/api/certificates/verify/:folio", async (req, res) => {
  try {
    const r = await pb("/api/collections/certificates/records?perPage=1&filter=" + encodeURIComponent("folio = " + q(req.params.folio.toUpperCase().slice(0, 20))));
    const c = r.items[0];
    if (!c) return res.status(404).json({ message: "No existe un certificado con ese folio." });
    res.json({ folio: c.folio, studentName: c.studentName, title: c.title, hours: c.hours, issueDate: c.issueDate });
  } catch (err) {
    res.status(500).json({ message: "No se pudo verificar." });
  }
});

app.post("/api/exam", express.json({ limit: "32kb" }), rateLimit, async (req, res) => {
  const body = req.body || {};
  const leadIn = body.lead || {};
  const answersIn = body.answers || {};

  const lead = {
    name: String(leadIn.name || "").trim().slice(0, 120),
    email: String(leadIn.email || "").trim().toLowerCase().slice(0, 160),
    country: String(leadIn.country || "").replace(/\D/g, "").slice(0, 4),
    phone: String(leadIn.phone || "").replace(/\D/g, "").slice(0, 15),
    docId: String(leadIn.docId || "").trim().slice(0, 40),
  };
  if (lead.name.length < 2) return res.status(400).json({ message: "Escribí tu nombre completo." });
  if (!EMAIL_RE.test(lead.email)) return res.status(400).json({ message: "Ese correo no parece válido." });
  if (lead.phone.length < 6) return res.status(400).json({ message: "Revisá tu número de WhatsApp." });

  const answers = {};
  for (const qq of QUESTIONS) {
    const a = answersIn[qq.n];
    if (["A", "B", "C", "D"].includes(a)) answers[qq.n] = a;
  }
  if (Object.keys(answers).length !== QUESTIONS.length) {
    return res.status(400).json({ message: "Faltan respuestas. Completá las " + QUESTIONS.length + " preguntas." });
  }

  try {
    const result = grade(answers);
    const code = certCode();
    const attempt = await pb("/api/collections/attempts/records", {
      method: "POST",
      body: { ...lead, ...result, answers, code, status: "nuevo" },
    });

    let access = null;
    if (result.passed) {
      access = await grantGift(lead);
      if (access.userId) {
        await pb("/api/collections/attempts/records/" + attempt.id, { method: "PATCH", body: { user: access.userId } });
      }
      delete access.userId;
    }

    res.json({ ...result, passScore: PASS_SCORE, code, access });
  } catch (err) {
    console.error("[exam]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
    res.status(500).json({ message: "No pudimos guardar tu resultado. Probá de nuevo en un momento." });
  }
});

/* ---------- Páginas ---------- */
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(env.PORT, () => {
      console.log("InnovaFit listo en http://localhost:" + env.PORT);
      console.log("  Landing     http://localhost:" + env.PORT + "/");
      console.log("  Evaluación  http://localhost:" + env.PORT + "/evaluacion");
      console.log("  Campus      http://localhost:" + env.PORT + "/campus");
      console.log("  Admin       http://localhost:" + env.PORT + "/admin");
      resolve(server);
    });
    server.on("error", (err) => {
      console.error(err.code === "EADDRINUSE" ? "El puerto " + env.PORT + " está ocupado. Cambiá PORT en .env." : err.message);
      process.exit(1);
    });
  });
}

if (require.main === module) listen();

module.exports = { app, listen };
