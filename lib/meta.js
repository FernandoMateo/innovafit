// Meta Conversions API (CAPI): manda del lado del servidor los mismos eventos que el Pixel del
// navegador, con el mismo event_id, para que Meta los deduplique y no cuente dos veces.
// Se activa con META_PIXEL_ID + META_CAPI_TOKEN en .env. Sin esas variables no hace nada.
require("./env"); // carga .env antes de leer las variables
const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID || "";
const TOKEN = process.env.META_CAPI_TOKEN || "";
const TEST_CODE = process.env.META_TEST_EVENT_CODE || "";
const API = "https://graph.facebook.com/v21.0/";

const sha = (v) => (v ? crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex") : undefined);
const norm = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// Códigos de país de WhatsApp → ISO-3166 (lo que pide Meta en user_data.country).
const ISO = { 52: "mx", 54: "ar", 57: "co", 56: "cl", 51: "pe", 593: "ec", 1: "us", 507: "pa", 34: "es", 58: "ve", 502: "gt", 506: "cr", 598: "uy", 591: "bo", 595: "py", 503: "sv", 504: "hn", 505: "ni" };

function enabled() {
  return !!(PIXEL_ID && TOKEN);
}

// lead: {email, country, phone, name, city, fbp, fbc, ip, ua}
function userData(lead) {
  const [first, ...rest] = String(lead.name || "").trim().split(/\s+/);
  const u = {
    em: lead.email ? [sha(lead.email)] : undefined,
    ph: lead.phone ? [sha(String(lead.country || "") + String(lead.phone))] : undefined,
    fn: first ? [sha(norm(first))] : undefined,
    ln: rest.length ? [sha(norm(rest.join("")))] : undefined,
    ct: lead.city ? [sha(norm(lead.city))] : undefined,
    country: ISO[lead.country] ? [sha(ISO[lead.country])] : undefined,
    external_id: lead.id ? [sha(lead.id)] : undefined,
    client_ip_address: lead.ip || undefined,
    client_user_agent: lead.ua || undefined,
    fbp: lead.fbp || undefined,
    fbc: lead.fbc || undefined,
  };
  Object.keys(u).forEach((k) => u[k] === undefined && delete u[k]);
  return u;
}

// Devuelve true si Meta aceptó el evento. Nunca lanza: un fallo de Meta no debe romper el formulario.
async function send(eventName, { eventId, lead, url, custom } = {}) {
  if (!enabled()) return false;
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: url || undefined,
        user_data: userData(lead || {}),
        custom_data: custom || undefined,
      },
    ],
  };
  if (TEST_CODE) body.test_event_code = TEST_CODE;
  try {
    const r = await fetch(API + PIXEL_ID + "/events?access_token=" + encodeURIComponent(TOKEN), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("[capi]", eventName, r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (e) {
    console.error("[capi]", eventName, e.message);
    return false;
  }
}

module.exports = { send, enabled, PIXEL_ID };
