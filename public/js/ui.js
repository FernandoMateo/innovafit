// Utilidades compartidas por campus y admin.
(function(){
  "use strict";

  // El admin guarda su sesión aparte: entrar al campus como alumno en otra pestaña
  // no le cambia la cuenta al panel (antes compartían "pocketbase_auth").
  const LocalAuthStore = new PocketBase(location.origin + "/pb").authStore.constructor;
  const pb = new PocketBase(location.origin + "/pb", /^\/admin/.test(location.pathname) ? new LocalAuthStore("innovafit_admin_auth") : undefined);
  pb.autoCancellation(false);

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // Confirmación en el centro de la pantalla: check animado, partículas y cierre automático.
  let noticeTimer;
  function notify({type = "success", title, text = "", duration} = {}){
    document.querySelector(".notice")?.remove();
    clearTimeout(noticeTimer);
    const ms = duration || (type === "error" ? 3800 : 2200);
    const icon = type === "error"
      ? '<path class="draw" d="M16 16l20 20M36 16L16 36"/>'
      : '<path class="draw" d="M14 27l8 8 17-18"/>';
    const n = document.createElement("div");
    n.className = "notice notice-" + type;
    n.setAttribute("role", type === "error" ? "alert" : "status");
    n.innerHTML = `<div class="notice-scrim"></div>
      <div class="notice-card">
        <div class="notice-burst">${Array.from({length:12}, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join("")}</div>
        <div class="notice-icon"><svg viewBox="0 0 52 52"><circle class="ring" cx="26" cy="26" r="23"/>${icon}</svg></div>
        <h3>${esc(title)}</h3>
        ${text ? `<p>${esc(text)}</p>` : ""}
        <div class="notice-bar"><i style="animation-duration:${ms}ms"></i></div>
      </div>`;
    const close = () => {
      if(!n.isConnected) return;
      n.classList.add("out");
      setTimeout(() => n.remove(), 260);
    };
    n.addEventListener("click", close);
    document.body.appendChild(n);
    noticeTimer = setTimeout(close, ms);
  }

  // Compatibilidad: toast(mensaje, esError) usa el modal central.
  function toast(msg, isError){
    notify({type: isError ? "error" : "success", title: isError ? "Ups, algo falló" : msg, text: isError ? msg : ""});
  }

  // Mensaje legible a partir de un error del SDK de PocketBase.
  function errMsg(err){
    if(!err) return "Algo salió mal.";
    const data = err.response && err.response.data;
    if(data && typeof data === "object"){
      const first = Object.entries(data)[0];
      if(first && first[1] && first[1].message) return first[0] + ": " + first[1].message;
    }
    if(err.status === 0) return "No hay conexión con el servidor.";
    if(err.status === 403) return "No tenés permiso para hacer eso.";
    return (err.response && err.response.message) || err.message || "Algo salió mal.";
  }

  function fileUrl(record, name, thumb){
    if(!name) return "";
    return pb.files.getURL(record, name, thumb ? {thumb} : undefined);
  }

  // Convierte links de YouTube / Vimeo a su versión embebible.
  function embedUrl(url){
    if(!url) return "";
    let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    if(m) return "https://www.youtube.com/embed/" + m[1];
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if(m) return "https://player.vimeo.com/video/" + m[1];
    return url;
  }

  const KIND_LABEL = {video:"Video", audio:"Audio", pdf:"PDF", image:"Imagen", embed:"Video externo", text:"Lectura", quiz:"Comprobación", exam:"Examen final"};
  const KIND_ICON = {video:"▶", audio:"♪", pdf:"▤", image:"▣", embed:"▶", text:"¶", quiz:"?", exam:"★"};

  // Ajustes públicos (campaña comercial y sello del certificado). Se piden una sola vez.
  let settingsP = null;
  function settings(force){
    if(!settingsP || force){
      settingsP = pb.collection("settings").getList(1, 1).then((r) => r.items[0] || {}).catch(() => ({}));
      settingsP.then((s) => { if(window.Cert && s.sealLogo) Cert.setSeal(fileUrl(s, s.sealLogo)); });
    }
    return settingsP;
  }

  // Llamadas a los endpoints propios del servidor con la sesión actual.
  async function api(path, body){
    const r = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {"content-type":"application/json", Authorization: pb.authStore.token || ""},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if(!r.ok) throw Object.assign(new Error(data.message || "Error " + r.status), {status: r.status, data});
    return data;
  }

  // Números que cuentan hacia arriba al aparecer.
  function countUp(el, to, ms = 1100){
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const suffix = el.dataset.suffix || "";
    if(reduce){ el.textContent = to + suffix; return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
      if(p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  window.UI = {pb, esc, toast, notify, api, countUp, errMsg, fileUrl, embedUrl, settings, KIND_LABEL, KIND_ICON};
})();
