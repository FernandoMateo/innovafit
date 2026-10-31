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

// Inscripción del alumno al curso (una por par alumno/curso).
async function ensureEnrollment(userId, courseId, source) {
  const found = await pb("/api/collections/enrollments/records?perPage=1&filter=" + encodeURIComponent("user = " + q(userId) + " && course = " + q(courseId)));
  if (found.items[0]) return found.items[0];
  try {
    return await pb("/api/collections/enrollments/records", {
      method: "POST",
      body: { user: userId, course: courseId, status: "inscripto", source, attempts: 0, extraAttempts: 0 },
    });
  } catch (e) {
    if (e.status !== 400) throw e; // otra petición la creó al mismo tiempo
    return (await pb("/api/collections/enrollments/records?perPage=1&filter=" + encodeURIComponent("user = " + q(userId) + " && course = " + q(courseId)))).items[0];
  }
}

// Inicia sesión del lado del servidor para devolverle al navegador la sesión lista.
async function login(email, password) {
  const r = await fetch(env.PB_URL + "/api/collections/users/auth-with-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  const data = await r.json();
  return { token: data.token, record: data.record };
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
    await ensureEnrollment(existing.id, course.id, "evaluacion");
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
  const auth = await login(lead.email, password);
  await ensureEnrollment(auth.record.id, course.id, "evaluacion");
  return {
    course: { id: course.id, title: course.title },
    email: lead.email,
    password,
    existing: false,
    userId: auth.record.id,
    auth,
  };
}

/* ---------- Registro e inscripción al campus ---------- */

async function openCourse(courseId) {
  try {
    const c = await pb("/api/collections/courses/records/" + encodeURIComponent(courseId));
    return c.published && c.openAccess ? c : null;
  } catch {
    return null;
  }
}

app.post("/api/register", express.json({ limit: "8kb" }), rateLimit, async (req, res) => {
  const b = req.body || {};
  const data = {
    name: String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 120),
    email: String(b.email || "").trim().toLowerCase().slice(0, 160),
    country: String(b.country || "").replace(/\D/g, "").slice(0, 4),
    phone: String(b.phone || "").replace(/\D/g, "").slice(0, 15),
    password: String(b.password || ""),
  };
  if (data.name.length < 5 || !data.name.includes(" ")) return res.status(400).json({ message: "Escribí tu nombre y apellido completos: así salen en tu certificado." });
  if (!EMAIL_RE.test(data.email)) return res.status(400).json({ message: "Ese correo no parece válido." });
  if (data.phone.length < 7) return res.status(400).json({ message: "Revisá tu número de teléfono." });
  if (data.password.length < 8) return res.status(400).json({ message: "La contraseña necesita al menos 8 caracteres." });

  try {
    const found = await pb("/api/collections/users/records?perPage=1&filter=" + encodeURIComponent("email = " + q(data.email)));
    if (found.items[0]) return res.status(409).json({ message: "Ya hay una cuenta con ese correo. Iniciá sesión con tu contraseña." });

    const course = b.course ? await openCourse(String(b.course)) : null;
    await pb("/api/collections/users/records", {
      method: "POST",
      body: { ...data, passwordConfirm: data.password, role: "student", courses: course ? [course.id] : [], emailVisibility: true, verified: true },
    });
    const auth = await login(data.email, data.password);
    if (course) await ensureEnrollment(auth.record.id, course.id, "registro");
    res.json({ auth, course: course ? { id: course.id, title: course.title } : null });
  } catch (err) {
    console.error("[register]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
    res.status(500).json({ message: "No pudimos crear tu cuenta. Probá de nuevo en un momento." });
  }
});

app.post("/api/enroll", express.json({ limit: "4kb" }), async (req, res) => {
  try {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ message: "Iniciá sesión de nuevo." });
    const course = await openCourse(String((req.body || {}).course || ""));
    if (!course) return res.status(404).json({ message: "Ese curso no tiene inscripción abierta." });
    if (!(user.courses || []).includes(course.id)) {
      await pb("/api/collections/users/records/" + user.id, { method: "PATCH", body: { "courses+": course.id } });
    }
    await ensureEnrollment(user.id, course.id, "registro");
    res.json({ course: { id: course.id, title: course.title } });
  } catch (err) {
    console.error("[enroll]", err.status || "", err.message);
    res.status(500).json({ message: "No pudimos inscribirte. Probá de nuevo." });
  }
});

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

    // Si el curso tiene examen de acreditación, el certificado sale solo al aprobarlo.
    const final = await pb("/api/collections/assessments/records?perPage=1&fields=id&filter=" + encodeURIComponent("course = " + q(courseId) + ' && kind = "final"'));
    if (final.totalItems) return res.status(400).json({ message: "Aprobá el examen de acreditación con 80% o más y tu certificado se emite al instante." });

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

