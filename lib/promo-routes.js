// Landing de promociones (/buen-fin) y su módulo de Inscripciones.
//  GET  /api/promo/active                 contenido público de la promoción vigente
//  POST /api/promo/leads                  formulario "Solicitar información" → promo_leads + CRM + CAPI Lead
//  POST /api/promo/checkout               "Comprar mi certificación" → lead en_checkout + CAPI InitiateCheckout
//  POST /api/promo/payment                webhook de la pasarela (firmado) → pagado + CAPI Purchase
//  GET  /api/promo/orders/:id             página de gracias: ¿ya se confirmó el pago?
//  POST /api/promo/orders/:id/pixel       la página de gracias avisa que ya disparó el Pixel Purchase
//  POST /api/admin/promo-leads/:id/paid   el equipo confirma un pago validado (dispara Purchase)
//  POST /api/admin/promo-leads/:id/crm    reintentar el envío al CRM
//  GET  /api/admin/promo/integrations     qué integraciones están configuradas
const crypto = require("crypto");
const path = require("path");
const express = require("express");
const env = require("./env");
const { pb, q } = require("./pb");
const meta = require("./meta");
const crm = require("./crm");

const PAY_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";
const EMAIL_RE = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]{2,}$/;
const clean = (v, max) => String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, max);
const nowPb = () => new Date().toISOString().replace("T", " ");
const pbDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);
const fileUrl = (rec, name, thumb) => (name ? "/pb/api/files/" + rec.collectionId + "/" + rec.id + "/" + encodeURIComponent(name) + (thumb ? "?thumb=" + thumb : "") : "");
const isTeam = (u) => u && (u.role === "admin" || u.role === "agent");
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

// Estado real según las fechas: "programada" se activa sola al llegar startsAt y todo vence en endsAt.
function effectiveStatus(p, now = Date.now()) {
  const s = pbDate(p.startsAt), e = pbDate(p.endsAt);
  if (p.status === "finalizada" || (e && e <= now)) return "finalizada";
  if (s && s > now) return "programada";
  if (p.status === "programada" && !s) return "programada";
  return "activa";
}

function embedUrl(url) {
  if (!url) return "";
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return "https://www.youtube-nocookie.com/embed/" + m[1] + "?rel=0&modestbranding=1";
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return "https://player.vimeo.com/video/" + m[1] + "?dnt=1";
  return "";
}

async function pickPromotion(preview) {
  const all = (await pb("/api/collections/promotions/records?perPage=50&sort=-landing,-startsAt,-created&expand=" + encodeURIComponent("programs,demoLesson"))).items;
  const rank = (p) => {
    const st = effectiveStatus(p);
    return (st === "activa" ? 0 : st === "programada" ? 2 : 4) + (p.landing ? 0 : 1);
  };
  const sorted = all.slice().sort((a, b) => rank(a) - rank(b));
  return sorted[0] || null;
}

const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const promoUrl = (p) => "/promo/" + (p.slug || slugify(p.name) || p.id);

