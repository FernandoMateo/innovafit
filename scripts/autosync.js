// Sube cada cambio a GitHub automáticamente: vigila la carpeta, espera unos segundos
// sin cambios, hace commit y push. El VPS lo toma de GitHub en menos de un minuto.
// Uso: npm run autosync   (dejarlo corriendo mientras trabajás)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const QUIET_MS = 4000;
const IGNORE = /(^|[\\/])(\.git|node_modules|pb_data|pb_migrations)([\\/]|$)/;

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

let timer = null;
let running = false;
let pending = false;

function sync() {
  if (running) { pending = true; return; }
  running = true;
  try {
    // Sin trim al inicio: cada línea empieza con 2 caracteres de estado (" M", "??").
    const changes = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).replace(/\s+$/, "");
    if (!changes) return;
    const files = changes.split("\n").map((l) => l.slice(3).trim());
    git("add", "-A");
    const summary = files.slice(0, 3).join(", ") + (files.length > 3 ? " y " + (files.length - 3) + " más" : "");
    git("commit", "-q", "-m", "Actualiza " + summary);
    git("push", "-q", "origin", "main");
    console.log(new Date().toLocaleTimeString() + "  ✓ subido: " + summary);
  } catch (e) {
    console.error(new Date().toLocaleTimeString() + "  ✗ no se pudo subir: " + (e.stderr || e.message).toString().trim());
  } finally {
    running = false;
    if (pending) { pending = false; schedule(); }
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(sync, QUIET_MS);
}

fs.watch(ROOT, { recursive: true }, (event, file) => {
  if (!file || IGNORE.test(file)) return;
  schedule();
});

console.log("Auto-sync activo en " + ROOT);
console.log("Cada cambio se sube a GitHub y el servidor se actualiza solo. Ctrl+C para detener.");
schedule();