/* ---------- Comprobación de conocimientos y examen de acreditación ---------- */

// Carga la lección, su evaluación y la inscripción, validando que el alumno tenga acceso.
async function assessmentContext(req, lessonId) {
  const user = await authUser(req);
  if (!user) throw Object.assign(new Error("Iniciá sesión de nuevo."), { status: 401 });
  let lesson;
  try {
    lesson = await pb("/api/collections/lessons/records/" + encodeURIComponent(lessonId));
  } catch {
    throw Object.assign(new Error("No encontramos esa evaluación."), { status: 404 });
  }
  if (!(user.courses || []).includes(lesson.course) && user.role !== "admin") {
    throw Object.assign(new Error("No tenés acceso a este curso."), { status: 403 });
  }
  const a = (await pb("/api/collections/assessments/records?perPage=1&filter=" + encodeURIComponent("lesson = " + q(lesson.id)))).items[0];
  if (!a || !Array.isArray(a.questions) || !a.questions.length) {
    throw Object.assign(new Error("Esta evaluación todavía no tiene preguntas cargadas."), { status: 404 });
  }
  const enrollment = await ensureEnrollment(user.id, lesson.course, "admin");
  return { user, lesson, a, enrollment };
}

// El examen se habilita cuando completó todas las lecciones anteriores.
async function examLock(user, lesson) {
  const all = (await pb("/api/collections/lessons/records?perPage=500&fields=id,kind,order&filter=" + encodeURIComponent("course = " + q(lesson.course)))).items;
  const before = all.filter((l) => l.kind !== "exam" && l.id !== lesson.id);
  const done = new Set(
    (await pb("/api/collections/progress/records?perPage=500&fields=lesson&filter=" + encodeURIComponent("user = " + q(user.id) + " && course = " + q(lesson.course)))).items.map((p) => p.lesson)
  );
  const missing = before.filter((l) => !done.has(l.id)).length;
  return missing ? "Completá las " + missing + " lecciones que te faltan para habilitar el examen." : null;
}

function attemptsInfo(a, enrollment) {
  const allowed = (a.maxAttempts || 0) > 0 ? a.maxAttempts + (enrollment.extraAttempts || 0) : 0;
  const used = enrollment.attempts || 0;
  return { allowed, used, left: allowed ? Math.max(0, allowed - used) : null };
}

async function markDone(userId, lesson) {
  try {
    await pb("/api/collections/progress/records", { method: "POST", body: { user: userId, lesson: lesson.id, course: lesson.course } });
  } catch (e) {
    if (e.status !== 400) throw e; // ya estaba completa
  }
}

