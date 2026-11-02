// Campus del alumno: login, mis cursos, reproductor con progreso, certificados,
// certificaciones ISSA (ficha, inscripción y comprobante de pago), soporte y perfil editable.
(function(){
  "use strict";
  const {pb, esc, notify, api, errMsg, fileUrl, embedUrl, settings, KIND_LABEL, KIND_ICON} = UI;

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
  let courses = null;  // cursos del alumno
  let openCourses = []; // cursos gratuitos en los que todavía no se inscribió
  let progress = null; // Map lessonId → registro de progreso
  let certs = null;
  let enrollments = null; // Map courseId → inscripción (estado de acreditación)
  let inscriptions = null; // inscripciones a certificaciones ISSA
  const lessonsByCourse = {};

  // Limpieza al cambiar de pantalla (observadores, scroll, temporizadores).
  const leaving = [];
  const onLeave = (fn) => leaving.push(fn);
  const leave = () => leaving.splice(0).forEach((fn) => { try{ fn(); }catch{} });

  // A dónde quería ir antes de entrar (ej. la ficha de una certificación desde la web).
  const NEXT_KEY = "innovafit_next";
  const takeNext = () => { try{ const n = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return n || ""; }catch{ return ""; } };

  /* ---------- Campaña comercial (Buen Fin) ---------- */
  async function campaignHtml(){
    const s = await settings();
    if(!s.campaignOn) return "";
    const mark = s.campaignLogo ? `<img src="${fileUrl(s, s.campaignLogo)}" alt="${esc(s.campaignTitle || "Campaña")}">` : `<span class="bf-badge">Buen<br>Fin</span>`;
    return `<div class="campaign">${mark}<div><b>${esc(s.campaignTitle || "")}</b><span>${esc(s.campaignText || "")}</span></div></div>`;
  }
  const ribbon = async () => ((await settings()).campaignOn ? `<span class="ribbon">BUEN FIN</span>` : "");

  /* ---------- Acceso: registro obligatorio o ingreso ---------- */
  let pickedCourse = null;

  function authMode(mode){
    document.querySelectorAll(".seg-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    $("regForm").hidden = mode !== "register";
    $("loginForm").hidden = mode !== "login";
    (mode === "login" ? ($("lEmail").value ? $("lPass") : $("lEmail")) : $("regForm").name).focus({preventScroll:true});
  }
  document.querySelectorAll(".seg-tabs button").forEach((b) => b.onclick = () => authMode(b.dataset.mode));

  function pickCourse(c){
    pickedCourse = c;
    document.querySelectorAll(".gcourse").forEach((x) => x.classList.toggle("on", x.dataset.id === c.id));
    const box = $("picked");
    box.hidden = false;
    box.innerHTML = `<i style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"></i><div><small>Te inscribís en</small><b>${esc(c.title)}</b></div>`;
  }

  async function showLogin(){
    $("appView").hidden = true;
    $("loginView").hidden = false;
    const m = location.hash.match(/email=([^&]+)/);
    if(m) $("lEmail").value = decodeURIComponent(m[1]);
    if(/^#\/(certificaciones|inscripciones|soporte)/.test(location.hash)){ try{ sessionStorage.setItem(NEXT_KEY, location.hash); }catch{} }
    authMode(m ? "login" : "register");
    $("gateCampaign").innerHTML = await campaignHtml();
    try{
      const open = await pb.collection("courses").getFullList({filter:"openAccess = true", sort:"order,created"});
      const rib = await ribbon();
      $("gateCourses").innerHTML = open.map((c) => `<button type="button" class="gcourse" data-id="${c.id}">${rib}
        <div class="cv" ${c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : ""}></div>
        <div class="gb"><h3>${esc(c.title)}</h3>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}<span class="go">Inscribirme gratis →</span></div></button>`).join("");
      const byId = new Map(open.map((c) => [c.id, c]));
      $("gateCourses").querySelectorAll(".gcourse").forEach((b) => b.onclick = () => {
        pickCourse(byId.get(b.dataset.id));
        authMode("register");
        if(innerWidth < 980) $("authCard").scrollIntoView({behavior:"smooth", block:"start"});
      });
      const want = location.hash.match(/curso=([^&]+)/);
      if(open.length) pickCourse(byId.get(want && want[1]) || open[0]);
    }catch{}
  }

  $("regForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, err = $("rErr"), btn = $("rBtn");
    err.textContent = "";
    const name = f.name.value.trim().replace(/\s+/g, " ");
    if(name.length < 5 || !name.includes(" ")) return void (err.textContent = "Escribí tu nombre y apellido completos.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return void (err.textContent = "Revisá tu correo.");
    if(f.phone.value.replace(/\D/g, "").length < 7) return void (err.textContent = "Revisá tu número de teléfono.");
    if(f.password.value.length < 8) return void (err.textContent = "La contraseña necesita al menos 8 caracteres.");
    if(!f.consent.checked) return void (err.textContent = "Necesitamos tu autorización para crear la cuenta.");
    btn.disabled = true;
    btn.textContent = "Creando tu cuenta…";
    try{
      const r = await api("/api/register", {name, email: f.email.value.trim(), country: f.country.value, phone: f.phone.value, password: f.password.value, course: pickedCourse && pickedCourse.id});
      pb.authStore.save(r.auth.token, r.auth.record);
      location.hash = takeNext() || (r.course ? "#/c/" + r.course.id : "#/");
      await boot();
      ok("¡Registro exitoso!", r.course ? "Ya estás inscripto en " + r.course.title + ". ¡A darle!" : "Tu cuenta está lista.");
    }catch(e2){
      err.textContent = e2.message;
      if(e2.status === 409){ $("lEmail").value = f.email.value.trim(); setTimeout(() => authMode("login"), 1200); }
    }finally{
      btn.disabled = false;
      btn.textContent = "Crear cuenta y entrar";
    }
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("lBtn");
    $("lErr").textContent = "";
    btn.disabled = true;
    btn.textContent = "Entrando…";
    try{
      await pb.collection("users").authWithPassword($("lEmail").value.trim().toLowerCase(), $("lPass").value);
      location.hash = takeNext() || "#/";
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
    leave();
    courses = progress = certs = enrollments = inscriptions = null;
    Object.keys(lessonsByCourse).forEach((k) => delete lessonsByCourse[k]);
    afterProfile = "";
    document.body.classList.remove("locked");
    document.querySelectorAll(".tour").forEach((t) => t.remove());
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
    if(!courses){
      // La lista incluye los cursos de acceso libre: separamos los propios de los disponibles.
      const all = await pb.collection("courses").getFullList({sort:"order,created"});
      const mine = new Set(me().courses || []);
      courses = all.filter((c) => mine.has(c.id));
      openCourses = all.filter((c) => !mine.has(c.id) && c.openAccess);
    }
    if(!enrollments){
      const rows = await pb.collection("enrollments").getFullList({filter: pb.filter("user = {:u}", {u: me().id})});
      enrollments = new Map(rows.map((r) => [r.course, r]));
    }
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
    // En celular la fila de pestañas se desplaza: centramos la activa.
    const row = $("tabsRow");
    if(on && row.scrollWidth > row.clientWidth) row.scrollLeft = tabs.offsetLeft + on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
  }

  function paintAvatar(){
    const u = me();
    const html = u.avatar
      ? `<div class="avatar" style="background-image:url('${fileUrl(u, u.avatar, "100x100")}')"></div>`
      : `<div class="avatar">${esc(initials(u.name || u.email))}</div>`;
    $("topAv").innerHTML = html;
    $("who").textContent = u.name || u.email;
  }

  /* ---------- Primer ingreso: perfil obligatorio + tutorial ---------- */
  // Lo que falta para usar el campus. El admin nunca queda bloqueado.
  const PROFILE_REQ = [
    ["name", "Nombre y apellido", (u) => { const n = (u.name || "").trim(); return n.length >= 5 && n.includes(" "); }],
    ["country", "Código de país", (u) => /^\d{1,4}$/.test(u.country || "")],
    ["phone", "WhatsApp", (u) => (u.phone || "").replace(/\D/g, "").length >= 7],
    ["docId", "Identificación (CURP / DNI)", (u) => (u.docId || "").trim().length >= 5],
  ];
  const profileMissing = (u) => PROFILE_REQ.filter(([, , test]) => !test(u));
  const isTeam = () => me().role === "admin" || me().role === "agent";
  const needsProfile = () => !isTeam() && profileMissing(me()).length > 0;
  let afterProfile = ""; // a dónde quería ir el alumno antes de completar el perfil

  function lockCampus(){
    document.body.classList.toggle("locked", needsProfile());
  }
  $("tabs").addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if(!a || a.dataset.tab === "perfil" || !needsProfile()) return;
    e.preventDefault();
    notify({type:"error", title:"Completá tu perfil", text:"Es un minuto y se desbloquea todo el campus."});
  });

  const TOUR = [
    {title:"¡Bienvenido al campus!", text:"Te mostramos en 30 segundos para qué sirve cada sección."},
    {tab:"cursos", title:"Mis cursos", text:"Tus cursos y clases. Miralas en orden: tu avance se guarda solo."},
    {tab:"certificados", title:"Mis certificados", text:"Cuando aprobás un examen, tu certificado aparece acá para descargarlo o compartirlo."},
    {tab:"certificaciones", title:"Certificaciones", text:"Las certificaciones internacionales ISSA: programa módulo a módulo, precio y a quién va dirigida cada una. Te inscribís desde acá."},
    {tab:"inscripciones", title:"Mis inscripciones", text:"El estado de tu compra. Cuando pagues, subís el comprobante y el correo donde querés recibir el acceso."},
    {tab:"soporte", title:"Soporte", text:"¿Una duda o algo no funciona? Escribinos y el equipo te responde acá mismo."},
    {tab:"perfil", title:"Mi perfil", text:"Tus datos y tu foto. Tu nombre es el que sale en los certificados."},
    {title:"Así se aprueba", text:"Mirá las clases → rendí el examen (80% o más) → tu certificado se emite al instante.", last:true},
  ];

  function startTour(done){
    window.scrollTo(0, 0);
    const root = document.createElement("div");
    root.className = "tour";
    root.innerHTML = `<div class="tour-hole"></div><div class="tour-tip card" role="dialog" aria-modal="true" aria-live="polite"></div>`;
    document.body.appendChild(root);
    const hole = root.querySelector(".tour-hole"), tip = root.querySelector(".tour-tip");
    let i = 0;

    const place = () => {
      const s = TOUR[i];
      const el = s.tab && $("tabs").querySelector(`[data-tab="${s.tab}"]`);
      root.classList.toggle("center", !el);
      if(!el){ tip.style.left = tip.style.top = ""; return; }
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(hole.style, {left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px"});
      const w = Math.min(340, innerWidth - 32);
      tip.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 16)) + "px";
      tip.style.top = r.bottom + 18 + "px";
    };
    const paint = () => {
      const s = TOUR[i];
      const el = s.tab && $("tabs").querySelector(`[data-tab="${s.tab}"]`);
      if(el) el.scrollIntoView({block:"nearest", inline:"center"});
      tip.innerHTML = `
        ${s.tab ? `<span class="tour-n">${i} de ${TOUR.length - 2}</span>` : `<img class="tour-logo" src="/assets/innovafit-logo.png" alt="InnovaFit">`}
        <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
        <div class="tour-dots">${TOUR.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="tour-act">
          ${s.last ? "" : `<button type="button" class="btn btn-ghost btn-sm" data-t="skip">Saltar</button>`}
          ${i > 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-t="prev">Atrás</button>` : ""}
          <button type="button" class="btn btn-primary btn-sm" data-t="next">${s.last ? "Empezar" : i === 0 ? "Mostrame" : "Siguiente"}</button>
        </div>`;
      place();
      tip.querySelector("[data-t=next]").focus({preventScroll:true});
    };
    const finish = async () => {
      root.remove();
      removeEventListener("resize", place);
      document.removeEventListener("keydown", keys);
      try{ await pb.collection("users").update(me().id, {onboarded: true}); }catch{}
      if(done) done();
    };
    const keys = (e) => {
      if(e.key === "Escape") finish();
      else if(e.key === "ArrowRight") tip.querySelector("[data-t=next]").click();
      else if(e.key === "ArrowLeft" && i > 0){ i--; paint(); }
    };
    tip.addEventListener("click", (e) => {
      const t = e.target.closest("[data-t]");
      if(!t) return;
      if(t.dataset.t === "skip") return finish();
      if(t.dataset.t === "prev"){ i--; return paint(); }
      if(TOUR[i].last) return finish();
      i++;
      paint();
    });
    addEventListener("resize", place);
    document.addEventListener("keydown", keys);
    paint();
  }
  function maybeTour(){
    const u = me();
    if(isTeam() || u.onboarded || needsProfile() || document.querySelector(".tour")) return;
    startTour(() => {
      const go = afterProfile;
      afterProfile = "";
      if(go && go !== location.hash) location.hash = go;
    });
  }

  /* =====================================================
     MIS CURSOS
     ===================================================== */
  async function renderHome(){
    $("burger").hidden = true;
    setTab("cursos");
    const first = (me().name || "").split(" ")[0];
    const lessonLists = await Promise.all(courses.map((c) => loadLessons(c.id)));
    const rib = await ribbon();
    const cover = (c) => c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : "";
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Mis cursos</span>
        <h1>${first ? "Hola, " + esc(first) : "Bienvenido"} <span class="grad-text">💪</span></h1>
        <p>Retomá donde lo dejaste. Aprobá el examen de acreditación y tu certificado InnovaFit se emite al instante.</p></div>
      <div class="rise">${await campaignHtml()}</div>
      ${courses.length ? `<div class="grid">${courses.map((c, i) => {
        const pct = pctFor(lessonLists[i]);
        const acc = (enrollments.get(c.id) || {}).status === "acreditado";
        return `<a class="card course" style="animation-delay:${i * 70}ms" href="#/c/${c.id}">
          <div class="course-cover" ${cover(c)}></div>
          <div class="course-body">
            ${acc ? '<div><span class="badge acc">✓ Acreditado</span></div>' : ""}
            <h3>${esc(c.title)}</h3>
            ${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
            <div class="bar-label"><span>${lessonLists[i].length} lecciones${c.certEnabled ? " · 🎓 con certificado" : ""}</span><span>${pct}%</span></div>
            <div class="bar"><i style="width:0" data-w="${pct}"></i></div>
          </div></a>`;
      }).join("")}</div>` : `<div class="card empty rise"><h2>Todavía no estás inscripto en ningún curso</h2><p>Elegí un curso gratuito de abajo y empezá ahora mismo.</p></div>`}
      ${openCourses.length ? `<h2 class="more-title">Cursos <span class="grad-text">gratis</span> para vos</h2>
      <div class="grid">${openCourses.map((c, i) => `<div class="card course" style="animation-delay:${i * 70}ms">${rib}
          <div class="course-cover" ${cover(c)}></div>
          <div class="course-body"><h3>${esc(c.title)}</h3>${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
            <button class="btn btn-primary" data-enroll="${c.id}" style="margin-top:auto">Inscribirme gratis</button></div></div>`).join("")}</div>` : ""}
    </div>`;
    requestAnimationFrame(() => view.querySelectorAll("[data-w]").forEach((b) => { b.style.width = b.dataset.w + "%"; }));
    view.querySelectorAll("[data-enroll]").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try{
        const r = await api("/api/enroll", {course: b.dataset.enroll});
        await pb.collection("users").authRefresh();
        courses = enrollments = null;
        await loadBase();
        ok("¡Inscripción exitosa!", "Ya podés empezar " + r.course.title + ".");
        location.hash = "#/c/" + r.course.id;
      }catch(err){ fail(err.message); b.disabled = false; }
    });
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
      case "quiz":
      case "exam":
        return `<div id="assess"><div class="quiz"><div class="loading" style="min-height:200px"><div class="spinner"></div></div></div></div>`;
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
    const hasExam = lessons.some((x) => x.kind === "exam");
    const accredited = (enrollments.get(courseId) || {}).status === "acreditado";
    // Con examen, el cierre del curso es la acreditación; sin examen, completar todas las lecciones.
    const finished = hasExam ? accredited : pct === 100;
    const myCert = finished && course.certEnabled ? (await loadCerts()).find((c) => c.course === courseId) : null;
    const assessing = l => l.kind === "quiz" || l.kind === "exam";

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
          ${assessing(l) ? (isDone ? `<span class="badge good">✓ Completada</span>` : "<span></span>") : `<button class="btn btn-primary btn-complete${isDone ? " done" : ""}" id="completeBtn">${isDone ? "✓ Completada" : "Marcar como completa"}</button>`}
          ${next ? `<a class="btn btn-ghost" href="#/c/${courseId}/${next.id}">Siguiente →</a>` : "<span></span>"}
        </div>
        ${finished && l.kind !== "exam" ? `<div class="finale">
          <span class="eyebrow">🏁 ${hasExam ? "Curso acreditado" : "Curso completo"}</span>
          <h2>Esto fue el <span class="grad-text">calentamiento.</span></h2>
          <p>${hasExam ? "Acreditaste" : "Terminaste"} ${esc(course.title)}. La Certificación Doble de Entrenador Personal InnovaFit te lleva de la teoría a tu primer cliente pago, con respaldo nacional e internacional.</p>
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
    $("completeBtn")?.addEventListener("click", () => toggleDone(l, course));
    $("certBtn")?.addEventListener("click", () => (myCert ? certModal(myCert) : claimCertificate(course)));
    if(assessing(l)) renderAssessment(l, course, lessons);
  }

  /* =====================================================
     COMPROBACIÓN DE CONOCIMIENTOS Y EXAMEN DE ACREDITACIÓN
     ===================================================== */
  const LETTERS = "ABCDEFGH";
  const ringSvg = (score, okClass) => {
    const C = 2 * Math.PI * 64;
    return `<div class="ring-big ${okClass}"><svg viewBox="0 0 150 150"><circle class="t" cx="75" cy="75" r="64"/><circle class="f" cx="75" cy="75" r="64" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C - (score / 100) * C}"/></svg><b data-count="${score}">0</b></div>`;
  };
  function animateRing(root){
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.querySelectorAll("[data-off]").forEach((c) => { c.style.strokeDashoffset = c.dataset.off; });
      root.querySelectorAll("[data-count]").forEach((b) => UI.countUp(b, +b.dataset.count));
    }));
  }
  const optsHtml = (q, qi, chosen) => `<div class="opts">${q.options.map((o, oi) =>
    `<button type="button" class="opt${chosen === oi ? " sel" : ""}" data-q="${qi}" data-o="${oi}"><span class="l">${LETTERS[oi]}</span><span>${esc(o)}</span></button>`).join("")}</div>`;

  async function renderAssessment(l, course, lessons){
    const box = $("assess");
    let data;
    try{ data = await api("/api/assessment/" + l.id); }
    catch(err){ box.innerHTML = `<div class="quiz state-card"><div class="big">🛠️</div><h2>Muy pronto</h2><p>${esc(err.message)}</p></div>`; return; }
    if(data.kind === "final") return renderExam(box, l, course, lessons, data);
    renderPractice(box, l, course, lessons, data);
  }

  // Comprobación del estudio de caso: todas las preguntas juntas y corrección explicada.
  function renderPractice(box, l, course, lessons, data){
    const answers = new Array(data.questions.length).fill(null);
    const next = lessons[lessons.indexOf(l) + 1];
    box.innerHTML = `<div class="quiz">
      <div class="quiz-head"><div class="quiz-meta"><span class="badge hot">${data.questions.length} preguntas</span><span class="badge">Resultado inmediato</span></div>
        ${data.history.length ? `<span class="muted" style="font-size:13px">Tu mejor resultado: <b style="color:var(--fg)">${Math.max(...data.history.map((h) => h.score))}%</b></span>` : ""}</div>
      ${data.questions.map((q, qi) => `<div class="qcard" data-card="${qi}"><h3><small>PREGUNTA ${qi + 1}</small>${esc(q.q)}</h3>${optsHtml(q, qi, null)}<div data-explain></div></div>`).join("")}
      <div class="quiz-foot"><span class="muted" id="qLeft">Respondé las ${data.questions.length} preguntas</span><button class="btn btn-primary" id="qSend" disabled>Comprobar respuestas</button></div>
    </div>`;
    const left = () => answers.filter((a) => a === null).length;
    box.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
      const qi = +b.dataset.q;
      answers[qi] = +b.dataset.o;
      box.querySelectorAll(`[data-q="${qi}"]`).forEach((x) => x.classList.toggle("sel", x === b));
      const n = left();
      $("qLeft").textContent = n ? "Te faltan " + n : "¡Listo para comprobar!";
      $("qSend").disabled = !!n;
    });
    $("qSend").onclick = async () => {
      $("qSend").disabled = true;
      try{
        const r = await api("/api/assessment/" + l.id, {answers});
        if(!progress.has(l.id)) progress.set(l.id, {id:"", lesson:l.id});
        r.review.forEach((rv, qi) => {
          const card = box.querySelector(`[data-card="${qi}"]`);
          card.querySelectorAll(".opt").forEach((o) => {
            o.disabled = true;
            const oi = +o.dataset.o;
            if(oi === rv.correct) o.classList.add("right");
            else if(oi === answers[qi]) o.classList.add("wrong");
          });
          card.querySelector("[data-explain]").innerHTML = `<div class="explain"><b>${rv.ok ? "✓ Correcta." : "✗ Incorrecta."}</b> ${esc(rv.explain)}</div>`;
        });
        box.querySelector(".quiz-foot").hidden = true;
        const great = r.score >= (r.passScore || 67);
        box.querySelector(".quiz").insertAdjacentHTML("afterbegin", `<div class="result" style="margin-bottom:24px;padding-bottom:22px;border-bottom:1px solid var(--line)">
          ${ringSvg(r.score, great ? "ok" : "")}
          <div><h2>${great ? "¡Excelente análisis!" : "Repasá el estudio de caso"}</h2>
          <p>Acertaste ${r.correct} de ${r.total}. ${great ? "Entendiste la situación de Sarah: estás listo para el examen de acreditación." : "Leé de nuevo el estudio de caso y volvé a intentarlo: es la mejor preparación para el examen."}</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">${next ? `<a class="btn btn-primary" href="#/c/${course.id}/${next.id}">${next.kind === "exam" ? "Ir al examen de acreditación →" : "Siguiente lección →"}</a>` : ""}<button class="btn btn-ghost" id="qRetry">Intentar de nuevo</button></div></div></div>`);
        animateRing(box);
        box.querySelector("#qRetry").onclick = () => renderAssessment(l, course, lessons);
        box.scrollIntoView({behavior:"smooth", block:"start"});
        notify({type: great ? "success" : "error", title: great ? "¡Comprobación superada!" : "Casi, revisá tus respuestas", text: r.correct + " de " + r.total + " correctas"});
        // Refresca la barra lateral (la lección quedó completa) sin perder la corrección en pantalla.
        const link = document.querySelector(`.lesson-link[href$="${l.id}"]`);
        if(link){ link.classList.add("done"); link.querySelector(".ic").textContent = "✓"; }
      }catch(err){ fail(err.message); $("qSend").disabled = false; }
    };
  }

  // Examen de acreditación: una pregunta por pantalla, intentos limitados y certificado automático.
  function renderExam(box, l, course, lessons, data){
    const att = data.attempts || {};
    const firstName = (me().name || "").split(" ")[0] || "crack";
    const help = wa("Hola InnovaFit! Soy " + (me().name || me().email) + " (" + me().email + "). Usé mis " + (att.allowed || 3) + " oportunidades del examen de acreditación de " + course.title + " y quiero pedir apoyo y una nueva oportunidad.");
    const hist = data.history.length ? `<div class="hist">${data.history.slice().reverse().filter((h) => h.attemptNo).map((h) => `<span>Intento ${h.attemptNo}: <b style="color:${h.passed ? "var(--good)" : "var(--fg)"}">${h.score}%</b></span>`).join("")}</div>` : "";

    if(data.accredited){
      box.innerHTML = `<div class="quiz state-card"><div class="acc-stamp">ACREDITADO</div>
        <h2>¡Felicitaciones, <span class="grad-text">${esc(firstName)}!</span></h2>
        <p>Aprobaste ${esc(course.title)} con <b>${data.bestScore}%</b>${data.accreditedAt ? " el " + new Date(data.accreditedAt.replace(" ", "T")).toLocaleDateString("es-MX", {day:"numeric", month:"long", year:"numeric"}) : ""}. Tu certificado ya está disponible.</p>
        ${course.certEnabled ? `<button class="btn btn-primary" id="seeCert">🎓 Ver y descargar mi certificado</button>` : ""}${hist}</div>`;
      $("seeCert")?.addEventListener("click", async () => {
        const c = (await loadCerts(true)).find((x) => x.course === course.id);
        if(c) certModal(c); else fail("Todavía no encontramos tu certificado. Recargá la página.");
      });
      return;
    }
    if(data.locked){
      const pending = lessons.find((x) => x.kind !== "exam" && !progress.has(x.id));
      box.innerHTML = `<div class="quiz state-card"><div class="big">🔒</div><h2>Examen bloqueado</h2><p>${esc(data.locked)} Así llegás preparado: el examen evalúa todo el curso.</p>
        ${pending ? `<a class="btn btn-primary" href="#/c/${course.id}/${pending.id}">Ir a: ${esc(pending.title)} →</a>` : ""}</div>`;
      return;
    }
    if(att.allowed && att.left === 0){
      box.innerHTML = `<div class="quiz state-card"><div class="big">🤝</div><h2>Usaste tus ${att.allowed} oportunidades</h2>
        <p>Tu mejor resultado fue <b>${data.bestScore}%</b> y se necesita ${data.passScore}%. Comunicate con el equipo de InnovaFit: te damos apoyo para repasar y te habilitamos nuevas oportunidades.</p>
        <a class="btn btn-primary" target="_blank" rel="noopener" href="${help}">Pedir apoyo por WhatsApp</a>${hist}</div>`;
      return;
    }

    box.innerHTML = `<div class="quiz state-card"><div class="big">🎯</div><h2>${esc(data.title)}</h2>
      <p>${data.questions.length} preguntas sobre todo el curso. Aprobás con <b>${data.passScore}%</b> o más y tu certificado se emite al instante.</p>
      <div class="quiz-meta" style="justify-content:center;margin-bottom:20px"><span class="badge hot">${data.questions.length} preguntas</span><span class="badge">Mínimo ${data.passScore}%</span>${att.allowed ? `<span class="badge ${att.left === 1 ? "bad" : ""}">${att.left === att.allowed ? att.allowed + " oportunidades" : "Te quedan " + att.left + " de " + att.allowed}</span>` : ""}</div>
      <button class="btn btn-primary" id="examStart">${att.used ? "Reintentar el examen" : "Comenzar examen"}</button>${hist}</div>`;
    $("examStart").onclick = () => runExam(box, l, course, lessons, data);
  }

  function runExam(box, l, course, lessons, data){
    const qs = data.questions, n = qs.length;
    const answers = new Array(n).fill(null);
    let cur = 0;
    const paint = () => {
      const done = answers.filter((a) => a !== null).length;
      box.innerHTML = `<div class="quiz">
        <div class="quiz-head"><span class="eyebrow">Pregunta ${cur + 1} de ${n}</span><span class="muted mono" style="font-size:12px">${done}/${n} respondidas</span></div>
        <div class="qprog"><i style="width:${(done / n) * 100}%"></i></div>
        <div class="qcard qslide"><h3>${esc(qs[cur].q)}</h3>${optsHtml(qs[cur], cur, answers[cur])}</div>
        <div class="quiz-foot">
          <button class="btn btn-ghost" id="qPrev"${cur === 0 ? " disabled" : ""}>← Anterior</button>
          ${cur < n - 1 ? `<button class="btn btn-primary" id="qNext"${answers[cur] === null ? " disabled" : ""}>Siguiente →</button>` : `<button class="btn btn-primary" id="qFinish"${done < n ? " disabled" : ""}>Enviar examen</button>`}
        </div>
        <div class="qdots">${qs.map((_, i) => `<button type="button" data-go="${i}" class="${answers[i] !== null ? "done" : ""}${i === cur ? " cur" : ""}">${i + 1}</button>`).join("")}</div>
      </div>`;
      box.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        answers[cur] = +b.dataset.o;
        if(cur < n - 1) setTimeout(() => { cur++; paint(); }, 220);
        paint();
      });
      box.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => { cur = +b.dataset.go; paint(); });
      $("qPrev").onclick = () => { cur--; paint(); };
      $("qNext")?.addEventListener("click", () => { cur++; paint(); });
      $("qFinish")?.addEventListener("click", () => submitExam(box, l, course, lessons, data, answers));
    };
    paint();
    box.scrollIntoView({behavior:"smooth", block:"start"});
  }

  async function submitExam(box, l, course, lessons, data, answers){
    const btn = $("qFinish");
    btn.disabled = true;
    btn.textContent = "Calificando…";
    let r;
    try{ r = await api("/api/assessment/" + l.id, {answers}); }
    catch(err){
      if(err.data && err.data.noAttempts) return renderAssessment(l, course, lessons);
      fail(err.message); btn.disabled = false; btn.textContent = "Enviar examen"; return;
    }
    if(r.passed){
      progress.set(l.id, {id:"", lesson:l.id});
      enrollments.set(course.id, {...(enrollments.get(course.id) || {}), status:"acreditado", score:r.score});
      if(r.certificate){ await loadCerts(true); certModal(r.certificate, true, r.score); }
      else{ ok("¡Curso acreditado!", "Aprobaste con " + r.score + "%."); }
      renderCourse(course.id, l.id);
      return;
    }
    const left = r.attempts && r.attempts.allowed ? r.attempts.left : null;
    box.innerHTML = `<div class="quiz"><div class="result">${ringSvg(r.score, "")}
      <div><h2>${r.noAttempts ? "No alcanzó esta vez" : "¡Estás cerca!"}</h2>
      <p>Acertaste ${r.correct} de ${r.total} (${r.score}%). Necesitás ${r.passScore}% para acreditar.
      ${r.noAttempts ? "Usaste todas tus oportunidades: comunicate con el equipo de InnovaFit para pedir apoyo y nuevas oportunidades." : left !== null ? "Te " + (left === 1 ? "queda 1 oportunidad" : "quedan " + left + " oportunidades") + ". Repasá las lecciones y volvé a intentarlo." : "Repasá las lecciones y volvé a intentarlo."}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${r.noAttempts
        ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${wa("Hola InnovaFit! Soy " + (me().name || me().email) + " (" + me().email + "). Usé mis oportunidades del examen de acreditación de " + course.title + " y quiero pedir apoyo y una nueva oportunidad.")}">Pedir apoyo por WhatsApp</a>`
        : `<button class="btn btn-primary" id="qAgain">Volver al inicio del examen</button><a class="btn btn-ghost" href="#/c/${course.id}/${lessons[0].id}">Repasar el curso</a>`}</div></div></div></div>`;
    animateRing(box);
    $("qAgain")?.addEventListener("click", () => renderAssessment(l, course, lessons));
    notify({type:"error", title:"Todavía no acreditaste", text:r.score + "% · se necesita " + r.passScore + "%"});
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

  function certModal(cert, celebrate, score){
    openModal(`${celebrate ? `<span class="eyebrow">🏆 ${score ? "Curso acreditado" : "Curso completado"}</span><h2 style="margin:10px 0 6px;font-size:clamp(28px,5vw,44px)">¡Felicitaciones, <span class="grad-text">${esc((me().name || "").split(" ")[0] || "crack")}!</span></h2>
      <p class="muted" style="margin:0 0 18px">${score ? "Aprobaste el examen con " + score + "%. " : ""}Este es tu certificado oficial InnovaFit. Ya quedó guardado en “Mis certificados”.</p>`
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
      : `<div class="card empty rise"><h2>Todavía no tenés certificados</h2><p>Aprobá el examen de acreditación de tu curso con 80% o más y tu certificado se genera al instante.</p><a class="btn btn-primary" href="#/">Ir a mis cursos</a></div>`}
    </div>`;
    const byId = new Map(list.map((c) => [c.id, c]));
    view.querySelectorAll("[data-prev]").forEach((el) => Cert.mount(el, byId.get(el.dataset.prev)));
    view.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => certModal(byId.get(b.dataset.open)));
    view.querySelectorAll(".cert-card").forEach((card) => bindDownloads(card, byId.get(card.querySelector("[data-id]").dataset.id)));
  }

  /* =====================================================
     CERTIFICACIONES ISSA: catálogo, ficha del programa e inscripción
     ===================================================== */
  const KIND_PROGRAM = {certificacion:"Certificación", especializacion:"Especialización", paquete:"Paquete"};
  const OPEN_INS = ["nuevo", "contactado", "por_validar", "pagado", "acceso", "rechazado"];
  const INS_STATUS = {
    nuevo:["Inscripción enviada", "hot"], contactado:["En contacto con tu asesor", "hot"], por_validar:["Comprobante en revisión", ""],
    pagado:["Pago validado", "good"], acceso:["Acceso enviado", "good"], rechazado:["Comprobante rechazado", "bad"], cancelado:["Cancelada", ""],
  };
  const lines = (t) => String(t || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const currencyOf = (s) => (s.saleCurrency || "USD").trim();
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmtDay = (s) => s ? new Date(String(s).replace(" ", "T")).toLocaleDateString("es-MX", {day:"numeric", month:"short", year:"numeric"}) : "";

  async function loadInscriptions(force){
    if(!inscriptions || force) inscriptions = await pb.collection("inscriptions").getFullList({filter: pb.filter("user = {:u}", {u: me().id}), sort:"-created"});
    return inscriptions;
  }
  const activeIns = (pid) => (inscriptions || []).find((i) => i.program === pid && OPEN_INS.includes(i.status));

  // Precio de la tarjeta y de la ficha: con oferta, tachado + precio InnovaSale.
  function priceBlock(p, off, cur){
    const price = +p.price || 0;
    const note = p.priceNote ? `<small class="pp-note">${esc(p.priceNote)}</small>` : "";
    if(off && price) return `<div class="pp"><s>${Sale.money(price)}</s><b>${Sale.money(off.salePrice)}</b><em>${esc(cur)}</em><span class="pp-off">-${off.pct}%</span></div>${note}`;
    if(off) return `<div class="pp"><span class="pp-off">-${off.pct}%</span><em>sobre el precio regular</em></div>`;
    if(price) return `<div class="pp">${+p.priceBefore > price ? `<s>${Sale.money(p.priceBefore)}</s>` : ""}<b>${Sale.money(price)}</b><em>${esc(cur)}</em></div>${note}`;
    return `<div class="pp"><b class="pp-ask">${esc(p.priceLabel || "Precio a consultar")}</b></div>`;
  }
  const slotsLine = (sale, p, off) => off && off.slots ? `<div class="sale-slots">Quedan ${off.slots} ${off.slots === 1 ? "cupo" : "cupos"} con descuento</div>`
    : Sale.soldOut(sale, p) ? `<div class="sold-out">Cupos de oferta agotados · precio regular</div>` : "";

  async function renderCertificaciones(){
    $("burger").hidden = true;
    setTab("certificaciones");
    let [items] = await Promise.all([pb.collection("programs").getFullList({sort:"order,title"}), loadInscriptions()]);
    const s = await settings();
    const sale = Sale.state(s);
    const cur = currencyOf(s);
    const offOf = (p) => Sale.forProgram(sale, p);
    // Con InnovaSale, las certificaciones en oferta van primero.
    if(sale) items = [...items].sort((a, b) => !!offOf(b) - !!offOf(a));
    const top = Math.max(0, ...items.map((p) => (offOf(p) || {pct: 0}).pct));
    const rib = sale ? "" : await ribbon();
    view.innerHTML = `<div class="page${sale ? " progs-sale" : ""}">
      ${sale ? `<div class="sale-head rise">
          <div class="sale-flames" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <canvas class="sale-fire" aria-hidden="true"></canvas>
          <div class="sale-in">
            <span class="sale-kicker">Ofertas exclusivas para alumnos · tiempo limitado</span>
            <h1 class="sale-word"><span>Innova</span><b>Sale</b></h1>
            <p>${esc(sale.text || "Descuentos en certificaciones ISSA solo por unos días. Cuando el reloj llega a cero, vuelven los precios normales.")}</p>
            <div class="sale-row"><div id="saleClock"></div>${top ? `<div class="sale-max">Hasta<b>-${top}%</b></div>` : ""}</div>
          </div></div>`
        : `<div class="hello rise"><span class="eyebrow">Tu próximo nivel</span><h1>Certificaciones <span class="grad-text">internacionales</span></h1>
        <p>Mirá el programa completo, el precio y a quién va dirigida cada una. Inscribite y un asesor de InnovaFit te acompaña hasta tener tu acceso.</p></div>
      <div class="rise">${await campaignHtml()}</div>`}
      <div class="issa-note rise"><span class="issa-mark">ISSA</span><p><b>Certificaciones emitidas y aprobadas por ISSA</b> (International Sports Sciences Association). InnovaFit las comercializa y te acompaña en la inscripción, el pago y el acceso.</p></div>
      <div class="progs">${items.map((p, i) => {
        const off = offOf(p), ins = activeIns(p.id), st = ins && INS_STATUS[ins.status];
        return `<article class="card prog${off ? " is-sale-card" : ""}" style="animation:rise .55s ${i * 60}ms both">${rib}
        <a class="cv" href="#/certificaciones/${p.id}" aria-label="Ver ${esc(p.title)}" ${p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}>${p.image ? "" : `<span>${esc(initials(p.title))}</span>`}${off ? `<span class="sale-off">-${off.pct}%</span>` : ""}</a>
        <div class="pb">
          <div class="meta"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span>${lines(p.highlights).slice(0, 2).map((h) => `<span class="badge">${esc(h)}</span>`).join("")}</div>
          <h3><a href="#/certificaciones/${p.id}">${esc(p.title)}</a></h3>
          ${priceBlock(p, off, cur)}
          ${slotsLine(sale, p, off)}
          <p>${esc(p.summary || "")}</p>
          ${st ? `<a class="ins-chip ${st[1]}" href="#/inscripciones"><i></i>${esc(st[0])}</a>` : ""}
          <div class="prog-actions">
            <a class="btn btn-primary" href="#/certificaciones/${p.id}">${off ? "🔥 Ver oferta" : "Ver programa"}</a>
            ${p.course && (me().courses || []).includes(p.course) ? `<a class="btn btn-ghost" href="#/c/${p.course}">Evaluación</a>` : ""}
          </div>
        </div></article>`; }).join("")}</div>
    </div>`;
    if(sale){
      const stopFire = Sale.fire(view.querySelector(".sale-fire"));
      const stopClock = Sale.countdown($("saleClock"), sale.ends, () => { stopSale(); if(location.hash.startsWith("#/certificaciones")) route(); });
      stopSale = () => { stopFire(); stopClock(); stopSale = () => {}; };
    }
  }
  let stopSale = () => {}; // detiene el reloj y el fuego de InnovaSale al salir de la sección

  // Íconos de línea para las tarjetas de la ficha.
  const ICONS = [
    '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    '<path d="M12 21s-8-4.5-8-11a5 5 0 019-3 5 5 0 019 3c0 6.5-8 11-8 11z" transform="translate(-1 0)"/>',
    '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    '<path d="M4 19V5a2 2 0 012-2h12v18H6a2 2 0 01-2-2zM8 7h6"/>',
    '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9l5 2-5 2z"/>',
  ];
  const icon = (i) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i % ICONS.length]}</svg>`;

  const PROCESS = [
    ["Te inscribís", "Completás el formulario y te guardamos el lugar con el precio de hoy."],
    ["Hablás con tu asesor", "Un asesor de InnovaFit te escribe por WhatsApp: dudas, forma de pago y fechas."],
    ["Subís el comprobante", "Desde Mis inscripciones, con el correo donde querés recibir el acceso."],
    ["Recibís tu acceso ISSA", "Validamos el pago y te llega el acceso a la plataforma de ISSA para estudiar y certificarte."],
  ];

  async function renderPrograma(id){
    $("burger").hidden = true;
    setTab("certificaciones");
    const [p] = await Promise.all([pb.collection("programs").getOne(id), loadInscriptions()]);
    const s = await settings();
    const sale = Sale.state(s), off = Sale.forProgram(sale, p), cur = currencyOf(s);
    const ins = activeIns(p.id);
    const mods = (Array.isArray(p.modules) ? p.modules : []).filter((m) => m && (m.title || m.topics));
    const aud = lines(p.audience), res = lines(p.resources), hi = lines(p.highlights);
    const img = p.image ? fileUrl(p, p.image) : "";
    const words = (t) => esc(t).split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(" ");
    // Número del nodo: el del título ("Módulos 2 y 3" → 2–3) o el orden si el título no lo trae.
    const nodeLabel = (m, i) => {
      const n = String(m.title || "").match(/\d+[A-Z]?/g);
      return n ? (n.length > 1 ? n[0] + "–" + n[n.length - 1] : n[0]) : String(i + 1).padStart(2, "0");
    };
    const cta = ins
      ? `<a class="ins-chip ${INS_STATUS[ins.status][1]}" href="#/inscripciones"><i></i>${esc(INS_STATUS[ins.status][0])}</a><a class="btn btn-primary" href="#/inscripciones">Ver mi inscripción</a>`
      : `<button class="btn btn-primary btn-lg" data-enroll>${off ? "🔥 Inscribirme con -" + off.pct + "%" : "Inscribirme"}</button>`;
    const brochure = p.brochure ? `<a class="btn btn-ghost" href="${fileUrl(p, p.brochure)}" target="_blank" rel="noopener" download>Descargar temario (PDF)</a>` : "";
    const sections = [
      p.objective && ["prog", "El programa"], aud.length && ["aud", "A quién va dirigido"], mods.length && ["mod", "Módulo a módulo"],
      res.length && ["res", "Recursos"], p.profile && ["perfil", "Perfil de egreso"], ["proc", "Cómo es la compra"],
    ].filter(Boolean);

    view.innerHTML = `<div class="ph">
      <section class="ph-hero">
        <div class="ph-bg" ${img ? `style="background-image:url('${img}')"` : ""}></div>
        <div class="page ph-in">
          <a class="ph-back" href="#/certificaciones">← Certificaciones</a>
          <div class="ph-badges"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span><span class="issa-chip"><b>ISSA</b> Certificación internacional · la comercializa InnovaFit</span></div>
          <h1 class="ph-title">${words(p.title)}</h1>
          ${p.summary ? `<p class="ph-sum">${esc(p.summary)}</p>` : ""}
          ${hi.length ? `<div class="ph-chips">${hi.map((h, i) => `<span style="--i:${i}">${esc(h)}</span>`).join("")}</div>` : ""}
          <div class="card ph-buy${off ? " on-sale" : ""}" id="phBuy">
            <div class="ph-buy-l">
              <span class="eyebrow">${off ? "🔥 Precio InnovaSale" : "Inversión"}</span>
              ${priceBlock(p, off, cur)}
              ${slotsLine(sale, p, off)}
              ${off && off.slots ? `<div class="slot-meter"><i style="--p:${Math.min(100, Math.round(off.slots / Math.max(1, Sale.slotsOf(sale, p).total) * 100))}%"></i></div>` : ""}
              ${off ? `<div class="ph-clock"><small>La oferta termina en</small><div id="phClock"></div></div>` : ""}
            </div>
            <div class="ph-buy-r">${cta}${brochure}<span class="muted ph-safe">Sin pagar nada todavía: un asesor te contacta para cerrar la compra.</span></div>
          </div>
        </div>
      </section>
      <nav class="ph-nav" id="phNav" aria-label="Secciones del programa"><div>${sections.map(([k, label]) => `<a href="#sec-${k}" data-sec="${k}">${label}</a>`).join("")}</div></nav>
      <div class="page ph-body">
        ${p.objective ? `<section class="ph-sec" id="sec-prog"><span class="eyebrow rv">El programa</span><h2 class="rv">Lo que vas a lograr</h2><p class="ph-lead rv">${esc(p.objective)}</p></section>` : ""}
        ${aud.length ? `<section class="ph-sec" id="sec-aud"><span class="eyebrow rv">Para quién es</span><h2 class="rv">A quién va dirigido</h2>
          <div class="aud-grid">${aud.map((a, i) => `<div class="card aud rv" style="--d:${i * 90}ms"><span class="aud-ic">${icon(i)}</span><p>${esc(a)}</p></div>`).join("")}</div></section>` : ""}
        ${mods.length ? `<section class="ph-sec" id="sec-mod">
          <div class="mod-head"><div><span class="eyebrow rv">Plan de estudios</span><h2 class="rv">Módulo a módulo</h2><p class="muted rv">Tocá cada módulo para ver lo que vas a aprender.</p></div>
            <div class="explore rv" aria-live="polite"><svg viewBox="0 0 44 44"><circle class="t" cx="22" cy="22" r="18"/><circle class="f" id="exRing" cx="22" cy="22" r="18" stroke-dasharray="113.1" stroke-dashoffset="113.1"/></svg>
              <div><b><span id="exN">0</span>/${mods.length}</b><small>explorados</small></div></div></div>
          <div class="tl" id="tl"><div class="tl-line"><i id="tlFill"></i></div>
            ${mods.map((m, i) => { const t = lines(m.topics); return `<article class="tl-item rv" data-i="${i}">
              <span class="tl-node${nodeLabel(m, i).length > 3 ? " sm" : ""}">${nodeLabel(m, i)}</span>
              <div class="tl-card card">
                <button class="tl-head" type="button" aria-expanded="false" aria-controls="tlb${i}"><h3>${esc(m.title || "Módulo " + (i + 1))}</h3><span class="tl-count">${t.length} ${t.length === 1 ? "tema" : "temas"}</span><span class="tl-plus" aria-hidden="true"></span></button>
                <div class="tl-body" id="tlb${i}"><div><ul>${t.map((x, k) => `<li style="--k:${k}">${esc(x)}</li>`).join("")}</ul></div></div>
              </div></article>`; }).join("")}
          </div>
          <div class="tl-foot"><button class="btn btn-ghost btn-sm" id="tlAll" type="button">Abrir todos los módulos</button></div>
          <div class="ex-done" id="exDone" hidden><b>¡Recorriste todo el programa!</b><span>Ya sabés lo que vas a aprender. ${ins ? "Seguí tu inscripción desde Mis inscripciones." : "¿Te inscribís?"}</span>${ins ? "" : `<button class="btn btn-primary btn-sm" data-enroll>Inscribirme</button>`}</div>
        </section>` : ""}
        ${res.length ? `<section class="ph-sec" id="sec-res"><span class="eyebrow rv">Incluye</span><h2 class="rv">Recursos y metodología</h2>
          <div class="res-grid">${res.map((r, i) => `<div class="res rv" style="--d:${i * 80}ms"><span class="res-ic">${icon(i + 4)}</span><p>${esc(r)}</p></div>`).join("")}</div></section>` : ""}
        ${p.profile ? `<section class="ph-sec" id="sec-perfil"><span class="eyebrow rv">Al terminar</span><h2 class="rv">Perfil de egreso</h2>
          <blockquote class="perfil" id="perfilQ">${esc(p.profile).split(/\s+/).map((w, i) => `<span style="--i:${i}">${w}</span>`).join(" ")}</blockquote></section>` : ""}
        <section class="ph-sec" id="sec-proc"><span class="eyebrow rv">Paso a paso</span><h2 class="rv">Cómo es la compra</h2>
          <ol class="proc" id="proc">${PROCESS.map(([t, d], i) => `<li class="rv" style="--d:${i * 140}ms"><span class="proc-n">${i + 1}</span><b>${t}</b><p>${d}</p></li>`).join("")}</ol>
          <p class="muted proc-note">La certificación la emite ISSA. El acceso llega al correo que indiques al subir tu comprobante.</p></section>
        <section class="ph-final rv"><h2>${off ? "La oferta no espera" : "Tu próximo nivel empieza acá"}</h2><p>${esc(p.title)}</p><div class="ph-final-a">${cta}${brochure}</div></section>
      </div>
      <div class="ph-sticky" id="phSticky"><div><b>${esc(p.title)}</b>${priceBlock(p, off, cur)}</div>${ins ? `<a class="btn btn-primary btn-sm" href="#/inscripciones">Mi inscripción</a>` : `<button class="btn btn-primary btn-sm" data-enroll>Inscribirme</button>`}</div>
    </div>`;

    view.querySelectorAll("[data-enroll]").forEach((b) => b.onclick = () => enrollModal(p, off, cur));
    mountPrograma(mods.length);
    if(off){
      const stopClock = Sale.countdown($("phClock"), sale.ends, () => { stopSale(); route(); });
      stopSale = () => { stopClock(); stopSale = () => {}; };
    }
  }

  // Animaciones de la ficha: aparición al hacer scroll, línea de tiempo que se llena, módulos explorados.
  function mountPrograma(total){
    const still = reduceMotion();
    const io = new IntersectionObserver((es) => es.forEach((e) => { if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }), {threshold:.12, rootMargin:"0px 0px -6% 0px"});
    view.querySelectorAll(".rv, .perfil, .proc").forEach((el) => (still ? el.classList.add("in") : io.observe(el)));
    onLeave(() => io.disconnect());

    // Sección activa en la barra de navegación (queda fija debajo de las pestañas del campus).
    const nav = $("phNav");
    nav.style.top = 64 + $("tabsRow").offsetHeight + "px";
    const spy = new IntersectionObserver((es) => es.forEach((e) => {
      if(!e.isIntersecting) return;
      const k = e.target.id.replace("sec-", "");
      nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.sec === k));
      nav.querySelector("a.on")?.scrollIntoView({block:"nearest", inline:"center", behavior: still ? "auto" : "smooth"});
    }), {rootMargin:"-40% 0px -55% 0px"});
    view.querySelectorAll(".ph-sec").forEach((sec) => spy.observe(sec));
    onLeave(() => spy.disconnect());
    nav.querySelectorAll("a").forEach((a) => a.onclick = (e) => {
      e.preventDefault();
      const t = $("sec-" + a.dataset.sec);
      if(t) scrollTo({top: t.getBoundingClientRect().top + scrollY - 120, behavior: still ? "auto" : "smooth"});
    });

    // Barra fija de compra cuando el bloque de precio sale de pantalla.
    const sticky = $("phSticky");
    const buyIo = new IntersectionObserver(([e]) => sticky.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0));
    buyIo.observe($("phBuy"));
    onLeave(() => buyIo.disconnect());

    const tl = $("tl");
    if(!tl) return;
    const fill = $("tlFill");
    const onScroll = () => {
      const r = tl.getBoundingClientRect();
      fill.style.transform = "scaleY(" + Math.min(1, Math.max(0, (innerHeight * .62 - r.top) / r.height)) + ")";
      tl.querySelectorAll(".tl-item").forEach((it) => it.classList.toggle("lit", it.getBoundingClientRect().top < innerHeight * .62));
    };
    addEventListener("scroll", onScroll, {passive:true});
    onLeave(() => removeEventListener("scroll", onScroll));
    onScroll();

    const seen = new Set();
    const C = 113.1;
    const mark = (i) => {
      if(seen.has(i)) return;
      seen.add(i);
      $("exN").textContent = seen.size;
      $("exRing").style.strokeDashoffset = C - (seen.size / total) * C;
      if(seen.size === total){
        $("exDone").hidden = false;
        $("exDone").querySelector("[data-enroll]")?.addEventListener("click", () => view.querySelector(".ph-buy [data-enroll]")?.click());
        confetti();
      }
    };
    const toggle = (item, open) => {
      const btn = item.querySelector(".tl-head");
      const on = open ?? btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", on);
      item.classList.toggle("open", on);
      if(on) mark(+item.dataset.i);
    };
    tl.querySelectorAll(".tl-item").forEach((item) => {
      item.querySelector(".tl-head").onclick = () => toggle(item);
      item.querySelector(".tl-node").onclick = () => toggle(item, true);
      // Inclinación 3D suave siguiendo el cursor.
      if(still || matchMedia("(pointer: coarse)").matches) return;
      const card = item.querySelector(".tl-card");
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--rx", ((e.clientY - r.top) / r.height - .5) * -4 + "deg");
        card.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 5 + "deg");
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      });
      card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    });
    $("tlAll").onclick = () => {
      const all = [...tl.querySelectorAll(".tl-item")];
      const open = all.some((it) => !it.classList.contains("open"));
      all.forEach((it, k) => setTimeout(() => toggle(it, open), still ? 0 : k * 70));
      $("tlAll").textContent = open ? "Cerrar todos los módulos" : "Abrir todos los módulos";
    };
  }

  /* ---------- Formulario de inscripción (2 pasos) ---------- */
  const EXPERIENCE = ["Estoy empezando en el fitness", "Entreno personas sin certificación", "Ya tengo otra certificación", "Soy profesional de la salud"];
  const PAY_PLAN = ["Pago único", "Meses sin intereses", "Quiero que me asesoren"];
  const CONTACT_TIME = ["Mañana", "Tarde", "Noche"];

  function enrollModal(p, off, cur){
    const u = me();
    const countries = $("regForm").country.innerHTML;
    const price = +p.price || 0;
    const final = off && price ? off.salePrice : price;
    const chips = (name, list, sel) => `<div class="chips" role="radiogroup">${list.map((v) => `<label class="chip"><input type="radio" name="${name}" value="${esc(v)}"${v === sel ? " checked" : ""}><span>${esc(v)}</span></label>`).join("")}</div>`;
    openModal(`<div class="enroll">
      <div class="enroll-top"><span class="eyebrow">Inscripción</span><h2>${esc(p.title)}</h2>
        <div class="enroll-sum">${final ? `<b>${Sale.money(final)} ${esc(cur)}</b>` : ""}${off ? `<span class="pp-off">-${off.pct}% InnovaSale</span>` : ""}<span class="muted">Hoy no pagás nada: un asesor te contacta para cerrar la compra.</span></div>
        <div class="enroll-steps"><span class="on">1 · Tus datos</span><span>2 · Tu perfil</span></div><div class="enroll-bar"><i></i></div></div>
      <form id="enForm" novalidate>
        <div class="enroll-step" data-step="1">
          <label class="field"><span>Nombre y apellido completos</span><input class="input" name="name" autocomplete="name" value="${esc(u.name || "")}"></label>
          <label class="field"><span>Correo de contacto</span><input class="input" name="email" type="email" autocomplete="email" value="${esc(u.email || "")}"></label>
          <div class="phone-row">
            <label class="field"><span>País</span><select class="input" name="country">${countries}</select></label>
            <label class="field"><span>WhatsApp</span><input class="input" name="phone" inputmode="numeric" autocomplete="tel-national" value="${esc(u.phone || "")}"></label>
          </div>
          <div class="two">
            <label class="field"><span>Ciudad</span><input class="input" name="city" autocomplete="address-level2" placeholder="Ej: Guadalajara"></label>
            <label class="field"><span>Identificación (CURP / DNI)</span><input class="input" name="docId" value="${esc(u.docId || "")}"></label>
          </div>
        </div>
        <div class="enroll-step" data-step="2" hidden>
          <div class="field"><span>¿Dónde estás hoy?</span>${chips("experience", EXPERIENCE, EXPERIENCE[0])}</div>
          <div class="field"><span>¿Cómo te gustaría pagar?</span>${chips("payPlan", PAY_PLAN, PAY_PLAN[2])}</div>
          <div class="field"><span>¿Cuándo te contactamos?</span>${chips("contactTime", CONTACT_TIME, CONTACT_TIME[1])}</div>
          <label class="field"><span>¿Algo que tu asesor deba saber? (opcional)</span><textarea class="input" name="message" rows="3" maxlength="1000" placeholder="Ej: quiero empezar este mes"></textarea></label>
          <label class="check consent"><input type="checkbox" name="consent"> Entiendo que la certificación la emite ISSA y que InnovaFit me contacta para cerrar la compra.</label>
        </div>
        <p class="error-msg" id="enErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-back>Cancelar</button><button class="btn btn-primary" id="enNext">Siguiente →</button></div>
      </form></div>`, (m) => {
      const f = m.querySelector("#enForm"), err = m.querySelector("#enErr"), next = m.querySelector("#enNext"), back = m.querySelector("[data-back]");
      f.country.value = u.country && [...f.country.options].some((o) => o.value === u.country) ? u.country : "52";
      let step = 1;
      const show = (n) => {
        step = n;
        m.querySelectorAll(".enroll-step").forEach((s) => (s.hidden = +s.dataset.step !== n));
        m.querySelectorAll(".enroll-steps span").forEach((s, i) => s.classList.toggle("on", i < n));
        m.querySelector(".enroll-bar i").style.width = n * 50 + "%";
        next.textContent = n === 1 ? "Siguiente →" : "Enviar inscripción";
        back.textContent = n === 1 ? "Cancelar" : "← Atrás";
        err.textContent = "";
        m.querySelector(`[data-step="${n}"] input, [data-step="${n}"] textarea`)?.focus({preventScroll:true});
      };
      back.onclick = () => (step === 1 ? closeModal() : show(1));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(f));
        if(step === 1){
          const name = (d.name || "").trim().replace(/\s+/g, " ");
          if(name.length < 5 || !name.includes(" ")) return void (err.textContent = "Escribí tu nombre y apellido completos.");
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((d.email || "").trim())) return void (err.textContent = "Revisá tu correo.");
          if((d.phone || "").replace(/\D/g, "").length < 7) return void (err.textContent = "Revisá tu WhatsApp.");
          if((d.city || "").trim().length < 2) return void (err.textContent = "Contanos en qué ciudad estás.");
          return show(2);
        }
        if(!f.consent.checked) return void (err.textContent = "Confirmá que entendés cómo es la compra.");
        next.disabled = true;
        next.textContent = "Enviando…";
        try{
          const r = await api("/api/inscriptions", {...d, program: p.id});
          inscriptions = null;
          enrollDone(p, r);
        }catch(e2){
          err.textContent = e2.message;
          next.disabled = false;
          next.textContent = "Enviar inscripción";
          if(e2.status === 409) setTimeout(() => { closeModal(); location.hash = "#/inscripciones"; }, 1600);
        }
      };
    });
  }

  function enrollDone(p, r){
    const when = r.contactTime ? " por la " + r.contactTime.toLowerCase() : "";
    const msg = "Hola InnovaFit! 👋 Soy " + r.name + ". Me inscribí en " + p.title + " desde el campus (folio " + r.code + ")." +
      (r.saleApplied ? " Tengo el " + r.discount + "% de InnovaSale." : "") + " Quiero cerrar mi compra.";
    openModal(`<div class="enroll-ok">
      <div class="ok-badge"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><path d="M14 27l8 8 17-18"/></svg></div>
      <span class="eyebrow">Folio ${esc(r.code)}</span>
      <h2>¡Listo, ${esc((r.name || "").split(" ")[0])}!</h2>
      <p>Te reservamos el lugar en <b>${esc(p.title)}</b>${r.price ? " a <b>" + Sale.money(r.price) + " " + esc(r.currency) + "</b>" : ""}. Un asesor de InnovaFit te va a escribir por WhatsApp${esc(when)}.</p>
      <ol class="ok-next"><li>Hablás con tu asesor y pagás.</li><li>Subís el comprobante en <b>Mis inscripciones</b>.</li><li>Te llega el acceso de ISSA a tu correo.</li></ol>
      <div class="modal-actions" style="justify-content:center"><a class="btn btn-ghost" target="_blank" rel="noopener" href="${wa(msg)}">Escribir ahora por WhatsApp</a><a class="btn btn-primary" href="#/inscripciones" data-close>Ver mis inscripciones</a></div>
    </div>`, () => confetti(), "celebrate-sm");
    if(location.hash.startsWith("#/certificaciones/")) renderPrograma(p.id);
  }

  /* =====================================================
     MIS INSCRIPCIONES: estado de la compra y comprobante de pago
     ===================================================== */
  const STEPS = ["Inscripción", "Asesor", "Comprobante", "Acceso"];
  const stepOf = (st) => ({nuevo:0, contactado:1, rechazado:1, por_validar:2, pagado:3, acceso:4}[st] ?? 0);

  async function protectedUrl(rec, name){
    const token = await pb.files.getToken();
    return pb.files.getURL(rec, name, {token});
  }

  async function renderInscripciones(){
    $("burger").hidden = true;
    setTab("inscripciones");
    const [list, progs] = await Promise.all([loadInscriptions(true), pb.collection("programs").getFullList({fields:"id,collectionId,image,title"})]);
    const progById = new Map(progs.map((p) => [p.id, p]));
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Tus compras</span><h1>Mis <span class="grad-text">inscripciones</span></h1>
        <p>Seguí cada certificación: hablás con tu asesor, subís el comprobante y te avisamos cuando el acceso de ISSA está en tu correo.</p></div>
      ${list.length ? `<div class="ins-list">${list.map((i, k) => {
        const p = progById.get(i.program), st = INS_STATUS[i.status] || ["", ""], at = stepOf(i.status), off = i.status === "cancelado";
        const canUpload = ["nuevo", "contactado", "rechazado"].includes(i.status);
        const waMsg = "Hola InnovaFit! Soy " + i.name + ". Te escribo por mi inscripción en " + i.programTitle + " (folio " + i.code + ").";
        return `<article class="card ins${off ? " off" : ""}" data-id="${i.id}" style="animation:rise .55s ${k * 70}ms both">
          <div class="ins-top">
            <div class="ins-cv" ${p && p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}></div>
            <div class="ins-h"><span class="ins-chip ${st[1]}"><i></i>${esc(st[0])}</span><h3>${esc(i.programTitle)}</h3>
              <small class="muted">Folio <b class="mono">${esc(i.code)}</b> · ${fmtDay(i.created)}${i.price ? " · " + Sale.money(i.price) + " " + esc(i.currency) : ""}${i.saleApplied ? ` <span class="pp-off">-${i.discount}%</span>` : ""}</small></div>
          </div>
          ${off ? "" : `<ol class="ins-steps" style="--at:${at}">${STEPS.map((s, n) => `<li class="${n < at ? "done" : n === at ? "cur" : ""}${n === 2 && i.status === "rechazado" ? " bad" : ""}"><i></i><span>${s}</span></li>`).join("")}</ol>`}
          <div class="ins-msg">${insMessage(i)}</div>
          <div class="ins-act">
            ${canUpload ? `<button class="btn btn-primary btn-sm" data-up>${i.status === "rechazado" ? "Subir otro comprobante" : "Subir comprobante de pago"}</button>` : ""}
            ${i.status === "por_validar" ? `<button class="btn btn-ghost btn-sm" data-see>Ver mi comprobante</button><button class="btn btn-ghost btn-sm" data-up>Reemplazarlo</button>` : ""}
            ${off ? "" : `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${wa(waMsg)}">WhatsApp con mi asesor</a>`}
            ${p ? `<a class="btn btn-ghost btn-sm" href="#/certificaciones/${p.id}">Ver programa</a>` : ""}
            ${canUpload ? `<button class="btn btn-ghost btn-sm ins-cancel" data-cancel>Cancelar</button>` : ""}
          </div>
        </article>`; }).join("")}</div>`
      : `<div class="card empty rise"><h2>Todavía no te inscribiste en ninguna certificación</h2><p>Mirá los programas ISSA, elegí el tuyo y un asesor te acompaña en la compra.</p><a class="btn btn-primary" href="#/certificaciones">Ver certificaciones</a></div>`}
    </div>`;
    const byId = new Map(list.map((i) => [i.id, i]));
    view.querySelectorAll(".ins[data-id]").forEach((card) => {
      const i = byId.get(card.dataset.id);
      card.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => receiptModal(i));
      card.querySelector("[data-see]")?.addEventListener("click", async () => {
        try{ window.open(await protectedUrl(i, i.receipt), "_blank", "noopener"); }catch(err){ fail(err); }
      });
      card.querySelector("[data-cancel]")?.addEventListener("click", () => openModal(`<h2>Cancelar inscripción</h2><p class="muted" style="margin:0 0 20px">Se cancela tu inscripción en ${esc(i.programTitle)}${i.usedSlot ? " y liberás tu cupo con descuento" : ""}. Podés volver a inscribirte cuando quieras.</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Volver</button><button class="btn btn-danger" id="cOk">Cancelar inscripción</button></div>`, (m) => {
        m.querySelector("#cOk").onclick = async () => {
          try{ await api("/api/inscriptions/" + i.id + "/cancel", {}); closeModal(); ok("Inscripción cancelada", "Cuando quieras, te inscribís de nuevo."); renderInscripciones(); }
          catch(err){ fail(err.message); }
        };
      }));
    });
  }

  function insMessage(i){
    const box = (cls, title, text) => `<div class="ins-note ${cls}"><b>${title}</b><span>${text}</span></div>`;
    switch(i.status){
      case "nuevo": return box("", "Un asesor te va a escribir por WhatsApp", "Te contactamos" + (i.contactTime ? " por la " + esc(i.contactTime.toLowerCase()) : "") + " para resolver dudas y la forma de pago. Cuando pagues, subí acá tu comprobante.");
      case "contactado": return box("", "Ya estás en contacto con tu asesor", "Cuando pagues, subí el comprobante y el correo donde querés recibir el acceso de ISSA.");
      case "rechazado": return box("bad", "Revisamos tu comprobante y no pudimos validarlo", esc(i.rejectReason || "Escribile a tu asesor para revisarlo juntos.") + " Podés subir otro.");
      case "por_validar": return box("", "Estamos revisando tu comprobante", "El acceso va a llegar a <b>" + esc(i.accessEmail) + "</b>. Te avisamos acá cuando esté validado.");
      case "pagado": return box("good", "¡Pago validado!", "Estamos gestionando tu acceso con ISSA. Va a llegar a <b>" + esc(i.accessEmail) + "</b>.");
      case "acceso": return box("good", "¡Tu acceso está en camino a tu correo!", "Lo enviamos a <b>" + esc(i.accessEmail) + "</b>" + (i.accessSentAt ? " el " + fmtDay(i.accessSentAt) : "") + ". Revisá también la carpeta de spam. ¿No te llegó? Escribinos desde Soporte.");
      default: return box("", "Inscripción cancelada", "Si fue un error, inscribite de nuevo desde Certificaciones.");
    }
  }

  function receiptModal(i){
    const MAX = 10 * 1024 * 1024;
    const TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    let file = null;
    openModal(`<span class="eyebrow">Folio ${esc(i.code)}</span><h2 style="margin:8px 0 6px">Comprobante de pago</h2>
      <p class="muted" style="margin:0 0 16px">${esc(i.programTitle)}. Subí la foto o el PDF del pago: el equipo lo valida y te envía el acceso de ISSA.</p>
      <form id="rcForm" novalidate>
        <label class="drop" id="rcDrop"><input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden>
          <div class="drop-in" id="rcPrev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
            <b>Tocá para elegir el archivo</b><span>o arrastralo acá · JPG, PNG, WEBP o PDF · hasta 10 MB</span></div></label>
        <label class="field"><span>Correo donde querés recibir el acceso a la certificación</span><input class="input" name="accessEmail" type="email" value="${esc(i.accessEmail || me().email)}"></label>
        <div class="two">
          <label class="field"><span>Monto pagado</span><input class="input" name="amount" type="number" min="0" step="0.01" value="${esc(i.price || "")}"></label>
          <label class="field"><span>Referencia u operación (opcional)</span><input class="input" name="ref" maxlength="200" placeholder="Banco, folio, últimos dígitos…"></label>
        </div>
        <div class="upbar" id="rcBar" hidden><i></i></div>
        <p class="error-msg" id="rcErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="rcSend">Enviar comprobante</button></div>
      </form>`, (m) => {
      const f = m.querySelector("#rcForm"), drop = m.querySelector("#rcDrop"), err = m.querySelector("#rcErr");
      const pick = (x) => {
        err.textContent = "";
        if(!x) return;
        if(!TYPES.includes(x.type)) return void (err.textContent = "Ese archivo no sirve: subí una imagen o un PDF.");
        if(x.size > MAX) return void (err.textContent = "El archivo pesa más de 10 MB.");
        file = x;
        m.querySelector("#rcPrev").innerHTML = x.type.startsWith("image/")
          ? `<img src="${URL.createObjectURL(x)}" alt="Vista previa del comprobante"><span>${esc(x.name)} · tocá para cambiarlo</span>`
          : `<span class="pdf-ic">PDF</span><b>${esc(x.name)}</b><span>${(x.size / 1048576).toFixed(1)} MB · tocá para cambiarlo</span>`;
        drop.classList.add("has");
      };
      f.file.onchange = () => pick(f.file.files[0]);
      ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));
      f.onsubmit = (e) => {
        e.preventDefault();
        err.textContent = "";
        const email = f.accessEmail.value.trim();
        if(!file) return void (err.textContent = "Elegí el archivo del comprobante.");
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return void (err.textContent = "Revisá el correo donde querés recibir el acceso.");
        const send = m.querySelector("#rcSend"), bar = m.querySelector("#rcBar");
        send.disabled = true; send.textContent = "Subiendo…"; bar.hidden = false;
        const qs = new URLSearchParams({accessEmail: email, amount: f.amount.value || "0", ref: f.ref.value.trim()});
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/inscriptions/" + i.id + "/receipt?" + qs);
        xhr.setRequestHeader("content-type", file.type);
        xhr.setRequestHeader("Authorization", pb.authStore.token || "");
        xhr.upload.onprogress = (ev) => { if(ev.lengthComputable) bar.firstElementChild.style.width = (ev.loaded / ev.total) * 100 + "%"; };
        xhr.onload = () => {
          let data = {};
          try{ data = JSON.parse(xhr.responseText); }catch{}
          if(xhr.status >= 200 && xhr.status < 300){
            closeModal();
            ok("¡Comprobante enviado!", "Te avisamos acá cuando esté validado.");
            inscriptions = null;
            renderInscripciones();
            return;
          }
          err.textContent = data.message || "No se pudo subir. Probá de nuevo.";
          send.disabled = false; send.textContent = "Enviar comprobante"; bar.hidden = true;
        };
        xhr.onerror = () => { err.textContent = "Se cortó la conexión. Probá de nuevo."; send.disabled = false; send.textContent = "Enviar comprobante"; bar.hidden = true; };
        xhr.send(file);
      };
    });
  }

  /* =====================================================
     SOPORTE: tickets con conversación
     ===================================================== */
  const TICKET_CATS = ["Acceso y cuenta", "Cursos y exámenes", "Certificados", "Inscripciones y pagos", "Otro"];
  const TICKET_STATUS = {abierto:["Abierto · esperando al equipo", "hot"], respondido:["Respondido", "good"], cerrado:["Resuelto", ""]};
  const ago = (s) => {
    const m = Math.round((Date.now() - new Date(String(s).replace(" ", "T"))) / 60000);
    if(m < 1) return "recién";
    if(m < 60) return "hace " + m + " min";
    if(m < 1440) return "hace " + Math.round(m / 60) + " h";
    return fmtDay(s);
  };

  async function refreshSupportDot(){
    try{
      const r = await pb.collection("tickets").getList(1, 1, {filter: pb.filter("user = {:u} && unreadUser = true", {u: me().id}), fields:"id"});
      $("supDot").hidden = !r.totalItems;
    }catch{}
  }

  async function renderSoporte(){
    $("burger").hidden = true;
    setTab("soporte");
    const list = await pb.collection("tickets").getFullList({filter: pb.filter("user = {:u}", {u: me().id}), sort:"-lastAt,-created"});
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Estamos para ayudarte</span><h1>Soporte <span class="grad-text">InnovaFit</span></h1>
        <p>Contanos qué pasa y el equipo te responde acá mismo. Cada consulta queda como un ticket con toda la conversación.</p></div>
      <div class="sup-top rise"><button class="btn btn-primary" id="tNew">+ Nueva consulta</button></div>
      ${list.length ? `<div class="tk-list">${list.map((t, k) => { const st = TICKET_STATUS[t.status] || TICKET_STATUS.abierto; return `<a class="card tk${t.unreadUser ? " unread" : ""}" href="#/soporte/${t.id}" style="animation:rise .5s ${k * 50}ms both">
          <span class="tk-dot" aria-hidden="true"></span>
          <div><b>${esc(t.subject)}</b><small class="muted">${esc(t.category || "Consulta")} · #${esc(t.id.slice(0, 6).toUpperCase())} · ${ago(t.lastAt || t.created)}</small></div>
          <span class="badge ${st[1]}">${t.unreadUser ? "Nueva respuesta" : esc(st[0])}</span></a>`; }).join("")}</div>`
      : `<div class="card empty rise"><h2>No tenés consultas abiertas</h2><p>¿Algo no funciona o tenés una duda sobre un curso, tu certificado o un pago? Escribinos.</p><button class="btn btn-primary" id="tNew2">Escribir al equipo</button></div>`}
    </div>`;
    $("tNew").onclick = () => newTicketModal();
    $("tNew2")?.addEventListener("click", () => newTicketModal());
    refreshSupportDot();
  }

  // Sube el archivo opcional junto al mensaje (FormData) y devuelve el mensaje creado.
  function sendMessage(ticketId, body, file){
    const fd = new FormData();
    fd.set("ticket", ticketId);
    fd.set("author", me().id);
    fd.set("authorName", me().name || me().email);
    fd.set("body", body);
    if(file) fd.set("file", file);
    return pb.collection("ticket_messages").create(fd);
  }

  function newTicketModal(pre){
    openModal(`<span class="eyebrow">Nueva consulta</span><h2 style="margin:8px 0 14px">¿En qué te ayudamos?</h2>
      <form id="tkForm" novalidate>
        <div class="field"><span>Tema</span><div class="chips">${TICKET_CATS.map((c, i) => `<label class="chip"><input type="radio" name="category" value="${esc(c)}"${(pre ? c === pre.category : i === 0) ? " checked" : ""}><span>${esc(c)}</span></label>`).join("")}</div></div>
        <label class="field"><span>Asunto</span><input class="input" name="subject" maxlength="160" placeholder="Ej: no puedo ver el video de la lección 3" value="${esc(pre ? pre.subject : "")}"></label>
        <label class="field"><span>Contanos con detalle</span><textarea class="input" name="body" rows="5" maxlength="5000"></textarea></label>
        <label class="field"><span>Adjuntar captura o PDF (opcional, hasta 10 MB)</span><input class="input" type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label>
        <p class="error-msg" id="tkErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="tkSend">Enviar consulta</button></div>
      </form>`, (m) => {
      const f = m.querySelector("#tkForm"), err = m.querySelector("#tkErr");
      f.onsubmit = async (e) => {
        e.preventDefault();
        const subject = f.subject.value.trim(), body = f.body.value.trim(), file = f.file.files[0];
        if(subject.length < 4) return void (err.textContent = "Escribí un asunto corto.");
        if(body.length < 5) return void (err.textContent = "Contanos un poco más.");
        if(file && file.size > 10 * 1024 * 1024) return void (err.textContent = "El archivo pesa más de 10 MB.");
        const btn = m.querySelector("#tkSend");
        btn.disabled = true;
        try{
          const now = new Date().toISOString().replace("T", " ");
          const t = await pb.collection("tickets").create({user: me().id, subject, category: f.category.value, status:"abierto", unreadTeam:true, unreadUser:false, lastAt: now});
          await sendMessage(t.id, body, file);
          closeModal();
          ok("¡Consulta enviada!", "El equipo te responde acá. Te avisamos con un punto en Soporte.");
          location.hash = "#/soporte/" + t.id;
        }catch(err2){ err.textContent = errMsg(err2); btn.disabled = false; }
      };
    });
  }

  async function renderTicket(id){
    $("burger").hidden = true;
    setTab("soporte");
    let t = await pb.collection("tickets").getOne(id);
    const paint = async () => {
      const msgs = await pb.collection("ticket_messages").getFullList({filter: pb.filter("ticket = {:t}", {t: id}), sort:"created"});
      const token = msgs.some((x) => x.file) ? await pb.files.getToken() : "";
      const st = TICKET_STATUS[t.status] || TICKET_STATUS.abierto;
      const box = $("thread");
      if(!box) return;
      const wasBottom = box.dataset.n !== String(msgs.length);
      box.dataset.n = msgs.length;
      box.innerHTML = msgs.map((x) => `<div class="msg ${x.fromTeam ? "team" : "me"}">
        <div class="msg-h">${x.fromTeam ? `<b>${esc(x.authorName || "Equipo")}</b><span class="badge hot">Equipo InnovaFit</span>` : "<b>Vos</b>"}<small>${ago(x.created)}</small></div>
        <div class="msg-b">${esc(x.body).replace(/\n/g, "<br>")}</div>
        ${x.file ? `<a class="msg-file" target="_blank" rel="noopener" href="${pb.files.getURL(x, x.file, {token})}">📎 ${esc(x.file.replace(/_[a-z0-9]{10}(\.\w+)$/i, "$1"))}</a>` : ""}
      </div>`).join("");
      $("tkState").innerHTML = `<span class="badge ${st[1]}">${esc(st[0])}</span>`;
      $("tkClose").textContent = t.status === "cerrado" ? "Reabrir consulta" : "Marcar como resuelta";
      if(wasBottom) box.lastElementChild?.scrollIntoView({block:"nearest"});
    };
    view.innerHTML = `<div class="page tk-page">
      <a class="ph-back" href="#/soporte">← Soporte</a>
      <div class="tk-head rise"><div><span class="eyebrow">${esc(t.category || "Consulta")} · #${esc(t.id.slice(0, 6).toUpperCase())}</span><h1>${esc(t.subject)}</h1></div><div id="tkState"></div></div>
      <div class="card thread rise" id="thread"></div>
      <form class="card reply rise" id="rpForm" novalidate>
        <textarea class="input" name="body" rows="3" maxlength="5000" placeholder="Escribí tu mensaje…"></textarea>
        <div class="reply-a"><label class="btn btn-ghost btn-sm attach">📎 Adjuntar<input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden></label><span class="muted" id="rpFile"></span>
          <button type="button" class="btn btn-ghost btn-sm" id="tkClose"></button><button class="btn btn-primary btn-sm" id="rpSend">Enviar</button></div>
      </form></div>`;
    const f = $("rpForm");
    f.file.onchange = () => { $("rpFile").textContent = f.file.files[0] ? f.file.files[0].name : ""; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = f.body.value.trim(), file = f.file.files[0];
      if(!body) return;
      if(file && file.size > 10 * 1024 * 1024) return fail("El archivo pesa más de 10 MB.");
      $("rpSend").disabled = true;
      try{
        await sendMessage(id, body, file);
        t = await pb.collection("tickets").update(id, {status:"abierto", unreadTeam:true, lastAt: new Date().toISOString().replace("T", " ")});
        f.reset(); $("rpFile").textContent = "";
        await paint();
      }catch(err){ fail(err); }
      finally{ $("rpSend").disabled = false; }
    };
    $("tkClose").onclick = async () => {
      try{
        t = await pb.collection("tickets").update(id, {status: t.status === "cerrado" ? "abierto" : "cerrado", unreadTeam: t.status === "cerrado"});
        ok(t.status === "cerrado" ? "¡Consulta resuelta!" : "Consulta reabierta", t.status === "cerrado" ? "Gracias por avisarnos." : "El equipo la vuelve a ver.");
        paint();
      }catch(err){ fail(err); }
    };
    await paint();
    if(t.unreadUser){ t = await pb.collection("tickets").update(id, {unreadUser:false}).catch(() => t); refreshSupportDot(); }
    // Revisa respuestas nuevas mientras la conversación está abierta.
    const timer = setInterval(async () => {
      try{
        const fresh = await pb.collection("tickets").getOne(id);
        if(fresh.updated !== t.updated){ t = fresh; await paint(); if(t.unreadUser){ t = await pb.collection("tickets").update(id, {unreadUser:false}); } }
      }catch{}
    }, 15000);
    onLeave(() => clearInterval(timer));
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
    const gate = needsProfile();
    const head = gate
      ? `<div class="hello rise"><span class="eyebrow">Paso 1 de 2 · Antes de empezar</span><h1>Completá tu <span class="grad-text">perfil</span></h1><p>Necesitamos estos datos para emitir tus certificados. Al guardarlos se desbloquea todo el campus.</p></div>
        <div class="card gate-check rise" id="gateCheck">${PROFILE_REQ.map(([k, label]) => `<span data-k="${k}"><i></i>${esc(label)}</span>`).join("")}</div>`
      : `<div class="hello rise"><span class="eyebrow">Tu cuenta</span><h1>Mi <span class="grad-text">perfil</span></h1><p>Mantené tus datos al día: tu nombre es el que aparece en tus certificados.</p></div>`;
    view.innerHTML = `<div class="page">
      ${head}
      <div class="profile rise ${gate ? "gating" : ""}">
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
            <p class="error-msg" id="pErr" role="alert"></p>
            <button class="btn btn-primary">${gate ? "Guardar y desbloquear el campus" : "Guardar cambios"}</button>
          </form>
          <form class="card panel" id="pwForm" novalidate ${gate ? "hidden" : ""}>
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
    const formData = (f) => ({
      name: f.name.value.trim().replace(/\s+/g, " "),
      country: f.country.value.replace(/\D/g, ""),
      phone: f.phone.value.replace(/\D/g, ""),
      docId: f.docId.value.trim(),
    });
    // Checklist en vivo mientras completa los datos.
    const paintCheck = () => {
      if(!$("gateCheck")) return;
      const miss = new Set(profileMissing(formData($("pForm"))).map(([k]) => k));
      $("gateCheck").querySelectorAll("[data-k]").forEach((s) => s.classList.toggle("ok", !miss.has(s.dataset.k)));
    };
    $("pForm").addEventListener("input", paintCheck);
    paintCheck();
    $("pForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, data = formData(f);
      $("pErr").textContent = "";
      const miss = profileMissing(data);
      if(gate && miss.length) return void ($("pErr").textContent = "Falta completar: " + miss.map(([, label]) => label).join(", ") + ".");
      if(data.name.length < 2) return fail("Escribí tu nombre completo.");
      try{
        await pb.collection("users").update(u.id, data);
        paintAvatar();
        lockCampus();
        if(gate){
          ok("¡Perfil completo!", "Ya tenés todo el campus desbloqueado.");
          // Sin tutorial pendiente vuelve a donde iba; si no, el tutorial arranca sobre Mis cursos.
          const go = (me().onboarded && afterProfile) || "#/";
          if(me().onboarded) afterProfile = "";
          if(location.hash === go) await route(); else location.hash = go;
          maybeTour();
          return;
        }
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
    stopSale();
    leave();
    const h = location.hash;
    const m = h.match(/^#\/c\/([^/]+)(?:\/([^/]+))?/);
    const prog = h.match(/^#\/certificaciones\/([^/?]+)/);
    const ticket = h.match(/^#\/soporte\/([^/?]+)/);
    try{
      lockCampus();
      // Sin perfil completo solo se puede estar en Mi perfil; guardamos a dónde iba.
      if(needsProfile()){
        if(!h.startsWith("#/perfil")) afterProfile = h;
        await renderPerfil();
      }
      else if(m) await renderCourse(m[1], m[2]);
      else if(h.startsWith("#/certificados")) await renderCertificados();
      else if(prog) await renderPrograma(prog[1]);
      else if(h.startsWith("#/certificaciones")) await renderCertificaciones();
      else if(h.startsWith("#/inscripciones")) await renderInscripciones();
      else if(ticket) await renderTicket(ticket[1]);
      else if(h.startsWith("#/soporte")) await renderSoporte();
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
    settings(); // sello del certificado y campaña
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
    $("adminLink").hidden = !isTeam();
    refreshSupportDot();
    view.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
    await loadBase();
    const welcome = /bienvenida/.test(location.hash);
    if(welcome) location.replace("#/");
    await route();
    if(welcome) ok("¡Bienvenido al campus!", "Tu cuenta ya está activa. Arrancá tu curso de regalo.");
    maybeTour();
  }

  boot();
})();
