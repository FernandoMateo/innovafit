// Prepara todo de una vez (se puede volver a correr sin romper nada):
//  1. crea .env con contraseñas aleatorias si no existe
//  2. crea/actualiza el superusuario de PocketBase
//  3. crea/actualiza las colecciones y sus reglas de acceso
//  4. crea el usuario administrador del panel
//  5. carga el curso de Biomecánica (curso de regalo) con los archivos de la carpeta de origen
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, ".env");

/* ---------- 1. .env ---------- */
if (!fs.existsSync(ENV_FILE)) {
  const pass = () => crypto.randomBytes(12).toString("base64url");
  fs.writeFileSync(
    ENV_FILE,
    [
      "# Puerto del sitio web",
      "PORT=3100",
      "# PocketBase (solo accesible desde el servidor; el navegador entra por /pb)",
      "PB_URL=http://127.0.0.1:8090",
      "PB_SUPERUSER_EMAIL=superusuario@innovafit.local",
      "PB_SUPERUSER_PASSWORD=" + pass(),
      "# Usuario para entrar a /admin",
      "ADMIN_EMAIL=admin@innovafit.com",
      "ADMIN_PASSWORD=" + pass(),
      "# WhatsApp de ventas (código de país + número, sin +)",
      "WA_NUMBER=5213223208254",
      "# Carpeta con los videos/audios/PDF del curso de Biomecánica para la carga inicial",
      "SEED_MEDIA_DIR=..",
      "",
    ].join("\n")
  );
  console.log("✓ .env creado con contraseñas aleatorias");
}

const env = require("./lib/env");
const { pb, waitHealthy } = require("./lib/pb");

const ADMIN = '@request.auth.role = "admin"';
const GB2 = 2 * 1024 * 1024 * 1024;