function sendError(res, err, tag) {
  if (err.status && err.status < 500 && !err.data) return res.status(err.status).json({ message: err.message });
  console.error("[" + tag + "]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
  res.status(500).json({ message: "Algo falló de nuestro lado. Probá de nuevo en un momento." });
}

app.get("/api/assessment/:lesson", async (req, res) => {
  try {
    const { user, lesson, a, enrollment } = await assessmentContext(req, req.params.lesson);
    const final = a.kind === "final";
    const history = await pb(
      "/api/collections/assessment_results/records?perPage=20&sort=-created&fields=score,passed,created,attemptNo&filter=" +
        encodeURIComponent("user = " + q(user.id) + " && assessment = " + q(a.id))
    );
    res.json({
      kind: a.kind,
      title: a.title || lesson.title,
      passScore: a.passScore || (final ? 80 : 0),
      questions: a.questions.map((x) => ({ q: x.q, options: x.options })),
      attempts: final ? attemptsInfo(a, enrollment) : null,
      accredited: enrollment.status === "acreditado",
      bestScore: enrollment.score || 0,
      accreditedAt: enrollment.accreditedAt || null,
      locked: final && enrollment.status !== "acreditado" ? await examLock(user, lesson) : null,
      history: history.items,
    });
  } catch (err) {
    sendError(res, err, "assessment");
  }
});

app.post("/api/assessment/:lesson", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const { user, lesson, a, enrollment } = await assessmentContext(req, req.params.lesson);
    const final = a.kind === "final";
    const answers = Array.isArray((req.body || {}).answers) ? req.body.answers : [];
    if (answers.length !== a.questions.length || answers.some((x, i) => !Number.isInteger(x) || x < 0 || x >= a.questions[i].options.length)) {
      return res.status(400).json({ message: "Respondé todas las preguntas antes de enviar." });
    }

    let course = null;
    if (final) {
      if (enrollment.status === "acreditado") return res.status(400).json({ message: "Ya acreditaste este curso." });
      const lock = await examLock(user, lesson);
      if (lock) return res.status(400).json({ message: lock });
      const info = attemptsInfo(a, enrollment);
      if (info.allowed && info.left <= 0) {
        return res.status(403).json({ message: "Usaste tus " + info.allowed + " oportunidades. Comunicate con el equipo de InnovaFit para pedir apoyo y nuevas oportunidades.", noAttempts: true });
      }
      course = await pb("/api/collections/courses/records/" + lesson.course);
    }

    const correctFlags = a.questions.map((x, i) => answers[i] === x.correct);
    const correct = correctFlags.filter(Boolean).length;
    const total = a.questions.length;
    const score = Math.round((correct * 100) / total);
    const passScore = a.passScore || (final ? 80 : 0);
    const passed = score >= passScore;
    const attemptNo = final ? (enrollment.attempts || 0) + 1 : 0;

    await pb("/api/collections/assessment_results/records", {
      method: "POST",
      body: { user: user.id, course: lesson.course, assessment: a.id, kind: a.kind, attemptNo, score, correct, total, passed, answers },
    });

    const out = { score, correct, total, passed, passScore };

    if (!final) {
      // La comprobación de práctica muestra la corrección completa y cuenta como lección vista.
      await markDone(user.id, lesson);
      out.review = a.questions.map((x, i) => ({ ok: correctFlags[i], correct: x.correct, explain: x.explain || "" }));
      return res.json(out);
    }

    const patch = { attempts: attemptNo, score: Math.max(enrollment.score || 0, score) };
    if (passed) {
      await markDone(user.id, lesson);
      patch.status = "acreditado";
      patch.accreditedAt = new Date().toISOString().replace("T", " ");
      if (course.certEnabled) {
        const prev = (await pb("/api/collections/certificates/records?perPage=1&filter=" + encodeURIComponent("user = " + q(user.id) + " && course = " + q(course.id)))).items[0];
        const cert = prev || (await createCertificate({
          user: user.id,
          course: course.id,
          studentName: user.name || user.email,
          title: course.title,
          hours: course.certHours || "",
          docId: user.docId || "",
          issueDate: todayISO(),
          source: "curso",
          score,
        }));
        patch.certificate = cert.folio;
        out.certificate = cert;
      }
    }
    await pb("/api/collections/enrollments/records/" + enrollment.id, { method: "PATCH", body: patch });
    out.attempts = attemptsInfo(a, { ...enrollment, attempts: attemptNo });
    if (!passed && out.attempts.allowed && out.attempts.left === 0) out.noAttempts = true;
    res.json(out);
  } catch (err) {
    sendError(res, err, "assessment submit");
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
    const s = (await pb("/api/collections/settings/records?perPage=1")).items[0];
    const seal = s && s.sealLogo ? "/pb/api/files/" + s.collectionId + "/" + s.id + "/" + s.sealLogo : null;
    res.json({ folio: c.folio, studentName: c.studentName, title: c.title, hours: c.hours, issueDate: c.issueDate, score: c.score || 0, seal });
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
