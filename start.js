// Arranca PocketBase (salvo EXTERNAL_PB=1) y después el servidor web.
const { spawn } = require("child_process");
const fs = require("fs");
const env = require("./lib/env");
const { waitHealthy } = require("./lib/pb");

function startPocketBase() {
  if (!fs.existsSync(env.PB_BIN)) {
    console.error("No encuentro PocketBase en " + env.PB_BIN + ". Descargalo de https://pocketbase.io/docs/ y ponelo en /pocketbase.");
    process.exit(1);
  }
  const { host } = new URL(env.PB_URL);
  const child = spawn(env.PB_BIN, ["serve", "--http=" + host, "--dir=" + env.PB_DIR], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code) => {
    console.error("PocketBase se cerró (código " + code + ").");
    process.exit(code || 1);
  });
  const stop = () => {
    child.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  return child;
}

module.exports = { startPocketBase };

if (require.main === module) {
  (async () => {
    if (!fs.existsSync(env.ENV_FILE)) {
      console.error("Falta .env. Corré primero `npm run setup`.");
      process.exit(1);
    }
    if (!env.EXTERNAL_PB) startPocketBase();
    await waitHealthy();
    await require("./server").listen();
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
