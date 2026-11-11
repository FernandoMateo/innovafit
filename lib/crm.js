// Envío de cada inscripción de la landing al CRM.
//  - Kommo (amoCRM): KOMMO_SUBDOMAIN + KOMMO_TOKEN (token de larga duración de una integración privada).
//    Crea el lead con su contacto (nombre, WhatsApp, correo), etiquetas y una nota con todo el formulario.
//    KOMMO_PIPELINE_ID y KOMMO_STATUS_ID son opcionales (embudo y etapa donde entra).
//  - Cualquier otro CRM / Zapier / Make: CRM_WEBHOOK_URL recibe el lead completo en JSON (POST).
// Sin configuración devuelve {status:"omitido"} y la inscripción queda igual guardada en el campus.
require("./env"); // carga .env antes de leer las variables

const SUB = (process.env.KOMMO_SUBDOMAIN || "").replace(/\.kommo\.com.*$/i, "").trim();
const TOKEN = process.env.KOMMO_TOKEN || "";
const PIPELINE = +process.env.KOMMO_PIPELINE_ID || 0;
const STAGE = +process.env.KOMMO_STATUS_ID || 0;
const WEBHOOK = process.env.CRM_WEBHOOK_URL || "";

function mode() {
  if (SUB && TOKEN) return "kommo";
  if (WEBHOOK) return "webhook";
  return null;
}

async function kommo(path, body) {
  const r = await fetch("https://" + SUB + ".kommo.com" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("Kommo " + r.status + ": " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

function noteText(l) {
  return [
    "Inscripción desde la landing " + (l.promotionName || "Buen Fin"),
    "Programa de interés: " + (l.programTitle || "—"),
    "¿Trabaja como entrenador?: " + (l.isTrainer || "—"),
    "País / ciudad: " + [l.countryName, l.city].filter(Boolean).join(" / "),
    "Qué información necesita: " + (l.infoNeeded || "—"),
    "UTM: " + ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((k) => k + "=" + (l[k] || "")).join(" · "),
    "Folio campus: " + l.id,
  ].join("\n");
}

// lead: registro de promo_leads (más promotionName). Devuelve {status, id?, error?}.
async function push(lead) {
  const m = mode();
  if (!m) return { status: "omitido" };
  try {
    if (m === "webhook") {
      const r = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "lead.created", source: "innovafit-buen-fin", lead }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error("Webhook " + r.status);
      return { status: "enviado" };
    }
    const phone = "+" + String(lead.country || "") + String(lead.phone || "");
    const item = {
      name: (lead.promotionName || "Buen Fin") + " · " + (lead.programTitle || "Información") + " · " + lead.name,
      _embedded: {
        tags: [{ name: "BuenFin2026" }, { name: "Landing" }, ...(lead.utm_source ? [{ name: "utm:" + lead.utm_source }] : [])],
        contacts: [
          {
            name: lead.name,
            custom_fields_values: [
              { field_code: "PHONE", values: [{ value: phone, enum_code: "MOB" }] },
              { field_code: "EMAIL", values: [{ value: lead.email, enum_code: "WORK" }] },
            ],
          },
        ],
      },
    };
    if (PIPELINE) item.pipeline_id = PIPELINE;
    if (STAGE) item.status_id = STAGE;
    const res = await kommo("/api/v4/leads/complex", [item]);
    const id = res && res[0] && res[0].id;
    if (id) await kommo("/api/v4/leads/" + id + "/notes", [{ note_type: "common", params: { text: noteText(lead) } }]).catch((e) => console.error("[crm note]", e.message));
    return { status: "enviado", id: id ? String(id) : "" };
  } catch (e) {
    console.error("[crm]", e.message);
    return { status: "error", error: e.message.slice(0, 400) };
  }
}

module.exports = { push, mode };
