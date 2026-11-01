// Campus del alumno: login, mis cursos, reproductor con progreso, certificados,
// catálogo de certificaciones (consulta por WhatsApp) y perfil editable.
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
  const lessonsByCourse = {};

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
      location.hash = r.course ? "#/c/" + r.course.id : "#/";
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
    courses = progress = certs = enrollments = null;
    Object.keys(lessonsByCourse).forEach((k) => delete lessonsByCourse[k]);
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
     CERTIFICACIONES DISPONIBLES
     ===================================================== */
  const KIND_PROGRAM = {certificacion:"Certificación", especializacion:"Especialización", paquete:"Paquete"};

  async function renderCertificaciones(){
    $("burger").hidden = true;
    setTab("certificaciones");
    const items = await pb.collection("programs").getFullList({sort:"order,title"});
    const rib = await ribbon();
    view.innerHTML = `<div class="page">
      <div class="hello rise"><span class="eyebrow">Tu próximo nivel</span><h1>Certificaciones <span class="grad-text">disponibles</span></h1>
        <p>Elegí la que te interesa y consultanos por WhatsApp. Un asesor te responde con precios, fechas y condiciones para alumnos del campus.</p></div>
      <div class="rise">${await campaignHtml()}</div>
      <div class="progs">${items.map((p, i) => `<article class="card prog" style="animation:rise .55s ${i * 60}ms both">${rib}
        <div class="cv" ${p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}>${p.image ? "" : `<span>${esc(initials(p.title))}</span>`}</div>
        <div class="pb">
          <div class="meta"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span>${p.duration ? `<span class="badge">${esc(p.duration)}</span>` : ""}${p.modality ? `<span class="badge">${esc(p.modality)}</span>` : ""}</div>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.summary || "")}</p>
          ${p.course && (me().courses || []).includes(p.course)
            ? `<a class="btn btn-primary" href="#/c/${p.course}">Ir a la evaluación</a>`
            : `<button class="btn btn-primary" data-ask="${p.id}">Consultar por WhatsApp</button>`}
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