// Promoción por su slug (landing propia /promo/<slug>). También acepta el id.
async function promotionBySlug(slug) {
  const s = String(slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
  if (!s) return null;
  const f = "slug = " + q(s) + (/^[a-z0-9]{15}$/.test(s) ? " || id = " + q(s) : "");
  return (await pb("/api/collections/promotions/records?perPage=1&expand=" + encodeURIComponent("programs,demoLesson") + "&filter=" + encodeURIComponent(f))).items[0] || null;
}

// Promoción a la que pertenece un envío: la que mandó la landing (si sigue vigente) o la destacada.
async function promotionFor(id) {
  if (/^[a-z0-9]{15}$/.test(String(id || ""))) {
    const p = await pb("/api/collections/promotions/records/" + id).catch(() => null);
    if (p && effectiveStatus(p) !== "finalizada") return p;
  }
  return pickPromotion(false);
}

function publicPayload(p, preview) {
  const progs = (p.expand && p.expand.programs) || [];
  const byId = new Map(progs.map((x) => [x.id, x]));
  const items = Array.isArray(p.items) && p.items.length ? p.items : progs.map((x) => ({ program: x.id }));
  const programs = items
    .map((it) => {
      const x = byId.get(it.program);
      if (!x) return null;
      return {
        id: x.id,
        title: x.title,
        kind: x.kind || "",
        summary: x.summary || "",
        duration: x.duration || "",
        modality: x.modality || "",
        image: fileUrl(x, x.image, "640x360"),
        imageFull: fileUrl(x, x.image),
        photo: fileUrl(x, x.photo),
        highlights: String(x.highlights || "").split("\n").map((s) => s.trim()).filter(Boolean),
        objective: x.objective || "",
        audience: String(x.audience || "").split("\n").map((s) => s.trim()).filter(Boolean),
        modules: Array.isArray(x.modules) ? x.modules.map((m) => ({ title: m.title || "", topics: String(m.topics || "").split("\n").map((s) => s.trim()).filter(Boolean) })) : [],
        resources: String(x.resources || "").split("\n").map((s) => s.trim()).filter(Boolean),
        profile: x.profile || "",
        brochure: fileUrl(x, x.brochure),
        pct: Math.max(0, Math.min(90, +it.pct || 0)),
        finalPrice: +it.finalPrice || 0,
        priceBefore: +it.priceBefore || 0,
        accreditation: clean(it.accreditation, 400),
      };
    })
    .filter(Boolean);

  const lesson = p.expand && p.expand.demoLesson;
  let video = null;
  const ext = embedUrl(p.demoVideoUrl);
  if (ext) video = { type: "embed", url: ext };
  else if (lesson && lesson.file && lesson.kind === "video") video = { type: "file", url: fileUrl(lesson, lesson.file), title: lesson.title };
  else if (lesson && lesson.kind === "embed" && embedUrl(lesson.url)) video = { type: "embed", url: embedUrl(lesson.url), title: lesson.title };

  return {
    preview: !!preview,
    promo: {
      id: p.id,
      name: p.name,
      url: promoUrl(p),
      bannerTitle: p.bannerTitle || p.name,
      startsAt: p.startsAt || "",
      endsAt: p.endsAt || "",
      status: effectiveStatus(p),
      currency: (p.currency || "USD").trim(),
      maxPct: Math.max(0, ...programs.map((x) => x.pct)),
      minPct: programs.some((x) => x.pct) ? Math.min(...programs.filter((x) => x.pct).map((x) => x.pct)) : 0,
      conditions: p.conditions || "",
      checkout: !!p.checkoutUrl,
      mentorships: (Array.isArray(p.mentorships) ? p.mentorships : []).filter((m) => m && m.visible !== false).map((m) => ({
        title: clean(m.title, 120), period: clean(m.period, 80), schedule: clean(m.schedule, 160), zoomUrl: /^https:\/\//.test(m.zoomUrl || "") ? m.zoomUrl : "", text: String(m.text || "").slice(0, 1500),
      })),
      faq: (Array.isArray(p.faq) ? p.faq : []).filter((f) => f && f.q && f.a).map((f) => ({ q: String(f.q).slice(0, 300), a: String(f.a).slice(0, 3000) })),
      institutional: p.institutional || "",
      video,
    },
    programs,
    waNumber: env.WA_NUMBER,
    pixelId: meta.PIXEL_ID,
  };
}

// Caché corta por promoción: la landing recibe tráfico de anuncios y el contenido cambia poco.
const cache = new Map();
function bust() { cache.clear(); }
const cached = (key) => { const c = cache.get(key); return c && Date.now() - c.at < 30000 ? c.data : null; };

function reqLead(req) {
  return { ip: req.ip, ua: clean(req.get("user-agent"), 400) };
}

// Límite por IP propio de la landing (independiente del de registro).
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.path + "|" + req.ip;
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ message: "Recibimos muchos envíos seguidos. Esperá unos minutos e intentá de nuevo." });
    list.push(now);
    hits.set(key, list);
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// Valida los datos de contacto comunes al formulario y al checkout.
function readContact(b, full) {
  const data = {
    name: clean(b.name, 120),
    email: clean(b.email, 160).toLowerCase(),
    country: String(b.country || "").replace(/\D/g, "").slice(0, 4),
    phone: String(b.phone || "").replace(/\D/g, "").slice(0, 15),
    countryName: clean(b.countryName, 60),
    city: clean(b.city, 80),
    isTrainer: b.isTrainer === "si" || b.isTrainer === "no" ? b.isTrainer : "",
    infoNeeded: String(b.infoNeeded || "").trim().slice(0, 1500),
    eventId: String(b.eventId || "").replace(/[^\w.-]/g, "").slice(0, 60),
    fbp: clean(b.fbp, 200),
    fbc: clean(b.fbc, 300),
    landingUrl: clean(b.landingUrl, 1000),
    referrer: clean(b.referrer, 1000),
  };
  const utm = b.utm && typeof b.utm === "object" ? b.utm : {};
  for (const k of UTM) data[k] = clean(utm[k], 200);
  let error = null;
  if (data.name.length < 5 || !data.name.includes(" ")) error = "Escribe tu nombre y apellido completos.";
  else if (data.phone.length < 7 || !data.country) error = "Revisa tu número de WhatsApp.";
  else if (!EMAIL_RE.test(data.email)) error = "Revisa tu correo.";
  else if (full && data.city.length < 2) error = "Cuéntanos tu país y ciudad.";
  else if (full && !data.isTrainer) error = "Cuéntanos si ya trabajas como entrenador.";
  else if (b.consent !== true) error = "Para continuar, acepta el aviso de privacidad.";
  return { data, error };
}

