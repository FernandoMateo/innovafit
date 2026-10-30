// Campus del alumno: login, mis cursos, reproductor con progreso, certificados,
// catálogo de certificaciones (consulta por WhatsApp) y perfil editable.
(function(){
  "use strict";
  const {pb, esc, notify, api, errMsg, fileUrl, embedUrl, KIND_LABEL, KIND_ICON} = UI;

  const $ = (id) => document.getElementById(id);
  const view = $("view");
  const ok = (title, text) => notify({type:"success", title, text});
  const fail = (err) => notify({type:"error", title:"Ups, algo falló", text: typeof err === "string" ? err : errMsg(err)});
  let waNumber = "5213223208254";
  fetch("/api/config").then((r) => r.json()).then((c) => { if(c.waNumber) waNumber = c.waNumber; }).catch(() => {});
  const wa = (text) => "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(text);
  const me = () => pb.authStore.record;
  const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  // Cache por sesión
  let courses = null;
  let progress = null; // Map lessonId → registro de progreso
  let certs = null;
  const lessonsByCourse = {};

  /* ---------- Login ---------- */
  function showLogin(){
    $("appView").hidden = true;
    $("loginView").hidden = false;
    const m = location.hash.match(/email=([^&]+)/);
    if(m) $("lEmail").value = decodeURIComponent(m[1]);
    ($("lEmail").value ? $("lPass") : $("lEmail")).focus();
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("lBtn");
    $("lErr").textContent = "";
    btn.disabled = true;
    btn.textContent = "Entrando…";
    try{
      await pb.collection("users").authWithPassword($("lEmail").value.trim().toLowerCase(), $("lPass").value);
      location.hash = "#/";
      boot();
    }catch(err){
      $("lErr").textContent = err.status === 400 ? "Correo o contraseña incorrectos." : errMsg(err);
    }finally{
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });

  $("logout").addEventListener("click", () => {
    pb.authStore.clear();
    courses = progress = certs = null;
    location.hash = "";
    showLogin();
  });

  /* ---------- Modal ---------- */
  function openModal(html, onMount, cls){
    const root = $("modalRoot");
    root.innerHTML = `<div class="modal ${cls || ""}" role="dialog" aria-modal="true"><div class="modal-scrim" data-close></div><div class="card modal-card">${html}</div></div>`;
    const modal = root.firstElementChild;
    modal.addEventListener("click", (e) => { if(e.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("keydown", escClose);
    if(onMount) onMount(modal);
    return modal;
  }
  function closeModal(){ $("modalRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
  function escClose(e){ if(e.key === "Escape") closeModal(); }

  /* ---------- Datos ---------- */
  async function loadBase(){
    if(!courses) courses = await pb.collection("courses").getFullList({sort:"order,created"});
    if(!progress){
      const rows = await pb.collection("progress").getFullList({filter: pb.filter("user = {:u}", {u: me().id}), fields:"id,lesson,course"});
      progress = new Map(rows.map((r) => [r.lesson, r]));
    }
  }
  async function loadCerts(force){
    if(!certs || force) certs = await pb.collection("certificates").getFullList({sort:"-created"});
    return certs;
  }
  async function loadLessons(courseId){
    if(!lessonsByCourse[courseId]){
      lessonsByCourse[courseId] = await pb.collection("lessons").getFullList({filter: pb.filter("course = {:c}", {c: courseId}), sort:"order,created"});
    }
    return lessonsByCourse[courseId];
  }
  function pctFor(lessons){
    if(!lessons || !lessons.length) return 0;
    return Math.round((lessons.filter((l) => progress.has(l.id)).length / lessons.length) * 100);
  }

  function setTab(name){
    const tabs = $("tabs");
    $("tabsRow").hidden = !name;
    if(!name) return;
    tabs.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
    const on = tabs.querySelector("a.on"), pill = tabs.querySelector(".pill");
    if(on){ pill.style.left = on.offsetLeft + "px"; pill.style.width = on.offsetWidth + "px"; }
  }

  function paintAvatar(){
    const u = me();
    const html = u.avatar
      ? `<div class="avatar" style="background-image:url('${fileUrl(u, u.avatar, "100x100")}')"></div>`
      : `<div class="avatar">${esc(initials(u.name || u.email))}</div>`;
    $("topAv").innerHTML = html;
    $("who").textContent = u.name || u.email;
  }

  /* =====================================================
     MIS CURSOS
     ===================================================== */
  async function renderHome(){
    $("burger").hidden = true;
    setTab("cursos");
    const first = (me().name || "").split(" ")[0];
    if(!courses.length){
      view.innerHTML = `<div class="page rise"><div class="card empty">
        <h2>Todavía no tenés cursos</h2>
        <p>Aprobá la evaluación de nivel para desbloquear el curso de regalo, o pedile acceso a tu asesor InnovaFit.</p>
        <a class="btn btn-primary" href="/evaluacion">Hacer la evaluación</a></div></div>`;
      return;
    }
    const lessonLists = await Promise.all(courses.map((c) => loadLessons(c.id)));
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Mis cursos</span>
        <h1>${first ? "Hola, " + esc(first) : "Bienvenido"} <span class="grad-text">💪</span></h1>
        <p>Retomá donde lo dejaste. Al completar cada curso recibís tu certificado InnovaFit.</p></div>
      <div class="grid">${courses.map((c, i) => {
        const pct = pctFor(lessonLists[i]);
        const cover = c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : "";
        return `<a class="card course" style="animation-delay:${i * 70}ms" href="#/c/${c.id}">
          <div class="course-cover" ${cover}></div>
          <div class="course-body">
            <h3>${esc(c.title)}</h3>
            ${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
            <div class="bar-label"><span>${lessonLists[i].length} lecciones${c.certEnabled ? " · 🎓 con certificado" : ""}</span><span>${pct}%</span></div>
            <div class="bar"><i style="width:0" data-w="${pct}"></i></div>
          </div></a>`;
      }).join("")}</div></div>`;
    requestAnimationFrame(() => view.querySelectorAll("[data-w]").forEach((b) => { b.style.width = b.dataset.w + "%"; }));
  }

  function playerHtml(l){
    const src = fileUrl(l, l.file);
    switch(l.kind){
      case "video":
        return src ? `<div class="player"><video controls playsinline preload="metadata" src="${src}"></video></div>` : noMedia();
      case "audio":
        return src ? `<div class="player audio paused"><div class="wave">${"<i></i>".repeat(14)}</div><audio controls preload="metadata" src="${src}"></audio></div>` : noMedia();
      case "pdf":
        return src ? `<div class="player"><iframe class="pdf" src="${src}#view=FitH" title="${esc(l.title)}"></iframe></div>
          <div class="file-alt"><a href="${src}" target="_blank" rel="noopener">Abrir el PDF en otra pestaña ↗</a></div>` : noMedia();
      case "image":
        return src ? `<div class="player"><img src="${src}" alt="${esc(l.title)}"></div>` : noMedia();
      case "embed":
        return l.url ? `<div class="player"><iframe src="${esc(embedUrl(l.url))}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(l.title)}"></iframe></div>` : noMedia();
      default:
        return `<div class="player text"><div class="rich">${l.content || "<p>Sin contenido.</p>"}</div></div>`;
    }
  }
  function noMedia(){ return `<div class="player no-media">Esta lección todavía no tiene contenido cargado.</div>`; }

  async function renderCourse(courseId, lessonId){
    setTab(null);
    const course = courses.find((c) => c.id === courseId);
    if(!course){ location.hash = "#/"; return; }
    const lessons = await loadLessons(courseId);
    if(!lessons.length){
      view.innerHTML = `<div class="page"><div class="card empty"><h2>${esc(course.title)}</h2><p>Este curso todavía no tiene lecciones.</p><a class="btn btn-ghost" href="#/">← Mis cursos</a></div></div>`;
      return;
    }
    let idx = lessons.findIndex((l) => l.id === lessonId);
    if(idx < 0){
      idx = Math.max(0, lessons.findIndex((l) => !progress.has(l.id)));
      location.replace("#/c/" + courseId + "/" + lessons[idx].id);
      return;
    }
    const l = lessons[idx];
    const pct = pctFor(lessons);
    const C = 2 * Math.PI * 24;
    const myCert = pct === 100 && course.certEnabled ? (await loadCerts()).find((c) => c.course === courseId) : null;

    let lastSection = null;
    const sideItems = lessons.map((x, i) => {
      let head = "";
      if((x.section || "") !== lastSection){
        lastSection = x.section || "";
        if(lastSection) head = `<div class="sec-title">${esc(lastSection)}</div>`;
      }
      const done = progress.has(x.id);
      return head + `<a class="lesson-link${x.id === l.id ? " active" : ""}${done ? " done" : ""}" href="#/c/${courseId}/${x.id}">
        <span class="ic">${done ? "✓" : KIND_ICON[x.kind] || "•"}</span>
        <span><span class="lt">${i + 1}. ${esc(x.title)}</span><span class="lk">${KIND_LABEL[x.kind] || ""}${x.duration ? " · " + esc(x.duration) : ""}</span></span></a>`;
    }).join("");

    const isDone = progress.has(l.id);
    const prev = lessons[idx - 1], next = lessons[idx + 1];
    const waText = "Hola InnovaFit! Soy " + (me().name || me().email) + ". Terminé el curso " + course.title + " en el campus y quiero info de la Certificación Doble de Entrenador Personal.";

    view.innerHTML = `<div class="course-view">
      <aside class="side" id="side">
        <div class="side-head">
          <div class="ring"><svg viewBox="0 0 56 56"><circle class="t" cx="28" cy="28" r="24"/><circle class="f" cx="28" cy="28" r="24" stroke-dasharray="${C}" stroke-dashoffset="${C - (pct / 100) * C}"/></svg><span>${pct}%</span></div>
          <div><b>${esc(course.title)}</b><small>${lessons.filter((x) => progress.has(x.id)).length}/${lessons.length} lecciones completas</small></div>
        </div>
        ${sideItems}
      </aside>
      <div class="scrim" id="scrim"></div>
      <section class="stage rise">
        <div class="crumbs"><a href="#/">Mis cursos</a><span>/</span><span>${esc(l.section || course.title)}</span><span>/</span><span>Lección ${idx + 1} de ${lessons.length}</span></div>
        <h1>${esc(l.title)}</h1>
        ${l.description ? `<p class="stage-desc">${esc(l.description)}</p>` : ""}
        ${playerHtml(l)}
        ${l.kind !== "text" && l.content ? `<div class="card notes"><span class="eyebrow">Material de la lección</span><div class="rich">${l.content}</div></div>` : ""}
        <div class="nav-row">
          ${prev ? `<a class="btn btn-ghost" href="#/c/${courseId}/${prev.id}">← Anterior</a>` : "<span></span>"}
          <button class="btn btn-primary btn-complete${isDone ? " done" : ""}" id="completeBtn">${isDone ? "✓ Completada" : "Marcar como completa"}</button>
          ${next ? `<a class="btn btn-ghost" href="#/c/${courseId}/${next.id}">Siguiente →</a>` : "<span></span>"}
        </div>
        ${pct === 100 ? `<div class="finale">
          <span class="eyebrow">🏁 Curso completo</span>
          <h2>Esto fue el <span class="grad-text">calentamiento.</span></h2>
          <p>Terminaste ${esc(course.title)}. La Certificación Doble de Entrenador Personal InnovaFit te lleva de la teoría a tu primer cliente pago, con respaldo nacional e internacional.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${course.certEnabled ? `<button class="btn btn-primary" id="certBtn">${myCert ? "🎓 Ver mi certificado" : "🎓 Obtener mi certificado"}</button>` : ""}
            <a class="btn btn-ghost" target="_blank" rel="noopener" href="${wa(waText)}">Quiero mi certificación →</a>
          </div>
        </div>` : ""}
      </section>
    </div>`;

    $("burger").hidden = false;
    const side = $("side"), scrim = $("scrim");
    $("burger").onclick = () => { side.classList.toggle("open"); scrim.classList.toggle("open"); };
    scrim.onclick = () => { side.classList.remove("open"); scrim.classList.remove("open"); };
    side.querySelector(".active")?.scrollIntoView({block:"center"});

    const audio = view.querySelector("audio");
    if(audio){
      const box = audio.closest(".player");
      audio.addEventListener("play", () => box.classList.remove("paused"));
      audio.addEventListener("pause", () => box.classList.add("paused"));
    }
    const media = view.querySelector("video, audio");
    if(media) media.addEventListener("ended", () => { if(!progress.has(l.id)) toggleDone(l, course, true); });
    $("completeBtn").addEventListener("click", () => toggleDone(l, course));
    $("certBtn")?.addEventListener("click", () => claimCertificate(course));
  }

  async function toggleDone(l, course, goNext){
    const btn = $("completeBtn");
    btn.disabled = true;
    try{
      if(progress.has(l.id)){
        await pb.collection("progress").delete(progress.get(l.id).id);
        progress.delete(l.id);
        route();
        return;
      }
      const rec = await pb.collection("progress").create({user: me().id, lesson: l.id, course: course.id});
      progress.set(l.id, rec);
      const lessons = lessonsByCourse[course.id];
      if(pctFor(lessons) === 100){
        await route();
        if(course.certEnabled) claimCertificate(course, true);
        else ok("¡Curso completado!", "Terminaste " + course.title + ".");
        return;
      }
      ok("¡Lección completada!", "Seguís avanzando 🔥");
      const next = lessons[lessons.indexOf(l) + 1];
      if(goNext && next){ location.hash = "#/c/" + course.id + "/" + next.id; return; }
      route();
    }catch(err){
      fail(err);
      btn.disabled = false;
    }
  }

  // Pide el certificado al servidor (valida que estén todas las lecciones) y lo celebra.
  async function claimCertificate(course, celebrate){
    try{
      const cert = await api("/api/certificates/claim", {course: course.id});
      await loadCerts(true);
      certModal(cert, celebrate);
    }catch(err){ fail(err.message); }
  }

  function certModal(cert, celebrate){
    openModal(`${celebrate ? `<span class="eyebrow">🏆 Curso completado</span><h2 style="margin:10px 0 6px;font-size:clamp(28px,5vw,44px)">¡Felicitaciones, <span class="grad-text">${esc((me().name || "").split(" ")[0] || "crack")}!</span></h2>
      <p class="muted" style="margin:0 0 18px">Este es tu certificado oficial InnovaFit. Ya quedó guardado en “Mis certificados”.</p>`
      : `<span class="eyebrow">Folio ${esc(cert.folio)}</span><h2 style="margin:10px 0 16px">${esc(cert.title)}</h2>`}
      <div id="cPrev"></div>
      <div class="modal-actions" style="justify-content:center;margin-top:18px">
        <button class="btn btn-primary" data-dl="pdf">Descargar PDF</button>
        <button class="btn btn-ghost" data-dl="png">Descargar imagen</button>
        <button class="btn btn-ghost" data-close>Cerrar</button>
      </div>`, (m) => {
      Cert.mount(m.querySelector("#cPrev"), cert);
      bindDownloads(m, cert);
      if(celebrate) confetti();
    }, "celebrate");
  }

  function bindDownloads(root, cert){
    root.querySelectorAll("[data-dl]").forEach((b) => b.onclick = async () => {
      const label = b.textContent;
      b.disabled = true; b.textContent = "Generando…";
      try{ await Cert.download(cert, b.dataset.dl); ok("¡Descarga lista!", "Tu certificado se guardó en tu dispositivo."); }
      catch(err){ fail(err.message); }
      finally{ b.disabled = false; b.textContent = label; }
    });
  }

  function confetti(){
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = document.createElement("canvas");
    c.className = "confetti";
    document.body.appendChild(c);
    const ctx = c.getContext("2d");
    c.width = innerWidth; c.height = innerHeight;
    const colors = ["#ff5a1f", "#ffc93c", "#ffffff", "#34d399"];
    const parts = Array.from({length:180}, () => ({x:innerWidth / 2 + (Math.random() - .5) * 200, y:innerHeight * .35, vx:(Math.random() - .5) * 14, vy:-(Math.random() * 12 + 5),
      s:4 + Math.random() * 6, r:Math.random() * 6, vr:(Math.random() - .5) * .3, c:colors[(Math.random() * 4) | 0]}));
    let t = 0;
    (function tick(){
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach((p) => { p.vy += .28; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - t / 170); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
      if(++t < 170) requestAnimationFrame(tick); else c.remove();
    })();
  }

  /* =====================================================
     MIS CERTIFICADOS
     ===================================================== */
  async function renderCertificados(){
    $("burger").hidden = true;
    setTab("certificados");
    const list = await loadCerts(true);
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Tus logros</span><h1>Mis <span class="grad-text">certificados</span></h1>
        <p>Cada curso que completás suma un certificado oficial InnovaFit con folio verificable.</p></div>
      ${list.length ? `<div class="certs">${list.map((c, i) => `<div class="card cert-card" style="animation:rise .55s ${i * 80}ms both">
        <div data-prev="${c.id}"></div>
        <h3>${esc(c.title)}</h3><small>Folio ${esc(c.folio)} · ${esc(Cert.dateLong(c.issueDate))}</small>
        <div class="cert-actions"><button class="btn btn-primary btn-sm" data-open="${c.id}">Ver grande</button><button class="btn btn-ghost btn-sm" data-dl="pdf" data-id="${c.id}">PDF</button><button class="btn btn-ghost btn-sm" data-dl="png" data-id="${c.id}">Imagen</button></div>
      </div>`).join("")}</div>`
      : `<div class="card empty rise"><h2>Todavía no tenés certificados</h2><p>Completá todas las lecciones de un curso y tu certificado se genera al instante.</p><a class="btn btn-primary" href="#/">Ir a mis cursos</a></div>`}
    </div>`;
    const byId = new Map(list.map((c) => [c.id, c]));
    view.querySelectorAll("[data-prev]").forEach((el) => Cert.mount(el, byId.get(el.dataset.prev)));
    view.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => certModal(byId.get(b.dataset.open)));
    view.querySelectorAll(".cert-card").forEach((card) => bindDownloads(card, byId.get(card.querySelector("[data-id]").dataset.id)));
  }

  /* =====================================================
     CERTIFICACIONES DISPONIBLES
     ===================================================== */
  const KIND_PROGRAM = {certificacion:"Certificación", especializacion:"Especialización", paquete:"Paquete"};

  async function renderCertificaciones(){
    $("burger").hidden = true;
    setTab("certificaciones");
    const items = await pb.collection("programs").getFullList({sort:"order,title"});
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Tu próximo nivel</span><h1>Certificaciones <span class="grad-text">disponibles</span></h1>
        <p>Elegí la que te interesa y consultanos por WhatsApp. Un asesor te responde con precios, fechas y condiciones para alumnos del campus.</p></div>
      <div class="progs">${items.map((p, i) => `<article class="card prog" style="animation:rise .55s ${i * 60}ms both">
        <div class="cv" ${p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}>${p.image ? "" : `<span>${esc(initials(p.title))}</span>`}</div>
        <div class="pb">
          <div class="meta"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span>${p.duration ? `<span class="badge">${esc(p.duration)}</span>` : ""}${p.modality ? `<span class="badge">${esc(p.modality)}</span>` : ""}</div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.summary || "")}</p>
          <button class="btn btn-primary" data-ask="${p.id}">Consultar por WhatsApp</button>
        </div></article>`).join("")}</div>
    </div>`;
    const byId = new Map(items.map((p) => [p.id, p]));
    view.querySelectorAll("[data-ask]").forEach((b) => b.onclick = () => askModal(byId.get(b.dataset.ask)));
  }

  // Arma un mensaje personalizado con los datos del alumno y lo abre en WhatsApp.
  function askModal(p){
    const u = me();
    const topics = ["Precio y formas de pago", "Fechas de inicio", "Modalidad y duración", "Requisitos"];
    openModal(`<span class="eyebrow">Consulta</span><h2 style="margin-top:8px">${esc(p.title)}</h2>
      <p class="muted" style="margin:0 0 16px">Elegí qué querés saber y revisá el mensaje antes de enviarlo.</p>
      <div class="field"><span>Me interesa saber</span><div style="display:flex;flex-wrap:wrap;gap:10px">${topics.map((t, i) => `<label class="check"><input type="checkbox" value="${esc(t)}"${i < 2 ? " checked" : ""}> ${esc(t)}</label>`).join("")}</div></div>
      <label class="field"><span>Algo más que quieras contarnos (opcional)</span><input class="input" id="askExtra" placeholder="Ej: trabajo en un gimnasio y quiero certificarme este año"></label>
      <label class="field"><span>Mensaje</span><textarea class="input" id="askMsg" rows="6"></textarea></label>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="askSend">Enviar por WhatsApp</button></div>`, (m) => {
      const build = () => {
        const want = [...m.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value.toLowerCase());
        const extra = m.querySelector("#askExtra").value.trim();
        m.querySelector("#askMsg").value =
          "Hola InnovaFit! 👋 Soy " + (u.name || "alumno del campus") + " (" + u.email + ").\n" +
          "Estoy en el campus y me interesa la " + p.title + "." +
          (want.length ? "\nMe gustaría saber: " + want.join(", ") + "." : "") +
          (extra ? "\n" + extra : "") + "\n¡Gracias!";
      };
      m.querySelectorAll("input").forEach((i) => i.addEventListener("input", build));
      build();
      m.querySelector("#askSend").onclick = () => {
        window.open(wa(m.querySelector("#askMsg").value), "_blank", "noopener");
        closeModal();
        ok("¡Consulta lista!", "Se abrió WhatsApp con tu mensaje. Solo tocá enviar.");
      };
    });
  }

  /* =====================================================
     MI PERFIL
     ===================================================== */
  async function renderPerfil(){
    $("burger").hidden = true;
    setTab("perfil");
    const u = me();
    const list = await loadCerts();
    const totalLessons = (await Promise.all(courses.map((c) => loadLessons(c.id)))).flat();
    const doneCount = totalLessons.filter((l) => progress.has(l.id)).length;
    const avStyle = u.avatar ? `style="background-image:url('${fileUrl(u, u.avatar, "200x200")}')"` : "";
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Tu cuenta</span><h1>Mi <span class="grad-text">perfil</span></h1><p>Mantené tus datos al día: tu nombre es el que aparece en tus certificados.</p></div>
      <div class="profile rise">
        <div class="card id-card">
          <label class="big-av" ${avStyle} title="Cambiar foto">${u.avatar ? "" : esc(initials(u.name || u.email))}<input type="file" id="avIn" accept="image/*" hidden></label>
          <h2>${esc(u.name || "Sin nombre")}</h2>
          <p>${esc(u.email)}</p>
          <div class="id-stats"><div><b>${doneCount}</b><span>Lecciones</span></div><div><b>${list.length}</b><span>Certificados</span></div></div>
        </div>
        <div style="display:grid;gap:18px">
          <form class="card panel" id="pForm" novalidate>
            <h2>Datos personales</h2>
            <label class="field"><span>Nombre completo (así sale en tus certificados)</span><input class="input" name="name" required value="${esc(u.name || "")}"></label>
            <div class="two">
              <label class="field"><span>Código de país</span><input class="input" name="country" inputmode="numeric" value="${esc(u.country || "")}" placeholder="52"></label>
              <label class="field"><span>WhatsApp</span><input class="input" name="phone" inputmode="numeric" value="${esc(u.phone || "")}"></label>
            </div>
            <label class="field"><span>Identificación (CURP / DNI)</span><input class="input" name="docId" value="${esc(u.docId || "")}"></label>
            <label class="field"><span>Correo</span><input class="input" value="${esc(u.email)}" disabled></label>
            <button class="btn btn-primary">Guardar cambios</button>
          </form>
          <form class="card panel" id="pwForm" novalidate>
            <h2>Cambiar contraseña</h2>
            <label class="field"><span>Contraseña actual</span><input class="input" type="password" name="oldPassword" autocomplete="current-password" required></label>
            <div class="two">
              <label class="field"><span>Nueva contraseña</span><input class="input" type="password" name="password" minlength="8" autocomplete="new-password" required></label>
              <label class="field"><span>Repetila</span><input class="input" type="password" name="passwordConfirm" minlength="8" autocomplete="new-password" required></label>
            </div>
            <p class="error-msg" id="pwErr" role="alert"></p>
            <button class="btn btn-ghost">Actualizar contraseña</button>
          </form>
        </div>
      </div></div>`;

    $("avIn").onchange = async (e) => {
      const f = e.target.files[0];
      if(!f) return;
      const fd = new FormData();
      fd.set("avatar", f);
      try{
        await pb.collection("users").update(u.id, fd);
        paintAvatar();
        ok("¡Foto actualizada!", "Te queda genial.");
        renderPerfil();
      }catch(err){ fail(err); }
    };
    $("pForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if(f.name.value.trim().length < 2) return fail("Escribí tu nombre completo.");
      try{
        await pb.collection("users").update(u.id, {
          name: f.name.value.trim(),
          country: f.country.value.replace(/\D/g, ""),
          phone: f.phone.value.replace(/\D/g, ""),
          docId: f.docId.value.trim(),
        });
        paintAvatar();
        ok("¡Guardado con éxito!", "Tus datos están actualizados.");
        renderPerfil();
      }catch(err){ fail(err); }
    };
    $("pwForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      $("pwErr").textContent = "";
      if(f.password.value.length < 8) return void ($("pwErr").textContent = "La nueva contraseña necesita al menos 8 caracteres.");
      if(f.password.value !== f.passwordConfirm.value) return void ($("pwErr").textContent = "Las contraseñas no coinciden.");
      try{
        await pb.collection("users").update(u.id, {oldPassword: f.oldPassword.value, password: f.password.value, passwordConfirm: f.passwordConfirm.value});
        // Cambiar la contraseña invalida la sesión: entramos de nuevo con la nueva.
        await pb.collection("users").authWithPassword(u.email, f.password.value);
        f.reset();
        ok("¡Contraseña actualizada!", "Usala la próxima vez que entres.");
      }catch(err){
        $("pwErr").textContent = err.status === 400 ? "La contraseña actual no es correcta." : errMsg(err);
      }
    };
  }

  /* ---------- Router ---------- */
  async function route(){
    closeModal();
    const h = location.hash;
    const m = h.match(/^#\/c\/([^/]+)(?:\/([^/]+))?/);
    try{
      if(m) await renderCourse(m[1], m[2]);
      else if(h.startsWith("#/certificados")) await renderCertificados();
      else if(h.startsWith("#/certificaciones")) await renderCertificaciones();
      else if(h.startsWith("#/perfil")) await renderPerfil();
      else await renderHome();
      window.scrollTo(0, 0);
    }catch(err){
      view.innerHTML = `<div class="page"><div class="card empty"><h2>Ups</h2><p>${esc(errMsg(err))}</p><button class="btn btn-ghost" onclick="location.reload()">Reintentar</button></div></div>`;
    }
  }
  window.addEventListener("hashchange", () => { if(pb.authStore.isValid) route(); });
  window.addEventListener("resize", () => { const on = $("tabs").querySelector("a.on"); if(on) setTab(on.dataset.tab); });

  async function boot(){
    if(!pb.authStore.isValid){ showLogin(); return; }
    try{
      await pb.collection("users").authRefresh();
    }catch{
      pb.authStore.clear();
      showLogin();
      return;
    }
    $("loginView").hidden = true;
    $("appView").hidden = false;
    paintAvatar();
    $("adminLink").hidden = me().role !== "admin";
    view.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    await loadBase();
    const welcome = /bienvenida/.test(location.hash);
    if(welcome) location.replace("#/");
    await route();
    if(welcome) ok("¡Bienvenido al campus!", "Tu cuenta ya está activa. Arrancá tu curso de regalo.");
  }

  boot();
})();
