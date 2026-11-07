// Cliente mínimo de la API REST de PocketBase autenticado como superusuario.
// Solo lo usa el servidor (nunca llega al navegador).
const env = require("./env");

let token = null;

async function auth() {
  if (!env.SUPERUSER_EMAIL || !env.SUPERUSER_PASSWORD) {
    throw new Error("Faltan PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD en .env (corré `npm run setup`).");
  }
  const r = await fetch(env.PB_URL + "/api/collections/_superusers/auth-with-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: env.SUPERUSER_EMAIL, password: env.SUPERUSER_PASSWORD }),
  });
  if (!r.ok) throw new Error("No se pudo autenticar el superusuario de PocketBase (" + r.status + ").");
  token = (await r.json()).token;
  tokenExp = jwtExp(token);
}

// PocketBase NO responde 401 cuando el token venció: lo ignora y trata la petición como
// anónima (403 "Only superusers…" o 400 "Failed to create record."). Por eso renovamos
// la sesión antes de que venza en vez de esperar un 401.
let tokenExp = 0;
function jwtExp(t) {
  try {
    const payload = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8"));
    return (payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

async function pb(path, { method = "GET", body, form } = {}) {
  // Renueva si no hay token o si vence en menos de 10 minutos (o no se pudo leer el vencimiento).
  if (!token || Date.now() > tokenExp - 10 * 60 * 1000) await auth();
  const send = () =>
    fetch(env.PB_URL + path, {
      method,
      headers: form ? { Authorization: token } : { Authorization: token, "content-type": "application/json" },
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  let r = await send();
  // 401, o 403 por token invalidado (p. ej. cambió la contraseña del superusuario): reintenta una vez.
  if (r.status === 401 || r.status === 403) {
    await auth();
    r = await send();
  }
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const err = new Error((data && data.message) || r.statusText);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Escapa un valor para usarlo dentro de un filtro de PocketBase entre comillas dobles.
function q(value) {
  return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

async function waitHealthy(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(env.PB_URL + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error("PocketBase no respondió en " + env.PB_URL);
}

module.exports = { pb, q, waitHealthy };