async function sendToCrm(lead, promotionName) {
  const r = await crm.push({ ...lead, promotionName });
  await pb("/api/collections/promo_leads/records/" + lead.id, {
    method: "PATCH",
    body: { crmStatus: r.status, crmId: r.id || lead.crmId || "", crmError: r.error || "" },
  }).catch((e) => console.error("[crm patch]", e.message));
  return r;
}

async function markPaid(lead, { amount, currency, payRef, via }) {
  if (lead.status === "pagado") return lead;
  const patch = {
    status: "pagado",
    paidAt: nowPb(),
    paidAmount: Math.max(0, Math.round((+amount || 0) * 100) / 100),
    currency: clean(currency || lead.currency || "USD", 6).toUpperCase(),
    payRef: clean(payRef, 200),
    paidVia: via,
  };
  const out = await pb("/api/collections/promo_leads/records/" + lead.id, { method: "PATCH", body: patch });
  // Purchase SOLO acá: con el pago confirmado. Mismo event_id que el Pixel de la página de gracias.
  if (!lead.purchaseSentAt) {
    const sent = await meta.send("Purchase", {
      eventId: "pur-" + lead.id,
      lead, // el webhook no trae IP/UA del comprador: Meta empareja por correo, teléfono, fbp y fbc
      url: lead.landingUrl,
      custom: { value: patch.paidAmount, currency: patch.currency, content_name: lead.programTitle, content_ids: lead.program ? [lead.program] : undefined, content_type: "product" },
    });
    if (sent) await pb("/api/collections/promo_leads/records/" + lead.id, { method: "PATCH", body: { purchaseSentAt: nowPb() } }).catch(() => {});
  }
  return out;
}