const created = () => [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

async function getCollection(name) {
  try {
    return await pb("/api/collections/" + name);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Crea la colección o le agrega los campos que falten, sin tocar los existentes.
async function upsertCollection(def) {
  const current = await getCollection(def.name);
  if (!current) {
    const res = await pb("/api/collections", { method: "POST", body: def });
    console.log("✓ colección creada:", def.name);
    return res;
  }
  const names = new Set(current.fields.map((f) => f.name));
  // En los select existentes solo sumamos opciones nuevas (nunca quitamos las que hay).
  const merged = current.fields.map((f) => {
    const want = (def.fields || []).find((d) => d.name === f.name);
    if (!want || f.type !== "select" || !want.values) return f;
    return { ...f, values: [...new Set([...f.values, ...want.values])] };
  });
  const fields = [...merged, ...(def.fields || []).filter((f) => !names.has(f.name))];
  const { fields: _ignored, name, type, ...rest } = def;
  const res = await pb("/api/collections/" + current.id, { method: "PATCH", body: { ...rest, fields } });
  console.log("✓ colección actualizada:", def.name);
  return res;
}

async function setupCollections() {
  const courses = await upsertCollection({
    name: "courses",
    type: "base",
    fields: [
      { name: "title", type: "text", required: true, max: 160 },
      { name: "subtitle", type: "text", max: 240 },
      { name: "description", type: "editor" },
      { name: "cover", type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"], thumbs: ["640x360"] },
      { name: "photo", type: "file", maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png", "image/webp"] },
      { name: "published", type: "bool" },
      { name: "isGift", type: "bool" },
      { name: "order", type: "number" },
      { name: "certEnabled", type: "bool" },
      { name: "certHours", type: "text", max: 60 },
      // Cualquiera puede inscribirse con solo registrarse (curso gratuito de campaña).
      { name: "openAccess", type: "bool" },
      ...created(),
    ],
    listRule: null,
    viewRule: null,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  // users es la colección de autenticación que trae PocketBase; le sumamos campos.
  const users = await getCollection("users");
  await upsertCollection({
    name: "users",
    type: "auth",
    fields: [
      { name: "role", type: "select", values: ["student", "admin"], maxSelect: 1 },
      { name: "phone", type: "text", max: 20 },
      { name: "country", type: "text", max: 6 },
      { name: "docId", type: "text", max: 40 },
      { name: "courses", type: "relation", collectionId: courses.id, maxSelect: 999, cascadeDelete: false },
      // true cuando el alumno ya vio el tutorial del campus (lo marca él mismo).
      { name: "onboarded", type: "bool" },
    ],
    listRule: "id = @request.auth.id || " + ADMIN,
    viewRule: "id = @request.auth.id || " + ADMIN,
    createRule: ADMIN,
    // El alumno edita su perfil, pero nunca su rol ni sus cursos.
    updateRule: ADMIN + " || (id = @request.auth.id && @request.body.role:isset = false && @request.body.courses:isset = false && @request.body.verified:isset = false)",
    deleteRule: ADMIN,
    manageRule: ADMIN,
  });
  if (!users) throw new Error("No existe la colección users en PocketBase.");

  // Ahora que existe users.courses, las reglas de cursos pueden depender de ella.
  // Los cursos de acceso libre se ven sin sesión (catálogo de la pantalla de registro).
  await pb("/api/collections/" + courses.id, {
    method: "PATCH",
    body: {
      listRule: ADMIN + " || (published = true && (openAccess = true || @request.auth.courses.id ?= id))",
      viewRule: ADMIN + " || (published = true && (openAccess = true || @request.auth.courses.id ?= id))",
    },
  });

  const lessons = await upsertCollection({
    name: "lessons",
    type: "base",
    fields: [
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "section", type: "text", max: 120 },
      { name: "description", type: "text", max: 2000 },
      { name: "kind", type: "select", values: ["video", "audio", "pdf", "image", "embed", "text", "quiz", "exam"], maxSelect: 1, required: true },
      { name: "file", type: "file", maxSelect: 1, maxSize: GB2, mimeTypes: [] },
      { name: "url", type: "url" },
      { name: "content", type: "editor" },
      { name: "duration", type: "text", max: 20 },
      { name: "order", type: "number" },
      ...created(),
    ],
    listRule: ADMIN + " || (course.published = true && @request.auth.courses.id ?= course)",
    viewRule: ADMIN + " || (course.published = true && @request.auth.courses.id ?= course)",
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  await upsertCollection({
    name: "progress",
    type: "base",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "lesson", type: "relation", collectionId: lessons.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
      ...created(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_progress_user_lesson ON progress (user, lesson)"],
    listRule: "user = @request.auth.id || " + ADMIN,
    viewRule: "user = @request.auth.id || " + ADMIN,
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: null,
    deleteRule: "user = @request.auth.id",
  });

  await upsertCollection({
    name: "attempts",
    type: "base",
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "email", type: "email", required: true },
      { name: "country", type: "text", max: 6 },
      { name: "phone", type: "text", max: 20 },
      { name: "docId", type: "text", max: 40 },
      { name: "score", type: "number" },
      { name: "correct", type: "number" },
      { name: "total", type: "number" },
      { name: "passed", type: "bool" },
      { name: "sections", type: "json", maxSize: 20000 },
      { name: "answers", type: "json", maxSize: 20000 },
      { name: "code", type: "text", max: 20 },
      { name: "status", type: "select", values: ["nuevo", "contactado", "inscripto", "descartado"], maxSelect: 1 },
      { name: "notes", type: "text", max: 2000 },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      ...created(),
    ],
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: null, // solo el servidor (superusuario) guarda intentos
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  // Certificaciones que se ofrecen (catálogo que ve el alumno y consulta por WhatsApp).
  await upsertCollection({
    name: "programs",
    type: "base",
    fields: [
      { name: "title", type: "text", required: true, max: 160 },
      { name: "kind", type: "select", values: ["certificacion", "especializacion", "paquete"], maxSelect: 1 },
      { name: "summary", type: "text", max: 600 },
      { name: "duration", type: "text", max: 60 },
      { name: "modality", type: "text", max: 60 },
      { name: "image", type: "file", maxSelect: 1, maxSize: 10 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"], thumbs: ["640x360"] },
      { name: "priceLabel", type: "text", max: 40 },
      { name: "note", type: "text", max: 120 },
      // InnovaSale: precio regular, % propio (modo "por certificación") y cupos de la oferta.
      { name: "price", type: "number", min: 0 },
      { name: "salePercent", type: "number", min: 0, max: 90 },
      { name: "saleSlots", type: "number", min: 0 },
      // Foto recortada (PNG sin fondo) para la tarjeta de la landing.
      { name: "photo", type: "file", maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png", "image/webp"] },
      // Curso propio de la certificación: tiene su examen y, si se quiere, material de estudio.
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: false },
      { name: "published", type: "bool" },
      { name: "order", type: "number" },
      ...created(),
    ],
    listRule: 'published = true || ' + ADMIN,
    viewRule: 'published = true || ' + ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  // Certificados emitidos. Solo el servidor los crea (folio correlativo y validación de requisitos).
  await upsertCollection({
    name: "certificates",
    type: "base",
    fields: [
      { name: "folio", type: "text", required: true, max: 20 },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: false },
      { name: "studentName", type: "text", required: true, max: 120 },
      { name: "title", type: "text", required: true, max: 200 },
      { name: "hours", type: "text", max: 60 },
      { name: "docId", type: "text", max: 40 },
      { name: "issueDate", type: "text", max: 10 },
      { name: "source", type: "select", values: ["curso", "manual"], maxSelect: 1 },
      { name: "score", type: "number" },
      ...created(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_cert_folio ON certificates (folio)"],
    listRule: "user = @request.auth.id || " + ADMIN,
    viewRule: "user = @request.auth.id || " + ADMIN,
    createRule: null,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  // Inscripción del alumno a cada curso y su estado de acreditación. Solo el servidor la crea.
  await upsertCollection({
    name: "enrollments",
    type: "base",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "status", type: "select", values: ["inscripto", "acreditado"], maxSelect: 1 },
      { name: "source", type: "select", values: ["registro", "evaluacion", "admin"], maxSelect: 1 },
      { name: "score", type: "number" },
      { name: "attempts", type: "number" },
      { name: "extraAttempts", type: "number" },
      { name: "accreditedAt", type: "date" },
      { name: "certificate", type: "text", max: 20 },
      ...created(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_enroll_user_course ON enrollments (user, course)"],
    listRule: "user = @request.auth.id || " + ADMIN,
    viewRule: "user = @request.auth.id || " + ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  // Preguntas de la comprobación y del examen. Tienen las respuestas: solo admin y servidor.
  const assessments = await upsertCollection({
    name: "assessments",
    type: "base",
    fields: [
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "lesson", type: "relation", collectionId: lessons.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "kind", type: "select", values: ["practica", "final"], maxSelect: 1, required: true },
      { name: "title", type: "text", max: 200 },
      { name: "passScore", type: "number" },
      { name: "maxAttempts", type: "number" },
      { name: "draft", type: "bool" },
      { name: "questions", type: "json", maxSize: 200000 },
      ...created(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_assess_lesson ON assessments (lesson)"],
    listRule: ADMIN,
    viewRule: ADMIN,
    createRule: ADMIN,
    updateRule: ADMIN,
    deleteRule: ADMIN,
  });

  await upsertCollection({
    name: "assessment_results",
    type: "base",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true, required: true },
      { name: "course", type: "relation", collectionId: courses.id, maxSelect: 1, cascadeDelete: true },
      { name: "assessment", type: "relation", collectionId: assessments.id, maxSelect: 1, cascadeDelete: true },
      { name: "kind", type: "select", values: ["practica", "final"], maxSelect: 1 },
      { name: "attemptNo", type: "number" },
      { name: "score", type: "number" },
      { name: "correct", type: "number" },
      { name: "total", type: "number" },
      { name: "passed", type: "bool" },
      { name: "answers", type: "json", maxSize: 20000 },
      ...created(),
    ],
    listRule: "user = @request.auth.id || " + ADMIN,
    viewRule: "user = @request.auth.id || " + ADMIN,
    createRule: null,
    updateRule: null,
    deleteRule: ADMIN,
  });

  // Ajustes generales (un solo registro): campaña comercial y sello del certificado.
  await upsertCollection({
    name: "settings",
    type: "base",
    fields: [
      { name: "campaignOn", type: "bool" },
      { name: "campaignTitle", type: "text", max: 80 },
      { name: "campaignText", type: "text", max: 240 },
      { name: "campaignLogo", type: "file", maxSelect: 1, maxSize: 5 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
      // InnovaSale: descuentos por tiempo limitado (solo con la campaña activa).
      { name: "saleMode", type: "select", values: ["off", "general", "custom"], maxSelect: 1 },
      { name: "salePercent", type: "number", min: 0, max: 90 },
      { name: "saleSlots", type: "number", min: 0 },
      { name: "saleEnds", type: "date" },
      { name: "saleCurrency", type: "text", max: 6 },
      { name: "saleText", type: "text", max: 240 },
      { name: "sealLogo", type: "file", maxSelect: 1, maxSize: 5 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
      { name: "seedVersion", type: "number" },
      // Contenido editable de la landing (Admin → Web) y su imagen principal.
      { name: "landing", type: "json", maxSize: 200000 },
      { name: "heroImage", type: "file", maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"], thumbs: ["1200x1200"] },
      // Capturas opcionales para cada pantalla del iPad de la landing (si faltan, se ve la pantalla de muestra).
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: "screen" + n, type: "file", maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] })),
      { name: "ctaImage", type: "file", maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
      ...created(),
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: ADMIN,
    deleteRule: null,
  });
}

async function getSettings() {
  const r = await pb("/api/collections/settings/records?perPage=1");
  if (r.items[0]) return r.items[0];
  return pb("/api/collections/settings/records", {
    method: "POST",
    body: { campaignOn: true, campaignTitle: "Buen Fin InnovaFit", campaignText: "Cursos gratis con certificado y precios especiales en certificaciones durante noviembre.", seedVersion: 0 },
  });
}

const COVERS_DIR = path.join(ROOT, "seed", "covers");
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function setImage(collection, rec, field) {
  const p = path.join(COVERS_DIR, slug(rec.title) + ".webp");
  if (!fs.existsSync(p)) return false;
  const f = new FormData();
  f.set(field, await fs.openAsBlob(p, { type: "image/webp" }), slug(rec.title) + ".webp");
  await pb("/api/collections/" + collection + "/records/" + rec.id, { method: "PATCH", form: f });
  return true;
}

// Cambios de datos que se aplican una sola vez por servidor (seedVersion en settings).
async function migrate() {
  const settings = await getSettings();
  const v = settings.seedVersion || 0;

  if (v < 1) {
    const gift = (await pb("/api/collections/courses/records?perPage=1&filter=" + encodeURIComponent('title = "Fundamentos de Biomecánica"'))).items[0];
    if (gift) {
      await pb("/api/collections/courses/records/" + gift.id, { method: "PATCH", body: { openAccess: true, certEnabled: true } });
      const lessons = (await pb("/api/collections/lessons/records?perPage=200&sort=order&filter=" + encodeURIComponent('course = "' + gift.id + '"'))).items;
      const check = lessons.find((l) => l.title === "Comprobación de conocimientos");
      if (check) {
        await pb("/api/collections/lessons/records/" + check.id, {
          method: "PATCH",
          body: { kind: "quiz", description: "Respondé las tres preguntas del estudio de caso y comprobá al instante si las analizaste bien." },
        });
      }
      if (!lessons.some((l) => l.kind === "exam")) {
        await pb("/api/collections/lessons/records", {
          method: "POST",
          body: {
            course: gift.id,
            title: "Examen de acreditación del curso",
            section: "Acreditación",
            kind: "exam",
            order: Math.max(0, ...lessons.map((l) => l.order || 0)) + 1,
            description: "20 preguntas sobre todo el curso. Aprobás con 80% o más y tu certificado se emite al instante. Tenés 3 oportunidades.",
          },
        });
      }
    }
    // Todos los que ya tenían cursos quedan inscriptos.
    const users = await pb("/api/collections/users/records?perPage=500&filter=" + encodeURIComponent('role != "admin"'));
    for (const u of users.items) {
      for (const c of u.courses || []) {
        try {
          await pb("/api/collections/enrollments/records", { method: "POST", body: { user: u.id, course: c, status: "inscripto", source: "evaluacion", attempts: 0, extraAttempts: 0 } });
        } catch (e) {
          if (e.status !== 400) throw e;
        }
      }
    }
    console.log("✓ migración 1: acceso con registro, comprobación interactiva y examen de acreditación");
  }

  if (v < 2) {
    let n = 0;
    for (const c of (await pb("/api/collections/courses/records?perPage=200")).items) if (await setImage("courses", c, "cover")) n++;
    for (const p of (await pb("/api/collections/programs/records?perPage=200")).items) if (!p.image && (await setImage("programs", p, "image"))) n++;
    console.log("✓ migración 2: " + n + " portadas cargadas");
  }

  if (v < 3) {
    // Notas de la landing que antes estaban fijas en el HTML.
    const notes = { "Certificación Personal Trainer (CPT)": "Doble aval: nacional e internacional", "Paquete Entrenador Élite": "Precios especiales de Buen Fin en noviembre" };
    for (const p of (await pb("/api/collections/programs/records?perPage=200")).items) {
      if (notes[p.title] && !p.note) await pb("/api/collections/programs/records/" + p.id, { method: "PATCH", body: { note: notes[p.title] } });
    }
    console.log("✓ migración 3: notas del catálogo");
  }

  const LAST = 3;
  if (v < LAST) await pb("/api/collections/settings/records/" + settings.id, { method: "PATCH", body: { seedVersion: LAST } });
}

// Carga las preguntas de la comprobación y del examen si la lección todavía no tiene (archivo fuera del repo).
async function seedAssessments() {
  const file = path.join(ROOT, "data", "assessments-seed.json");
  if (!fs.existsSync(file)) return;
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  const course = (await pb("/api/collections/courses/records?perPage=1&filter=" + encodeURIComponent('title = "' + seed.course + '"'))).items[0];
  if (!course) return;
  for (const [kind, a] of [["practica", seed.practice], ["final", seed.final]]) {
    const lesson = (await pb("/api/collections/lessons/records?perPage=1&filter=" + encodeURIComponent('course = "' + course.id + '" && title = "' + a.lessonTitle + '"'))).items[0];
    if (!lesson) continue;
    const has = await pb("/api/collections/assessments/records?perPage=1&filter=" + encodeURIComponent('lesson = "' + lesson.id + '"'));
    if (has.totalItems) continue;
    await pb("/api/collections/assessments/records", {
      method: "POST",
      body: { course: course.id, lesson: lesson.id, kind, title: a.title, passScore: a.passScore, maxAttempts: a.maxAttempts, draft: !!a.draft, questions: a.questions },
    });
    console.log("✓ evaluación cargada:", a.title, "(" + a.questions.length + " preguntas)");
  }
}

const SEED_PROGRAMS = [
  ["Certificación Personal Trainer (CPT)", "certificacion", "La certificación base del entrenador profesional: anatomía, biomecánica, programación y evaluación de clientes."],
  ["Certificación Coach en Nutrición (CNC)", "certificacion", "Nutrición aplicada para acompañar los resultados de tus clientes con criterio profesional."],
  ["Certificación Fuerza y Acondicionamiento (S&C)", "certificacion", "Rendimiento, potencia y periodización para atletas y clientes avanzados."],
  ["Certificación Coaching & Negocio Fitness", "certificacion", "Convertí tu conocimiento en un negocio: captación, ventas y retención de clientes."],
  ["Especialización en Culturismo", "especializacion", "Hipertrofia, preparación de competencia y estrategias de definición."],
  ["Especialización en Instrucción Grupal (GEI)", "especializacion", "Diseñá y dirigí clases grupales seguras, efectivas y con energía."],
  ["Especialización en Ejercicio Correctivo", "especializacion", "Detectá desequilibrios posturales y programá para corregirlos."],
  ["Especialización en Envejecimiento Funcional", "especializacion", "Entrenamiento seguro y efectivo para adultos mayores."],
  ["Paquete Entrenador Élite", "paquete", "La ruta completa para el entrenador que quiere destacarse: certificaciones combinadas."],
  ["Paquete Fitness Coach", "paquete", "Entrenamiento y nutrición en un solo camino profesional."],
];

async function seedPrograms() {
  const existing = await pb("/api/collections/programs/records?perPage=1");
  if (existing.totalItems > 0) return;
  for (const [i, [title, kind, summary]] of SEED_PROGRAMS.entries()) {
    await pb("/api/collections/programs/records", { method: "POST", body: { title, kind, summary, modality: "Online + práctica", published: true, order: i + 1 } });
  }
  console.log("✓ catálogo de certificaciones cargado");
}

// Activa el certificado del curso de regalo si todavía no tiene configuración.
async function seedCourseCert() {
  const r = await pb("/api/collections/courses/records?perPage=50&filter=" + encodeURIComponent('certHours = ""'));
  for (const c of r.items) {
    await pb("/api/collections/courses/records/" + c.id, { method: "PATCH", body: { certEnabled: true, certHours: "Módulo introductorio" } });
  }
}

async function setupAdmin() {
  const found = await pb("/api/collections/users/records?perPage=1&filter=" + encodeURIComponent('email = "' + env.ADMIN_EMAIL + '"'));
  const body = {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    passwordConfirm: env.ADMIN_PASSWORD,
    name: "Administrador InnovaFit",
    role: "admin",
    emailVisibility: true,
    verified: true,
  };
  if (found.items[0]) {
    await pb("/api/collections/users/records/" + found.items[0].id, { method: "PATCH", body });
  } else {
    await pb("/api/collections/users/records", { method: "POST", body });
  }
  console.log("✓ admin listo:", env.ADMIN_EMAIL);
}

const SEED_LESSONS = [
  { section: "Introducción", kind: "image", file: "0. Que vas a aprender_.png", title: "¿Qué vas a aprender?", description: "Un mapa rápido de todo lo que recorre este módulo gratuito antes de arrancar." },
  { section: "Introducción", kind: "video", file: "1. Módulo de inicio.mp4", title: "Módulo de inicio", description: "Arranca acá: contexto, objetivos y cómo aprovechar al máximo tu módulo regalo." },
  { section: "Introducción", kind: "video", file: "2. Tu kit de herramientas para el éxito.mp4", title: "Tu kit de herramientas para el éxito", description: "Los recursos y hábitos que todo futuro entrenador personal necesita desde el día uno." },
  { section: "Biomecánica", kind: "pdf", file: "3. CONCEPTOS DE BIOMECÁNICA.pdf", title: "Conceptos de Biomecánica", description: "Material de lectura base: los fundamentos teóricos antes de pasar a los videos técnicos." },
  { section: "Biomecánica", kind: "video", file: "4. Planos de Movimiento.mp4", title: "Planos de Movimiento", description: "Sagital, frontal y transversal: cómo se mueve realmente el cuerpo humano en el espacio." },
  { section: "Biomecánica", kind: "video", file: "5. Principios de la Biomecánica _.mp4", title: "Principios de la Biomecánica", description: "Las leyes físicas detrás de cada ejercicio que vas a programar como entrenador." },
  { section: "Biomecánica", kind: "audio", file: "6. Anatomical_Reference_Terms_audio.mp3", title: "Términos de Referencia Anatómica", description: "El vocabulario técnico imprescindible para describir cualquier movimiento con precisión." },
  { section: "Biomecánica", kind: "audio", file: "7. Friction_audio.mp3", title: "Fricción", description: "Cómo influye la fricción en el movimiento, el calzado y la estabilidad durante el entrenamiento." },
  { section: "Biomecánica", kind: "audio", file: "8. Laws_of_Motion_audio.mp3", title: "Leyes del Movimiento", description: "Las leyes de Newton aplicadas al entrenamiento de fuerza y rendimiento." },
  { section: "Biomecánica", kind: "audio", file: "9. Muscles_as_Movers_audio.mp3", title: "Los Músculos como Motores del Movimiento", description: "Agonistas, antagonistas y sinergistas: quién hace qué en cada ejercicio." },
  { section: "Biomecánica", kind: "audio", file: "10. Planes_of_Motion_audio.mp3", title: "Planos de Movimiento (audio complementario)", description: "Repaso en formato audio para reforzar lo visto en el video de planos de movimiento." },
  { section: "Biomecánica", kind: "audio", file: "11. Principles_of_Biomechanics_audio.mp3", title: "Principios de la Biomecánica (audio complementario)", description: "Repaso en formato audio de los principios biomecánicos clave." },
  { section: "Aplicación", kind: "pdf", file: "12. Estudio de caso.pdf", title: "Estudio de caso", description: "Aplicá todo lo aprendido a un caso real de un cliente de entrenamiento personal." },
  { section: "Aplicación", kind: "pdf", file: "12.1. Comprobación de conocimientos .pdf", title: "Comprobación de conocimientos", description: "Poné a prueba lo que aprendiste antes de dar el salto a la certificación completa." },
];

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".pdf": "application/pdf" };

async function fileBlob(name) {
  if (!fs.existsSync(env.SEED_MEDIA_DIR)) return null;
  // Los nombres con tilde pueden venir en NFC o NFD según cómo se copiaron: comparamos normalizados.
  const match = fs.readdirSync(env.SEED_MEDIA_DIR).find((f) => f.normalize("NFC") === name.normalize("NFC"));
  if (!match) return null;
  const p = path.join(env.SEED_MEDIA_DIR, match);
  return fs.openAsBlob(p, { type: MIME[path.extname(p).toLowerCase()] || "application/octet-stream" });
}

// Si la carga inicial quedó a medias, completa los adjuntos que falten en el curso de regalo.
async function repairSeedFiles() {
  const gift = await pb("/api/collections/courses/records?perPage=1&filter=" + encodeURIComponent('title = "Fundamentos de Biomecánica"'));
  if (!gift.items[0]) return;
  const lessons = await pb("/api/collections/lessons/records?perPage=200&filter=" + encodeURIComponent('course = "' + gift.items[0].id + '"'));
  for (const l of SEED_LESSONS) {
    const rec = lessons.items.find((x) => x.title === l.title);
    if (!rec || rec.file) continue;
    const blob = await fileBlob(l.file);
    if (!blob) continue;
    const f = new FormData();
    f.set("file", blob, l.file);
    await pb("/api/collections/lessons/records/" + rec.id, { method: "PATCH", form: f });
    console.log("✓ adjunto completado:", l.title);
  }
}

async function seedCourse() {
  const existing = await pb("/api/collections/courses/records?perPage=1");
  if (existing.totalItems > 0) {
    console.log("• ya hay cursos cargados, no se repite la carga inicial");
    await repairSeedFiles();
    return;
  }

  const form = new FormData();
  form.set("title", "Fundamentos de Biomecánica");
  form.set("subtitle", "Módulo de regalo de la Certificación Doble de Entrenador Personal InnovaFit");
  form.set("description", "<p>El punto de partida de la <b>Certificación Doble de Entrenador Personal InnovaFit</b>: planos de movimiento, palancas, leyes del movimiento y cómo trabajan los músculos en cada ejercicio.</p>");
  form.set("published", "true");
  form.set("isGift", "true");
  form.set("order", "1");
  const cover = await fileBlob("0. Que vas a aprender_.png");
  if (cover) form.set("cover", cover, "portada.png");
  const course = await pb("/api/collections/courses/records", { method: "POST", form });
  console.log("✓ curso creado:", course.title);

  for (const [i, l] of SEED_LESSONS.entries()) {
    const f = new FormData();
    f.set("course", course.id);
    f.set("title", l.title);
    f.set("section", l.section);
    f.set("description", l.description);
    f.set("kind", l.kind);
    f.set("order", String(i + 1));
    const blob = await fileBlob(l.file);
    if (blob) f.set("file", blob, l.file);
    else console.warn("  ! no encontré el archivo, la lección queda sin adjunto:", l.file);
    process.stdout.write("  subiendo " + (i + 1) + "/" + SEED_LESSONS.length + " " + l.title + (blob ? " (" + Math.round(blob.size / 1048576) + " MB)" : "") + "… ");
    await pb("/api/collections/lessons/records", { method: "POST", form: f });
    console.log("ok");
  }
}

(async () => {
  if (!fs.existsSync(env.PB_BIN)) throw new Error("No encuentro PocketBase en " + env.PB_BIN);

  execFileSync(env.PB_BIN, ["superuser", "upsert", env.SUPERUSER_EMAIL, env.SUPERUSER_PASSWORD, "--dir=" + env.PB_DIR], { stdio: "inherit" });

  let child = null;
  try {
    await waitHealthy(1500);
  } catch {
    child = spawn(env.PB_BIN, ["serve", "--http=" + new URL(env.PB_URL).host, "--dir=" + env.PB_DIR], { stdio: "ignore" });
    await waitHealthy();
  }

  try {
    await setupCollections();
    await setupAdmin();
    await seedCourse();
    await seedCourseCert();
    await seedPrograms();
    await migrate();
    await seedAssessments();
    console.log("\nListo. Arrancá con `npm start` y entrá a http://localhost:" + env.PORT + "/admin");
    console.log("Usuario admin: " + env.ADMIN_EMAIL + " · contraseña: la de ADMIN_PASSWORD en .env");
  } finally {
    if (child) child.kill();
  }
})().catch((e) => {
  console.error("\n✗ " + e.message + (e.data ? "\n" + JSON.stringify(e.data, null, 2) : ""));
  process.exit(1);
});
