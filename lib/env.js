// Carga .env (si existe) y expone la configuración compartida por server, start y setup.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");

if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const isWin = process.platform === "win32";

module.exports = {
  ROOT,
  ENV_FILE,
  PORT: Number(process.env.PORT || 3100),
  PB_URL: (process.env.PB_URL || "http://127.0.0.1:8090").replace(/\/$/, ""),
  PB_BIN: process.env.PB_BIN || path.join(ROOT, "pocketbase", isWin ? "pocketbase.exe" : "pocketbase"),
  PB_DIR: process.env.PB_DIR || path.join(ROOT, "pocketbase", "pb_data"),
  // Si PocketBase corre aparte (otro servicio/contenedor), poné EXTERNAL_PB=1 y start.js no lo lanza.
  EXTERNAL_PB: process.env.EXTERNAL_PB === "1",
  SUPERUSER_EMAIL: process.env.PB_SUPERUSER_EMAIL,
  SUPERUSER_PASSWORD: process.env.PB_SUPERUSER_PASSWORD,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  WA_NUMBER: process.env.WA_NUMBER || "5213223208254",
  SEED_MEDIA_DIR: path.resolve(ROOT, process.env.SEED_MEDIA_DIR || ".."),
};