module.exports = function promoRoutes(app, { authUser }) {
  app.get("/api/promo/active", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      let preview = false;
      if (req.query.preview === "1") {
        const u = await authUser(req).catch(() => null);
        preview = isTeam(u);
      }
      const slug = String(req.query.slug || "");
      const key = "active:" + slug;
      if (!preview && cached(key)) return res.json(cached(key));
      const p = slug ? await promotionBySlug(slug) : await pickPromotion(preview);
      if (!p) {
        if (slug) return res.status(404).json({ message: "Esa promoción no existe." });
        return res.json({ promo: null, programs: [], waNumber: env.WA_NUMBER, pixelId: meta.PIXEL_ID });
      }
      const data = publicPayload(p, preview);
      if (!preview) cache.set(key, { at: Date.now(), data });
      res.json(data);
    } catch (err) {
      console.error("[promo active]", err.status || "", err.message);
      res.status(500).json({ message: "No pudimos cargar la promoción." });
    }
  });

  // Promociones vigentes (activas y próximas) para el campus. Cada una con el link a su landing.
  app.get("/api/promo/list", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (cached("list")) return res.json(cached("list"));
      const all = (await pb("/api/collections/promotions/records?perPage=50&sort=-landing,startsAt,-created&expand=programs")).items;
      const items = all
        .map((p) => ({ p, st: effectiveStatus(p) }))
        .filter((x) => x.st !== "finalizada")
        .sort((a, b) => (a.st === "activa" ? 0 : 1) - (b.st === "activa" ? 0 : 1))
        .map(({ p }) => {
          const d = publicPayload(p, false);
          const img = d.programs.find((x) => x.image);
          return {
            id: p.id, name: p.name, bannerTitle: d.promo.bannerTitle, url: d.promo.url, status: d.promo.status,
            startsAt: p.startsAt || "", endsAt: p.endsAt || "", maxPct: d.promo.maxPct, minPct: d.promo.minPct,
            image: img ? img.image : "",
            programs: d.programs.map((x) => ({ title: x.title, pct: x.pct })),
          };
        });
      const data = { items };
      cache.set("list", { at: Date.now(), data });
      res.json(data);
    } catch (err) {
      console.error("[promo list]", err.status || "", err.message);
      res.status(500).json({ message: "No pudimos cargar las promociones." });
    }
  });

  // Landing propia de cada promoción: la misma página, que lee el slug de la URL.
  app.get("/promo/:slug", (req, res) => res.sendFile(path.join(env.ROOT, "public", "buen-fin.html")));

  app.post("/api/promo/leads", express.json({ limit: "16kb" }), limit(6, 10 * 60e3), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ id: "ok", eventId: "", duplicate: true }); // trampa para bots
    const { data, error } = readContact(b, true);
    if (error) return res.status(400).json({ message: error });
    try {
      const promo = await promotionFor(b.promotion);
      let program = null;
      if (b.program) program = await pb("/api/collections/programs/records/" + encodeURIComponent(String(b.program))).catch(() => null);

      // Doble clic o reenvío: mismo event_id, o mismo correo + programa en los últimos 15 minutos.
      const since = new Date(Date.now() - 15 * 60e3).toISOString().replace("T", " ");
      const dupFilter = (data.eventId ? "eventId = " + q(data.eventId) + " || " : "") +
        "(email = " + q(data.email) + " && program = " + q(program ? program.id : "") + ' && created >= "' + since + '")';
      const dup = (await pb("/api/collections/promo_leads/records?perPage=1&sort=-created&filter=" + encodeURIComponent(dupFilter))).items[0];
      if (dup) return res.json({ id: dup.id, eventId: dup.eventId, duplicate: true });

      const eventId = data.eventId || "lead-" + crypto.randomUUID();
      const lead = await pb("/api/collections/promo_leads/records", {
        method: "POST",
        body: {
          ...data,
          eventId,
          program: program ? program.id : "",
          programTitle: program ? program.title : clean(b.programTitle, 160) || "Paquete completo",
          promotion: promo ? promo.id : "",
          source: "formulario",
          status: "nuevo",
          consent: true,
          consentAt: nowPb(),
          crmStatus: "pendiente",
          currency: promo ? (promo.currency || "USD") : "USD",
        },
      });
      res.json({ id: lead.id, eventId, duplicate: false });

      // Después de responder: CRM y Conversions API (no hacen esperar al visitante).
      sendToCrm(lead, promo && promo.name);
      meta.send("Lead", { eventId, lead: { ...lead, ...reqLead(req) }, url: data.landingUrl, custom: { content_name: lead.programTitle } });
    } catch (err) {
      console.error("[promo lead]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
      if (!res.headersSent) res.status(500).json({ message: "No pudimos guardar tus datos. Intenta de nuevo en un momento o escríbenos por WhatsApp." });
    }
  });

  app.post("/api/promo/checkout", express.json({ limit: "16kb" }), limit(10, 10 * 60e3), async (req, res) => {
    const b = req.body || {};
    const { data, error } = readContact(b, false);
    if (error) return res.status(400).json({ message: error });
    try {
      const promo = await promotionFor(b.promotion);
      if (!promo || effectiveStatus(promo) !== "activa") return res.status(400).json({ message: "La promoción no está activa en este momento. Déjanos tus datos y te avisamos." });
      let program = null;
      if (b.program) program = await pb("/api/collections/programs/records/" + encodeURIComponent(String(b.program))).catch(() => null);

      // Reutiliza la inscripción abierta de la misma persona en esta promoción.
      let lead = (await pb("/api/collections/promo_leads/records?perPage=1&sort=-created&filter=" + encodeURIComponent(
        "email = " + q(data.email) + " && promotion = " + q(promo.id) + ' && status != "pagado" && status != "descartado"'))).items[0];
      const isNew = !lead;
      const base = { ...data, program: program ? program.id : lead ? lead.program : "", programTitle: program ? program.title : lead ? lead.programTitle : "Paquete completo" };
      delete base.eventId;
      if (lead) {
        lead = await pb("/api/collections/promo_leads/records/" + lead.id, {
          method: "PATCH",
          body: { ...base, isTrainer: base.isTrainer || lead.isTrainer, city: base.city || lead.city, infoNeeded: lead.infoNeeded, status: "en_checkout", checkoutAt: lead.checkoutAt || nowPb() },
        });
      } else {
        lead = await pb("/api/collections/promo_leads/records", {
          method: "POST",
          body: { ...base, eventId: "lead-" + crypto.randomUUID(), promotion: promo.id, source: "checkout", status: "en_checkout", consent: true, consentAt: nowPb(), checkoutAt: nowPb(), crmStatus: "pendiente", currency: promo.currency || "USD" },
        });
      }
      const eventId = "ic-" + lead.id;
      let url = null;
      if (promo.checkoutUrl) {
        const u = new URL(promo.checkoutUrl);
        u.searchParams.set("ref", lead.id);
        u.searchParams.set("client_reference_id", lead.id);
        u.searchParams.set("prefilled_email", data.email);
        url = u.toString();
      }
      const item = (Array.isArray(promo.items) ? promo.items : []).find((i) => i.program === lead.program);
      res.json({ id: lead.id, eventId, url, value: item ? +item.finalPrice || 0 : 0, currency: promo.currency || "USD" });

      if (isNew) sendToCrm(lead, promo.name);
      if (!lead.checkoutAt || isNew) {
        meta.send("InitiateCheckout", { eventId, lead: { ...lead, ...reqLead(req) }, url: data.landingUrl, custom: { content_name: lead.programTitle, currency: promo.currency || "USD", value: item ? +item.finalPrice || 0 : undefined } });
      }
    } catch (err) {
      console.error("[promo checkout]", err.status || "", err.message, err.data ? JSON.stringify(err.data) : "");
      if (!res.headersSent) res.status(500).json({ message: "No pudimos iniciar la compra. Intenta de nuevo o escríbenos por WhatsApp." });
    }
  });

  // Webhook de la pasarela. Acepta firma HMAC-SHA256 del cuerpo (x-signature) o el secreto en x-webhook-token.
  // Cuerpo esperado (o adaptarlo a la pasarela real): {ref, status:"paid", amount, currency, orderId}
  app.post("/api/promo/payment", express.raw({ type: () => true, limit: "256kb" }), async (req, res) => {
    if (!PAY_SECRET) return res.status(503).json({ message: "Webhook de pago no configurado (PAYMENT_WEBHOOK_SECRET)." });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const sig = String(req.get("x-signature") || "").replace(/^sha256=/, "");
    const token = String(req.get("x-webhook-token") || "");
    const expected = crypto.createHmac("sha256", PAY_SECRET).update(raw).digest("hex");
    const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    if (!(sig && safeEq(sig, expected)) && !(token && safeEq(token, PAY_SECRET))) return res.status(401).json({ message: "Firma inválida." });
    let body;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ message: "JSON inválido." }); }
    const ref = String(body.ref || body.client_reference_id || (body.metadata && body.metadata.ref) || "").slice(0, 20);
    const status = String(body.status || "").toLowerCase();
    if (!/^[a-z0-9]{15}$/.test(ref)) return res.status(400).json({ message: "Falta ref." });
    if (!["paid", "approved", "completed", "complete", "succeeded", "pagado"].includes(status)) return res.json({ ignored: true, status });
    try {
      const lead = await pb("/api/collections/promo_leads/records/" + ref).catch(() => null);
      if (!lead) return res.status(404).json({ message: "No existe esa inscripción." });
      const out = await markPaid(lead, { amount: body.amount, currency: body.currency, payRef: body.orderId || body.id, via: "webhook" });
      res.json({ ok: true, status: out.status });
    } catch (err) {
      console.error("[promo payment]", err.message);
      res.status(500).json({ message: "No se pudo registrar el pago." });
    }
  });

  app.get("/api/promo/orders/:id", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!/^[a-z0-9]{15}$/.test(req.params.id)) return res.status(404).json({ message: "No encontrada." });
    const lead = await pb("/api/collections/promo_leads/records/" + req.params.id + "?expand=promotion").catch(() => null);
    if (!lead) return res.status(404).json({ message: "No encontrada." });
    const paid = lead.status === "pagado";
    res.json({
      paid,
      firstName: String(lead.name || "").split(" ")[0],
      program: lead.programTitle,
      promotionName: (lead.expand && lead.expand.promotion && lead.expand.promotion.name) || "",
      purchase: paid && !lead.purchasePixelAt ? { eventId: "pur-" + lead.id, value: lead.paidAmount || 0, currency: lead.currency || "USD", contentId: lead.program || "" } : null,
    });
  });

  app.post("/api/promo/orders/:id/pixel", async (req, res) => {
    if (!/^[a-z0-9]{15}$/.test(req.params.id)) return res.status(404).end();
    const lead = await pb("/api/collections/promo_leads/records/" + req.params.id).catch(() => null);
    if (lead && lead.status === "pagado" && !lead.purchasePixelAt) {
      await pb("/api/collections/promo_leads/records/" + lead.id, { method: "PATCH", body: { purchasePixelAt: nowPb() } }).catch(() => {});
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/promo-leads/:id/paid", express.json({ limit: "4kb" }), async (req, res) => {
    try {
      const u = await authUser(req);
      if (!isTeam(u)) return res.status(403).json({ message: "Solo el equipo." });
      const lead = await pb("/api/collections/promo_leads/records/" + encodeURIComponent(req.params.id)).catch(() => null);
      if (!lead) return res.status(404).json({ message: "No encontrada." });
      const b = req.body || {};
      if (!(+b.amount > 0)) return res.status(400).json({ message: "Escribe el monto cobrado." });
      res.json(await markPaid(lead, { amount: b.amount, currency: b.currency, payRef: clean(b.payRef, 160) || "validado por " + (u.name || u.email), via: "equipo" }));
    } catch (err) {
      console.error("[promo paid]", err.message);
      res.status(500).json({ message: "No se pudo registrar el pago." });
    }
  });

  app.post("/api/admin/promo-leads/:id/crm", async (req, res) => {
    try {
      const u = await authUser(req);
      if (!isTeam(u)) return res.status(403).json({ message: "Solo el equipo." });
      const lead = await pb("/api/collections/promo_leads/records/" + encodeURIComponent(req.params.id) + "?expand=promotion").catch(() => null);
      if (!lead) return res.status(404).json({ message: "No encontrada." });
      const r = await sendToCrm(lead, lead.expand && lead.expand.promotion && lead.expand.promotion.name);
      if (r.status === "error") return res.status(502).json({ message: "El CRM respondió con error: " + r.error });
      res.json(r);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/promo/integrations", async (req, res) => {
    const u = await authUser(req).catch(() => null);
    if (!isTeam(u)) return res.status(403).json({ message: "Solo el equipo." });
    bust(); // al entrar al admin de promociones, la landing toma los cambios al instante
    res.json({ crm: crm.mode(), capi: meta.enabled(), pixel: !!meta.PIXEL_ID, paymentWebhook: !!PAY_SECRET });
  });

  app.post("/api/admin/promo/refresh", async (req, res) => {
    const u = await authUser(req).catch(() => null);
    if (!isTeam(u)) return res.status(403).json({ message: "Solo el equipo." });
    bust();
    res.json({ ok: true });
  });
};

module.exports.effectiveStatus = effectiveStatus;
