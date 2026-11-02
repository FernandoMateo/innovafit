// Panel de administración: resumen con gráficos, evaluaciones (leads), alumnos, cursos,
// certificados emitidos y catálogo de certificaciones.
(function(){
  "use strict";
  const {pb, esc, notify, api, countUp, errMsg, fileUrl, KIND_LABEL} = UI;

  const $ = (id) => document.getElementById(id);
  const view = $("view");
  let waNumber = "";
  fetch("/api/config").then((r) => r.json()).then((c) => { waNumber = c.waNumber || ""; }).catch(() => {});

  const ok = (title, text) => notify({type:"success", title, text});
  const fail = (err) => notify({type:"error", title:"Ups, algo falló", text: typeof err === "string" ? err : errMsg(err)});

  const STATUS = {nuevo:"Nuevo", contactado:"Contactado", inscripto:"Inscripto", descartado:"Descartado"};
  const KIND_PROGRAM = {certificacion:"Certificación", especializacion:"Especialización", paquete:"Paquete"};
  const toDate = (s) => new Date(String(s).replace(" ", "T"));
  const fmtDate = (s) => s ? toDate(s).toLocaleDateString("es-MX", {day:"2-digit", month:"short", year:"numeric"}) : "";
  const fmtDateTime = (s) => s ? toDate(s).toLocaleString("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}) : "";
  const dayKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const todayISO = () => dayKey(new Date());
  const waLink = (country, phone, text) => "https://wa.me/" + String(country || "") + String(phone || "") + (text ? "?text=" + encodeURIComponent(text) : "");
  const initials = (n) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const avatarHtml = (u) => u && u.avatar
    ? `<div class="avatar" style="background-image:url('${fileUrl(u, u.avatar, "100x100")}')"></div>`
    : `<div class="avatar">${esc(initials(u && (u.name || u.email)))}</div>`;

  // Texto plano → párrafos; si ya trae HTML se respeta tal cual.
  function toHtml(text){
    const t = (text || "").trim();
    if(!t || /<[a-z][\s\S]*>/i.test(t)) return t;
    return t.split(/\n{2,}/).map((p) => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("");
  }
  // Inverso de toHtml: si solo hay <p>/<br> lo mostramos como texto para editarlo cómodo.
  function fromHtml(html){
    const h = (html || "").trim();
    if(!h || /<(?!\/?(p|br)\b)[a-z]/i.test(h)) return h;
    const tmp = document.createElement("div");
    tmp.innerHTML = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n");
    return tmp.textContent;
  }

  function randomPassword(){
    const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => abc[b % abc.length]).join("");
  }

  /* ---------- Efectos globales ---------- */
  // Luz que sigue al cursor en las tarjetas .spot
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest && e.target.closest(".spot");
    if(!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--x", (e.clientX - r.left) + "px");
    card.style.setProperty("--y", (e.clientY - r.top) + "px");
  }, {passive:true});

  function moveRailIndicator(){
    const on = document.querySelector(".rail a.on");
    const ind = $("railInd");
    if(!on || !ind) return;
    ind.style.opacity = 1;
    ind.style.transform = "translateY(" + on.offsetTop + "px)";
    ind.style.height = on.offsetHeight + "px";
  }

  // Control segmentado con píldora que se desliza
  function segPill(seg){
    let pill = seg.querySelector(".pill");
    if(!pill){ pill = document.createElement("span"); pill.className = "pill"; seg.prepend(pill); }
    const on = seg.querySelector("button.on");
    if(on){ pill.style.left = on.offsetLeft + "px"; pill.style.width = on.offsetWidth + "px"; }
  }

  function stagger(root){
    root.querySelectorAll(".stagger").forEach((s) => [...s.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 14))));
  }

  /* ---------- Modal ---------- */
  function openModal(html, onMount, wide){
    const root = $("modalRoot");
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-scrim" data-close></div><div class="card modal-card${wide ? " wide" : ""}">${html}</div></div>`;
    const modal = root.firstElementChild;
    modal.addEventListener("click", (e) => { if(e.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("keydown", escClose);
    if(onMount) onMount(modal);
    modal.querySelector("input:not([type=checkbox]),select,textarea")?.focus();
    return modal;
  }
  function closeModal(){
    $("modalRoot").innerHTML = "";
    document.removeEventListener("keydown", escClose);
  }
  function escClose(e){ if(e.key === "Escape") closeModal(); }

  function confirmBox(title, text, okLabel){
    return new Promise((resolve) => {
      openModal(`<h2>${esc(title)}</h2><p class="muted" style="margin:0 0 20px">${esc(text)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-danger" id="cOk">${esc(okLabel || "Eliminar")}</button></div>`,
        (m) => {
          m.querySelector("#cOk").onclick = () => { closeModal(); resolve(true); };
          m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => resolve(false)));
        });
    });
  }

  /* ---------- Login ---------- */
  function showLogin(msg){
    $("appView").hidden = true;
    $("loginView").hidden = false;
    $("lErr").textContent = msg || "";
    $("lEmail").focus();
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("lBtn");
    $("lErr").textContent = "";
    btn.disabled = true;
    try{
      const res = await pb.collection("users").authWithPassword($("lEmail").value.trim().toLowerCase(), $("lPass").value);
      if(res.record.role !== "admin" && res.record.role !== "agent"){
        pb.authStore.clear();
        $("lErr").textContent = "Esta cuenta no es del equipo InnovaFit.";
        return;
      }
      boot();
    }catch(err){
      $("lErr").textContent = err.status === 400 ? "Correo o contraseña incorrectos." : errMsg(err);
    }finally{
      btn.disabled = false;
    }
  });

  $("logout").addEventListener("click", (e) => {
    e.preventDefault();
    pb.authStore.clear();
    showLogin();
  });

  /* ---------- Datos compartidos ---------- */
  let coursesCache = null;
  async function getCourses(force){
    if(!coursesCache || force) coursesCache = await pb.collection("courses").getFullList({sort:"order,created"});
    return coursesCache;
  }

  /* =====================================================
     GRÁFICOS (SVG propio, con tooltip)
     ===================================================== */
  function barChart(el, data, opts = {}){
    const H = opts.height || 220;
    el.classList.add("chart");
    el.innerHTML = `<div class="tip"></div>`;
    const tip = el.firstElementChild;
    const draw = () => {
      el.querySelector("svg")?.remove();
      const W = el.clientWidth || 600;
      const pad = {l:30, r:8, t:16, b:26};
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const rawMax = Math.max(1, ...data.map((d) => d.value));
      const step = Math.max(1, Math.ceil(rawMax / 4));
      const max = step * 4;
      const bw = iw / data.length;
      const gap = Math.max(2, bw * .26);
      const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, iw / 48)));
      const y = (v) => pad.t + ih - (v / max) * ih;
      let s = `<svg height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "")}"><g class="grid">`;
      for(let i = 0; i <= 4; i++){
        const yy = pad.t + (ih / 4) * i;
        s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
      }
      s += `</g><g class="axis">`;
      for(let i = 0; i <= 4; i++) s += `<text x="${pad.l - 8}" y="${pad.t + (ih / 4) * i + 3}" text-anchor="end">${max - step * i}</text>`;
      data.forEach((d, i) => { if(i % labelEvery === 0) s += `<text x="${pad.l + bw * i + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`; });
      s += `</g>`;
      data.forEach((d, i) => {
        const x = pad.l + bw * i + gap / 2, w = bw - gap, top = y(d.value), h = pad.t + ih - top;
        const r = Math.min(4, w / 2, h);
        s += `<rect class="hit" data-i="${i}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}"/>`;
        s += h > 0
          ? `<path class="bar${d.dim ? " dim" : ""}" style="animation-delay:${i * 30}ms" d="M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z"/>`
          : `<path class="bar"/>`;
      });
      if(opts.cutIndex != null){
        const cx = pad.l + bw * opts.cutIndex;
        s += `<line class="cut" x1="${cx}" x2="${cx}" y1="${pad.t - 6}" y2="${pad.t + ih}"/><text class="cut-l" x="${cx + 6}" y="${pad.t}">${esc(opts.cutLabel || "")}</text>`;
      }
      s += `</svg>`;
      el.insertAdjacentHTML("beforeend", s);
      el.querySelectorAll(".hit").forEach((h) => {
        h.addEventListener("pointerenter", () => {
          const d = data[+h.dataset.i];
          tip.innerHTML = `<b>${esc(d.tip || d.value)}</b>${esc(d.tipSub || d.label)}`;
          tip.style.left = (pad.l + bw * +h.dataset.i + bw / 2) + "px";
          tip.style.top = y(d.value) + "px";
          tip.classList.add("on");
        });
        h.addEventListener("pointerleave", () => tip.classList.remove("on"));
      });
    };
    draw();
    let last = el.clientWidth;
    new ResizeObserver(() => { if(Math.abs(el.clientWidth - last) > 4){ last = el.clientWidth; draw(); } }).observe(el);
  }

  /* =====================================================
     RESUMEN
     ===================================================== */
  async function renderResumen(){
    const [attempts, students, courses, certs, recent, accredited] = await Promise.all([
      pb.collection("attempts").getFullList({fields:"created,score,passed,sections", batch:1000}),
      pb.collection("users").getList(1, 1, {filter:'role != "admin" && role != "agent"', fields:"id"}),
      getCourses(true),
      pb.collection("certificates").getList(1, 1, {fields:"id"}),
      pb.collection("attempts").getList(1, 6, {sort:"-created"}),
      pb.collection("enrollments").getList(1, 1, {filter:'status = "acreditado"', fields:"id"}),
    ]);
    const total = attempts.length;
    const passed = attempts.filter((a) => a.passed).length;
    const rate = total ? Math.round((passed / total) * 100) : 0;
    const avg = total ? Math.round(attempts.reduce((a, b) => a + (b.score || 0), 0) / total) : 0;
    const today = todayISO();
    const todayCount = attempts.filter((a) => dayKey(toDate(a.created)) === today).length;

    // Últimos 14 días
    const days = [];
    for(let i = 13; i >= 0; i--){ const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const perDay = new Map(days.map((d) => [dayKey(d), {n:0, ok:0}]));
    attempts.forEach((a) => { const k = dayKey(toDate(a.created)); const v = perDay.get(k); if(v){ v.n++; if(a.passed) v.ok++; } });
    const dayData = days.map((d) => {
      const v = perDay.get(dayKey(d));
      return {label: String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"), value: v.n,
        tip: v.n + (v.n === 1 ? " evaluación" : " evaluaciones"), tipSub: d.toLocaleDateString("es-MX", {weekday:"long", day:"numeric", month:"short"}) + " · " + v.ok + " aprobados"};
    });

    // Distribución de puntajes
    const buckets = Array.from({length:10}, (_, i) => ({from:i * 10, n:0}));
    attempts.forEach((a) => { buckets[Math.min(9, Math.floor((a.score || 0) / 10))].n++; });
    const histData = buckets.map((b) => ({label: String(b.from), value: b.n, dim: b.from < 80,
      tip: b.n + (b.n === 1 ? " persona" : " personas"), tipSub: b.from + "–" + (b.from === 90 ? 100 : b.from + 9) + " puntos"}));

    // Promedio por bloque temático
    const secMap = {};
    attempts.forEach((a) => (Array.isArray(a.sections) ? a.sections : []).forEach((s) => {
      const m = (secMap[s.section] ||= {c:0, t:0});
      m.c += s.correct; m.t += s.total;
    }));
    const secs = Object.entries(secMap).map(([name, m]) => ({name, pct: Math.round((m.c / m.t) * 100)})).sort((a, b) => a.pct - b.pct);

    const first = (pb.authStore.record.name || "").split(" ")[0];
    const C = 2 * Math.PI * 80;

    view.innerHTML = `
      <section class="hero">
        <span class="eyebrow">${new Date().toLocaleDateString("es-MX", {weekday:"long", day:"numeric", month:"long"})}</span>
        <h1>Hola${first ? ", " + esc(first) : ""} <span class="grad-text">⚡</span></h1>
        <p>${todayCount ? `Hoy ya entraron <b>${todayCount}</b> evaluaciones nuevas. ` : "Todavía no hay evaluaciones hoy. "}Tenés <b>${passed}</b> entrenadores aprobados y <b>${total - passed}</b> leads listos para ofrecerles la certificación.</p>
        <div class="actions">
          <a class="btn btn-primary" href="#/evaluaciones">Ver leads</a>
          <a class="btn btn-ghost" href="#/certificados/nuevo">Emitir certificado</a>
          <a class="btn btn-ghost" href="#/cursos/nuevo">Nuevo curso</a>
        </div>
      </section>
      <div class="kpis stagger">
        ${kpi("Evaluaciones", total, "📝", todayCount ? `<span class="up">+${todayCount}</span> hoy` : "sin novedades hoy")}
        ${kpi("Aprobados", passed, "🏆", "con 80 o más")}
        ${kpi("Tasa de aprobación", rate, "🎯", "del total", "%")}
        ${kpi("Puntaje promedio", avg, "📊", "sobre 100")}
        ${kpi("Alumnos", students.totalItems, "👥", "registrados en el campus")}
        ${kpi("Acreditados", accredited.totalItems, "✅", "aprobaron el examen final")}
        ${kpi("Certificados", certs.totalItems, "🎓", courses.length + " cursos activos")}
      </div>
      <div class="charts">
        <div class="card chart-card spot"><h3>Evaluaciones por día</h3><p class="sub">Últimos 14 días · pasá el cursor por cada barra</p><div id="chDays"></div></div>
        <div class="card chart-card spot"><h3>Tasa de aprobación</h3><p class="sub">Aprobados sobre el total de evaluaciones</p>
          <div class="meter"><svg viewBox="0 0 190 190"><circle class="t" cx="95" cy="95" r="80"/><circle class="f" id="meterF" cx="95" cy="95" r="80" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
            <div class="c"><b data-count="${rate}" data-suffix="%">0%</b><span>aprobación</span></div></div>
          <div class="legend-row"><span><i style="background:var(--orange)"></i>Aprobados <b>${passed}</b></span><span><i style="background:rgba(255,255,255,.12)"></i>No aprobados <b>${total - passed}</b></span></div>
        </div>
      </div>
      <div class="charts b">
        <div class="card chart-card spot"><h3>Distribución de puntajes</h3><p class="sub">Cuántos entrenadores cayeron en cada rango · la línea marca el corte de 80</p><div id="chHist"></div></div>
        <div class="card chart-card spot"><h3>Rendimiento por bloque</h3><p class="sub">Promedio de respuestas correctas · de menor a mayor</p>
          ${secs.length ? `<div class="hbars">${secs.map((s, i) => `<div class="hbar"><div class="top"><span>${esc(s.name)}</span><span>${s.pct}%</span></div><div class="track"><i style="width:${s.pct}%;animation-delay:${i * 80}ms"></i></div></div>`).join("")}</div>` : '<p class="muted">Sin datos todavía.</p>'}
        </div>
      </div>
      <div class="head" style="margin:26px 0 12px"><h2 style="font-size:28px">Últimas evaluaciones</h2><a class="btn btn-ghost btn-sm" href="#/evaluaciones">Ver todas →</a></div>
      ${attemptsTable(recent.items)}`;

    rememberAttempts(recent.items);
    bindAttemptRows();
    barChart($("chDays"), dayData, {label:"Evaluaciones por día"});
    barChart($("chHist"), histData, {label:"Distribución de puntajes", cutIndex:8, cutLabel:"CORTE 80"});
    requestAnimationFrame(() => { $("meterF").style.strokeDashoffset = C - (rate / 100) * C; });
    view.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
  }

  function kpi(label, value, icon, foot, suffix){
    return `<div class="card kpi spot"><div class="k-top"><span class="l">${label}</span><span class="ico">${icon}</span></div>
      <b data-count="${value}" data-suffix="${suffix || ""}">0</b><small>${foot}</small></div>`;
  }

  /* =====================================================
     EVALUACIONES
     ===================================================== */
  const evalState = {page:1, filter:"all", q:""};

  function attemptsTable(items){
    if(!items.length) return `<div class="table-wrap"><div class="empty-row">Todavía no hay evaluaciones.</div></div>`;
    return `<div class="table-wrap"><table>
      <thead><tr><th>Entrenador</th><th>WhatsApp</th><th>Puntaje</th><th>Resultado</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
      <tbody class="stagger">${items.map((a) => `<tr data-id="${a.id}">
        <td><div class="who-cell"><div class="avatar">${esc(initials(a.name))}</div><div><b>${esc(a.name)}</b><span class="sub">${esc(a.email)}</span></div></div></td>
        <td>${a.phone ? `<a href="${waLink(a.country, a.phone, "Hola " + (a.name || "").split(" ")[0] + "! Te escribimos de InnovaFit por tu Evaluación de Nivel.")}" target="_blank" rel="noopener" style="color:var(--good)">+${esc(a.country)} ${esc(a.phone)}</a>` : "—"}</td>
        <td class="num"><span class="score-chip">${a.score}<span class="mini"><i class="${a.passed ? "ok" : ""}" style="width:${a.score}%"></i></span></span></td>
        <td>${a.passed ? '<span class="badge good">✓ Aprobado</span>' : '<span class="badge bad">✕ No aprobado</span>'}</td>
        <td><select class="mini-select" data-status aria-label="Estado">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${a.status === k ? " selected" : ""}>${v}</option>`).join("")}</select></td>
        <td><span class="sub" style="color:var(--fg)">${fmtDateTime(a.created)}</span></td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-detail>Ver</button>
          ${a.user ? '<span class="badge good" title="Ya tiene cuenta">Con acceso</span>' : '<button class="btn btn-ghost btn-sm" data-grant>Dar acceso</button>'}
        </div></td></tr>`).join("")}</tbody></table></div>`;
  }

  let shownAttempts = new Map();
  function rememberAttempts(items){ shownAttempts = new Map(items.map((a) => [a.id, a])); }

  function bindAttemptRows(){
    stagger(view);
    view.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector("[data-status]")?.addEventListener("change", async (e) => {
        try{
          await pb.collection("attempts").update(id, {status: e.target.value});
          ok("¡Estado actualizado!", "Marcado como " + STATUS[e.target.value].toLowerCase() + ".");
        }catch(err){ fail(err); }
      });
      tr.querySelector("[data-detail]")?.addEventListener("click", async () => {
        attemptDetail(shownAttempts.get(id) || await pb.collection("attempts").getOne(id));
      });
      tr.querySelector("[data-grant]")?.addEventListener("click", async () => {
        const a = shownAttempts.get(id) || await pb.collection("attempts").getOne(id);
        userModal(null, {name:a.name, email:a.email, phone:a.phone, country:a.country, docId:a.docId, attemptId:a.id});
      });
    });
  }

  function attemptDetail(a){
    const secs = Array.isArray(a.sections) ? a.sections : [];
    openModal(`<span class="eyebrow">${fmtDateTime(a.created)} · ${esc(a.code || "")}</span>
      <h2 style="margin-top:8px">${esc(a.name)}</h2>
      <div class="cred">
        <div><span>Puntaje</span><b>${a.score}/100 · ${a.correct}/${a.total} correctas</b></div>
        <div><span>Correo</span><b>${esc(a.email)}</b></div>
        <div><span>WhatsApp</span><b>+${esc(a.country)} ${esc(a.phone)}</b></div>
        ${a.docId ? `<div><span>Identificación</span><b>${esc(a.docId)}</b></div>` : ""}
      </div>
      <span class="eyebrow">Por bloque</span>
      <div class="sections-mini">${secs.map((s) => `<div><span>${esc(s.section)}</span><span class="mono">${s.correct}/${s.total}</span><div class="bar"><i style="width:${s.pct}%;${s.pct >= 80 ? "background:var(--good)" : ""}"></i></div></div>`).join("")}</div>
      <label class="field"><span>Notas internas</span><textarea class="input" id="aNotes" placeholder="Ej: llamó, interesado en la camada de marzo">${esc(a.notes || "")}</textarea></label>
      <div class="modal-actions">
        <a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink(a.country, a.phone, "Hola " + (a.name || "").split(" ")[0] + "! Te escribimos de InnovaFit por tu Evaluación de Nivel (" + a.score + "/100).")}">Escribir por WhatsApp</a>
        <button class="btn btn-primary" id="aSave">Guardar notas</button>
      </div>`, (m) => {
      m.querySelector("#aSave").onclick = async () => {
        try{
          a.notes = m.querySelector("#aNotes").value;
          await pb.collection("attempts").update(a.id, {notes: a.notes});
          closeModal();
          ok("¡Notas guardadas!");
        }catch(err){ fail(err); }
      };
    });
  }

  function attemptsFilter(){
    const parts = [];
    if(evalState.filter === "passed") parts.push("passed = true");
    if(evalState.filter === "failed") parts.push("passed = false");
    if(evalState.q) parts.push(pb.filter("(name ~ {:q} || email ~ {:q} || phone ~ {:q})", {q: evalState.q}));
    return parts.join(" && ");
  }

  async function renderEvaluaciones(){
    const res = await pb.collection("attempts").getList(evalState.page, 30, {sort:"-created", filter: attemptsFilter()});
    rememberAttempts(res.items);
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Leads y resultados</span><h1>Evaluaciones</h1></div>
        <div class="actions"><button class="btn btn-ghost" id="csv">Exportar CSV</button></div></div>
      <div class="toolbar">
        <div class="seg" id="seg">
          <button data-f="all" class="${evalState.filter === "all" ? "on" : ""}">Todas</button>
          <button data-f="passed" class="${evalState.filter === "passed" ? "on" : ""}">Aprobados</button>
          <button data-f="failed" class="${evalState.filter === "failed" ? "on" : ""}">No aprobados</button>
        </div>
        <input class="input" id="q" type="search" placeholder="Buscar por nombre, correo o teléfono" value="${esc(evalState.q)}">
      </div>
      ${attemptsTable(res.items)}
      ${pager(res)}`;
    bindAttemptRows();
    segPill($("seg"));
    $("seg").onclick = (e) => {
      const f = e.target.dataset.f;
      if(!f) return;
      evalState.filter = f; evalState.page = 1;
      $("seg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      segPill($("seg"));
      setTimeout(renderEvaluaciones, 220);
    };
    searchInput("q", (v) => { evalState.q = v; evalState.page = 1; return renderEvaluaciones(); });
    bindPager(evalState, renderEvaluaciones);
    $("csv").onclick = exportCsv;
  }

  function searchInput(id, run){
    let t;
    $(id).oninput = (e) => {
      clearTimeout(t);
      t = setTimeout(() => run(e.target.value.trim()).then(() => { const q = $(id); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }), 300);
    };
  }

  async function exportCsv(){
    const rows = await pb.collection("attempts").getFullList({sort:"-created", filter: attemptsFilter(), batch:500});
    const head = ["fecha", "nombre", "correo", "codigo_pais", "telefono", "identificacion", "puntaje", "correctas", "aprobado", "estado", "notas"];
    const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const csv = [head.join(",")].concat(rows.map((a) => [a.created, a.name, a.email, a.country, a.phone, a.docId, a.score, a.correct, a.passed ? "si" : "no", a.status, a.notes].map(cell).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], {type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a");
    a.href = url;
    a.download = "evaluaciones-innovafit.csv";
    a.click();
    URL.revokeObjectURL(url);
    ok("¡CSV exportado!", rows.length + " filas descargadas.");
  }

  function pager(res){
    if(res.totalPages <= 1) return `<div class="pager"><span>${res.totalItems} resultados</span></div>`;
    return `<div class="pager"><span>${res.totalItems} resultados · página ${res.page} de ${res.totalPages}</span>
      <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-pg="-1"${res.page <= 1 ? " disabled" : ""}>← Anterior</button>
      <button class="btn btn-ghost btn-sm" data-pg="1"${res.page >= res.totalPages ? " disabled" : ""}>Siguiente →</button></div></div>`;
  }
  function bindPager(state, render){
    view.querySelectorAll("[data-pg]").forEach((b) => b.onclick = () => { state.page += +b.dataset.pg; render(); });
  }

  /* =====================================================
     ALUMNOS
     ===================================================== */
  const userState = {page:1, q:""};

  async function renderAlumnos(){
    const courses = await getCourses();
    const names = new Map(courses.map((c) => [c.id, c.title]));
    const filter = userState.q ? pb.filter("(name ~ {:q} || email ~ {:q})", {q: userState.q}) : "";
    const res = await pb.collection("users").getList(userState.page, 30, {sort:"-created", filter});
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Accesos al campus</span><h1>Alumnos</h1></div>
        <div class="actions"><button class="btn btn-primary" id="newUser">+ Nuevo alumno</button></div></div>
      <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por nombre o correo" value="${esc(userState.q)}"></div>
      ${res.items.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Alumno</th><th>Cursos</th><th>Rol</th><th>Alta</th><th></th></tr></thead>
        <tbody class="stagger">${res.items.map((u) => `<tr data-id="${u.id}">
          <td><div class="who-cell">${avatarHtml(u)}<div><b>${esc(u.name || "—")}</b><span class="sub">${esc(u.email)}</span></div></div></td>
          <td>${(u.courses || []).length ? (u.courses || []).map((id) => `<span class="badge" style="margin:2px">${esc(names.get(id) || "Curso eliminado")}</span>`).join("") : '<span class="muted">Sin cursos</span>'}</td>
          <td>${u.role === "admin" ? '<span class="badge hot">Admin</span>' : u.role === "agent" ? '<span class="badge good">Asesor</span>' : '<span class="badge">Alumno</span>'}</td>
          <td><span class="sub" style="color:var(--fg)">${fmtDate(u.created)}</span></td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-cert>Certificar</button><button class="btn btn-ghost btn-sm" data-edit>Editar</button>${u.id === pb.authStore.record.id ? "" : '<button class="btn btn-danger btn-sm" data-del>Eliminar</button>'}</div></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="table-wrap"><div class="empty-row">No hay alumnos${userState.q ? " con esa búsqueda" : ""}.</div></div>`}
      ${pager(res)}`;
    stagger(view);

    const byId = new Map(res.items.map((u) => [u.id, u]));
    $("newUser").onclick = () => userModal(null);
    view.querySelectorAll("tr[data-id]").forEach((tr) => {
      const u = byId.get(tr.dataset.id);
      tr.querySelector("[data-edit]").onclick = () => userModal(u);
      tr.querySelector("[data-cert]").onclick = () => issueModal({user: u});
      tr.querySelector("[data-del]")?.addEventListener("click", async () => {
        if(!(await confirmBox("Eliminar alumno", "Se borra la cuenta de " + (u.name || u.email) + " y su progreso. No se puede deshacer."))) return;
        try{
          await pb.collection("users").delete(u.id);
          ok("¡Alumno eliminado!");
          renderAlumnos();
        }catch(err){ fail(err); }
      });
    });
    searchInput("q", (v) => { userState.q = v; userState.page = 1; return renderAlumnos(); });
    bindPager(userState, renderAlumnos);
  }

  // Crear (u = null) o editar alumno. prefill viene de una evaluación.
  async function userModal(u, prefill){
    const courses = await getCourses();
    const isNew = !u;
    const p = prefill || {};
    const giftIds = courses.filter((c) => c.isGift).map((c) => c.id);
    const selected = new Set(isNew ? (prefill ? giftIds : []) : (u.courses || []));

    openModal(`<span class="eyebrow">${isNew ? "Generar acceso" : "Editar alumno"}</span>
      <h2 style="margin-top:8px">${isNew ? "Nuevo alumno" : esc(u.name || u.email)}</h2>
      <form id="uForm" novalidate>
        <div class="two">
          <label class="field"><span>Nombre completo</span><input class="input" name="name" required value="${esc(isNew ? p.name || "" : u.name || "")}"></label>
          <label class="field"><span>Correo</span><input class="input" name="email" type="email" required value="${esc(isNew ? p.email || "" : u.email || "")}"></label>
        </div>
        <div class="two">
          <label class="field"><span>Código país</span><input class="input" name="country" inputmode="numeric" placeholder="52" value="${esc(isNew ? p.country || "52" : u.country || "")}"></label>
          <label class="field"><span>WhatsApp</span><input class="input" name="phone" inputmode="numeric" value="${esc(isNew ? p.phone || "" : u.phone || "")}"></label>
        </div>
        <label class="field"><span>Identificación (CURP / DNI)</span><input class="input" name="docId" value="${esc(isNew ? p.docId || "" : u.docId || "")}"></label>
        <label class="field"><span>${isNew ? "Contraseña" : "Nueva contraseña (dejá vacío para no cambiarla)"}</span>
          <div class="pw-row"><input class="input mono" name="password" minlength="8" value="${isNew ? randomPassword() : ""}" autocomplete="new-password"><button type="button" class="btn btn-ghost btn-sm" id="genPw">Generar</button></div></label>
        <div class="field"><span>Cursos habilitados</span>
          <div class="checks">${courses.length ? courses.map((c) => `<label class="check"><input type="checkbox" name="courses" value="${c.id}"${selected.has(c.id) ? " checked" : ""}> ${esc(c.title)} ${c.isGift ? '<span class="badge hot">Regalo</span>' : ""}${c.published ? "" : ' <span class="badge">Borrador</span>'}</label>`).join("") : '<span class="muted">Todavía no hay cursos.</span>'}</div></div>
        <label class="field"><span>Rol</span><select class="input" name="role">
          <option value="student"${!u || !["admin", "agent"].includes(u.role) ? " selected" : ""}>Alumno</option>
          <option value="agent"${u && u.role === "agent" ? " selected" : ""}>Asesor del equipo (ventas, soporte y manual)</option>
          <option value="admin"${u && u.role === "admin" ? " selected" : ""}>Administrador</option></select></label>
        <p class="hint">Los asesores entran a /admin con su usuario: atienden inscripciones y tickets, y ven el manual del equipo.</p>
        <p class="error-msg" id="uErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="uSave">${isNew ? "Crear acceso" : "Guardar cambios"}</button></div>
      </form>`, (m) => {
      const form = m.querySelector("#uForm");
      m.querySelector("#genPw").onclick = () => { form.password.value = randomPassword(); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = {
          name: fd.get("name").trim(),
          email: fd.get("email").trim().toLowerCase(),
          country: fd.get("country").replace(/\D/g, ""),
          phone: fd.get("phone").replace(/\D/g, ""),
          docId: fd.get("docId").trim(),
          role: fd.get("role"),
          courses: fd.getAll("courses"),
          emailVisibility: true,
        };
        const pw = fd.get("password").trim();
        if(isNew || pw){
          if(pw.length < 8){ m.querySelector("#uErr").textContent = "La contraseña necesita al menos 8 caracteres."; return; }
          data.password = pw;
          data.passwordConfirm = pw;
        }
        const btn = m.querySelector("#uSave");
        btn.disabled = true;
        try{
          let rec;
          if(isNew){
            data.verified = true;
            rec = await pb.collection("users").create(data);
            if(p.attemptId) await pb.collection("attempts").update(p.attemptId, {user: rec.id});
            ok("¡Creado con éxito!", "El acceso de " + (rec.name || rec.email) + " está listo.");
          }else{
            rec = await pb.collection("users").update(u.id, data);
            ok("¡Guardado con éxito!", pw ? "Contraseña actualizada." : "Datos del alumno actualizados.");
          }
          if(isNew || pw) credentialsModal(rec, pw);
          else closeModal();
          teamCache = null;
          route(true);
        }catch(err){
          m.querySelector("#uErr").textContent = errMsg(err);
          btn.disabled = false;
        }
      };
    });
  }

  function credentialsModal(user, password){
    const campus = location.origin + "/campus";
    const msg = "Hola " + (user.name || "").split(" ")[0] + "! Ya tenés acceso al campus InnovaFit 💪\n\nEntrá en: " + campus + "\nUsuario: " + user.email + "\nContraseña: " + password;
    openModal(`<span class="eyebrow">Acceso listo</span><h2 style="margin-top:8px">Enviale estos datos</h2>
      <p class="muted" style="margin:0 0 12px">La contraseña no se guarda a la vista: copiala ahora. Si se pierde, generá una nueva desde Editar.</p>
      <div class="cred">
        <div><span>Campus</span><b>${esc(campus)}</b></div>
        <div><span>Usuario</span><b>${esc(user.email)}</b></div>
        <div><span>Contraseña</span><b class="mono">${esc(password)}</b></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cpy">Copiar mensaje</button>
        ${user.phone ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink(user.country, user.phone, msg)}">Enviar por WhatsApp</a>` : ""}
        <button class="btn btn-primary" data-close>Listo</button>
      </div>`, (m) => {
      m.querySelector("#cpy").onclick = () => navigator.clipboard.writeText(msg).then(() => ok("¡Mensaje copiado!", "Pegalo donde quieras."));
    });
  }

  /* =====================================================
     CURSOS
     ===================================================== */
  async function renderCursos(){
    const courses = await getCourses(true);
    const counts = await Promise.all(courses.map((c) => pb.collection("lessons").getList(1, 1, {filter: pb.filter("course = {:c}", {c: c.id}), fields:"id"}).then((r) => r.totalItems)));
    const ofProgram = new Set((await pb.collection("programs").getFullList({fields:"course"})).map((p) => p.course).filter(Boolean));
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Contenido</span><h1>Cursos</h1></div>
        <div class="actions"><a class="btn btn-primary" href="#/cursos/nuevo">+ Nuevo curso</a></div></div>
      <div class="tiles stagger">${courses.map((c, i) => `<a class="card tile spot" href="#/cursos/${c.id}">
        <div class="cv${c.cover ? "" : " ph"}" ${c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : ""}>${c.cover ? "" : `<span>${esc(initials(c.title))}</span>`}</div>
        <div class="cb"><div class="badges">${c.published ? '<span class="badge good">Publicado</span>' : '<span class="badge">Borrador</span>'}${c.isGift ? '<span class="badge hot">🎁 Regalo</span>' : ""}${c.certEnabled ? '<span class="badge">🎓 Certifica</span>' : ""}${ofProgram.has(c.id) ? '<span class="badge hot">Certificación</span>' : ""}</div>
          <h3>${esc(c.title)}</h3><p>${counts[i]} lecciones</p></div></a>`).join("")}
        <a class="tile add" href="#/cursos/nuevo"><span class="plus">+</span>Nuevo curso</a></div>`;
    stagger(view);
  }

  async function renderCurso(id){
    const isNew = id === "nuevo";
    const c = isNew ? {title:"", subtitle:"", description:"", published:false, isGift:false, certEnabled:true, certHours:"", order:(await getCourses()).length + 1} : await pb.collection("courses").getOne(id);
    const lessons = isNew ? [] : await pb.collection("lessons").getFullList({filter: pb.filter("course = {:c}", {c: id}), sort:"order,created"});
    const assess = new Map(isNew ? [] : (await pb.collection("assessments").getFullList({filter: pb.filter("course = {:c}", {c: id})})).map((a) => [a.lesson, a]));

    view.innerHTML = `
      <div class="head"><div><a class="eyebrow" href="#/cursos" style="text-decoration:none">← Cursos</a><h1>${isNew ? "Nuevo curso" : esc(c.title)}</h1></div>
        <div class="actions">${isNew ? "" : '<button class="btn btn-danger" id="delCourse">Eliminar curso</button>'}</div></div>
      <div class="editor">
        <form class="card panel spot" id="cForm" novalidate>
          <h2>Datos del curso</h2>
          <label class="field"><span>Título</span><input class="input" name="title" required value="${esc(c.title)}"></label>
          <label class="field"><span>Bajada</span><input class="input" name="subtitle" value="${esc(c.subtitle || "")}" placeholder="Una línea que explique de qué se trata"></label>
          <label class="field"><span>Descripción</span><textarea class="input" name="description" rows="5">${esc(fromHtml(c.description))}</textarea></label>
          <p class="hint">Texto libre: cada párrafo separado por una línea en blanco. También acepta HTML.</p>
          <div class="field"><span>Portada (16:9)</span>
            <div class="cover-prev" id="coverPrev" ${c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : ""}>${c.cover ? "" : "Sin portada"}</div>
            <input class="input" type="file" name="cover" accept="image/png,image/jpeg,image/webp,image/gif"></div>
          <p class="hint">La misma imagen se ve en el panel, en el campus y en la tarjeta de la web. JPG, PNG o WEBP de hasta 15 MB.</p>
          <div class="two">
            <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(c.order || 0)}"></label>
            <div class="field"><span>Visibilidad</span>
              <label class="check" style="margin-top:6px"><input type="checkbox" name="published"${c.published ? " checked" : ""}> Publicado</label>
              <label class="check"><input type="checkbox" name="isGift"${c.isGift ? " checked" : ""}> Regalo al aprobar</label>
              <label class="check"><input type="checkbox" name="openAccess"${c.openAccess ? " checked" : ""}> Inscripción libre con registro</label></div>
          </div>
          <div class="two">
            <div class="field"><span>Certificado</span><label class="check" style="margin-top:6px"><input type="checkbox" name="certEnabled"${c.certEnabled ? " checked" : ""}> Emitir al completar</label></div>
            <label class="field"><span>Horas / duración en el certificado</span><input class="input" name="certHours" value="${esc(c.certHours || "")}" placeholder="Ej: 20 horas"></label>
          </div>
          <p class="hint">Solo los alumnos habilitados ven el curso, y únicamente si está publicado. Con "Inscripción libre", aparece en la pantalla de registro del campus y cualquiera se inscribe dejando sus datos. Si el curso tiene una lección "Examen final", el certificado se emite al aprobarlo; si no, al completar todas las lecciones.</p>
          <p class="error-msg" id="cErr" role="alert"></p>
          <button class="btn btn-primary" id="cSave">${isNew ? "Crear curso" : "Guardar curso"}</button>
        </form>

        <div class="card panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
            <h2 style="margin:0">Lecciones</h2>
            ${isNew ? "" : '<button class="btn btn-primary btn-sm" id="addLesson">+ Agregar lección</button>'}
          </div>
          ${isNew ? '<p class="muted">Guardá el curso para empezar a cargar lecciones.</p>' : lessons.length ? `<div class="lessons stagger" id="lessonList">${lessonRows(lessons, assess)}</div>` : '<p class="muted">Todavía no hay lecciones. Agregá videos, audios, PDF, imágenes, links de YouTube/Vimeo o lecturas.</p>'}
        </div>
      </div>`;
    stagger(view);

    const form = $("cForm");
    form.cover.onchange = () => {
      const f = form.cover.files[0];
      if(f){ const prev = $("coverPrev"); prev.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')"; prev.textContent = ""; }
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("cSave");
      $("cErr").textContent = "";
      if(!form.title.value.trim()){ $("cErr").textContent = "El curso necesita un título."; return; }
      const fd = new FormData();
      fd.set("title", form.title.value.trim());
      fd.set("subtitle", form.subtitle.value.trim());
      fd.set("description", toHtml(form.description.value));
      fd.set("order", form.order.value || "0");
      fd.set("published", form.published.checked ? "true" : "false");
      fd.set("isGift", form.isGift.checked ? "true" : "false");
      fd.set("openAccess", form.openAccess.checked ? "true" : "false");
      fd.set("certEnabled", form.certEnabled.checked ? "true" : "false");
      fd.set("certHours", form.certHours.value.trim());
      if(form.cover.files[0]) fd.set("cover", form.cover.files[0]);
      btn.disabled = true;
      try{
        const rec = isNew ? await pb.collection("courses").create(fd) : await pb.collection("courses").update(c.id, fd);
        // Un solo curso de regalo a la vez.
        if(form.isGift.checked){
          const others = (await getCourses(true)).filter((x) => x.isGift && x.id !== rec.id);
          await Promise.all(others.map((x) => pb.collection("courses").update(x.id, {isGift:false})));
        }
        await getCourses(true);
        ok(isNew ? "¡Creado con éxito!" : "¡Guardado con éxito!", isNew ? "Ahora cargale las lecciones." : "Los cambios ya están en el campus.");
        if(isNew) location.hash = "#/cursos/" + rec.id;
        else renderCurso(rec.id);
      }catch(err){
        $("cErr").textContent = errMsg(err);
        btn.disabled = false;
      }
    };
    if(isNew) return;

    $("delCourse").onclick = async () => {
      if(!(await confirmBox("Eliminar curso", "Se borran el curso, sus " + lessons.length + " lecciones y el progreso de los alumnos. No se puede deshacer."))) return;
      try{
        await pb.collection("courses").delete(c.id);
        await getCourses(true);
        ok("¡Curso eliminado!");
        location.hash = "#/cursos";
      }catch(err){ fail(err); }
    };
    $("addLesson").onclick = () => lessonModal(c, null, lessons.length ? Math.max(...lessons.map((l) => l.order || 0)) + 1 : 1);

    const list = $("lessonList");
    if(!list) return;
    list.querySelectorAll("[data-lid]").forEach((row) => {
      const i = lessons.findIndex((l) => l.id === row.dataset.lid);
      const l = lessons[i];
      row.querySelector("[data-edit]").onclick = () => lessonModal(c, l);
      row.querySelector("[data-qs]")?.addEventListener("click", () => assessmentModal(c, l, assess.get(l.id)));
      row.querySelector("[data-del]").onclick = async () => {
        if(!(await confirmBox("Eliminar lección", "Se borra \"" + l.title + "\" y su archivo."))) return;
        try{ await pb.collection("lessons").delete(l.id); ok("¡Lección eliminada!"); renderCurso(c.id); }
        catch(err){ fail(err); }
      };
      row.querySelectorAll("[data-move]").forEach((b) => b.onclick = async () => {
        const j = i + +b.dataset.move;
        if(j < 0 || j >= lessons.length) return;
        // Renumera todo para que el orden quede limpio y consecutivo.
        const ordered = lessons.slice();
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        try{
          await Promise.all(ordered.map((x, k) => (x.order === k + 1 ? null : pb.collection("lessons").update(x.id, {order: k + 1}))));
          renderCurso(c.id);
        }catch(err){ fail(err); }
      });
    });
  }

  function lessonRows(lessons, assess){
    let last = null;
    return lessons.map((l, i) => {
      let sep = "";
      if((l.section || "") !== last){ last = l.section || ""; if(last) sep = `<div class="sec-sep">${esc(last)}</div>`; }
      const needsFile = ["video", "audio", "pdf", "image"].includes(l.kind) && !l.file;
      const needsUrl = l.kind === "embed" && !l.url;
      const isAssess = l.kind === "quiz" || l.kind === "exam";
      const a = assess && assess.get(l.id);
      const qn = a && Array.isArray(a.questions) ? a.questions.length : 0;
      const info = isAssess ? (qn ? ` · ${qn} preguntas${a.draft ? ' · <span class="warn">borrador</span>' : ""}` : ' · <span class="warn">sin preguntas</span>') : "";
      return sep + `<div class="lrow" data-lid="${l.id}">
        <div class="ord"><button data-move="-1" aria-label="Subir"${i === 0 ? " disabled" : ""}>▲</button><button data-move="1" aria-label="Bajar"${i === lessons.length - 1 ? " disabled" : ""}>▼</button></div>
        <div><b>${i + 1}. ${esc(l.title)}</b><small>${KIND_LABEL[l.kind] || l.kind}${l.duration ? " · " + esc(l.duration) : ""}${info}${needsFile ? ' · <span class="warn">falta el archivo</span>' : ""}${needsUrl ? ' · <span class="warn">falta el link</span>' : ""}</small></div>
        <div class="row-actions">${isAssess ? '<button class="btn btn-primary btn-sm" data-qs>Preguntas</button>' : ""}<button class="btn btn-ghost btn-sm" data-edit>Editar</button><button class="btn btn-danger btn-sm" data-del aria-label="Eliminar">✕</button></div>
      </div>`;
    }).join("");
  }

  // Editor de preguntas de la comprobación (práctica) o del examen de acreditación (final).
  function assessmentModal(course, lesson, a, after){
    const final = lesson.kind === "exam";
    const qs = a && Array.isArray(a.questions) ? JSON.parse(JSON.stringify(a.questions)) : [];
    if(!qs.length) qs.push({q:"", options:["", "", "", ""], correct:0, explain:""});
    const L = "ABCDEFGH";
    const qHtml = (q, i) => `<div class="qedit" data-i="${i}">
      <div class="qedit-top"><b>Pregunta ${i + 1}</b><div class="row-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-up${i === 0 ? " disabled" : ""}>▲</button><button type="button" class="btn btn-ghost btn-sm" data-down${i === qs.length - 1 ? " disabled" : ""}>▼</button>
        <button type="button" class="btn btn-danger btn-sm" data-rm${qs.length === 1 ? " disabled" : ""}>✕</button></div></div>
      <textarea class="input" rows="2" data-f="q" placeholder="Escribí la pregunta">${esc(q.q)}</textarea>
      <div class="qopts">${q.options.map((o, oi) => `<label class="qopt${q.correct === oi ? " ok" : ""}"><input type="radio" name="c${i}" value="${oi}"${q.correct === oi ? " checked" : ""} title="Marcar como correcta"><span>${L[oi]}</span>
        <input class="input" data-o="${oi}" value="${esc(o)}" placeholder="Opción ${L[oi]}">${q.options.length > 2 ? `<button type="button" class="x" data-ro="${oi}" aria-label="Quitar opción">✕</button>` : ""}</label>`).join("")}</div>
      ${q.options.length < 6 ? `<button type="button" class="btn btn-ghost btn-sm" data-addopt>+ Opción</button>` : ""}
      ${final ? "" : `<input class="input" data-f="explain" value="${esc(q.explain || "")}" placeholder="Explicación que ve el alumno al corregir (opcional)" style="margin-top:8px">`}
    </div>`;

    openModal(`<span class="eyebrow">${esc(course.title)} · ${final ? "Examen de acreditación" : "Comprobación de conocimientos"}</span>
      <h2 style="margin-top:8px">${esc(lesson.title)}</h2>
      ${a && a.draft ? `<p class="hint" style="margin:6px 0 14px;color:var(--yellow)">Estas preguntas son un borrador armado con el contenido del curso. Reemplazalas por el examen oficial y guardá: deja de figurar como borrador.</p>` : ""}
      <div class="two">
        <label class="field"><span>Puntaje mínimo para aprobar (%)</span><input class="input" id="aPass" type="number" min="1" max="100" value="${a ? a.passScore || (final ? 80 : 67) : final ? 80 : 67}"></label>
        <label class="field"><span>${final ? "Oportunidades por alumno" : "Intentos"}</span>${final ? `<input class="input" id="aMax" type="number" min="0" value="${a ? a.maxAttempts : 3}">` : `<input class="input" value="Ilimitados" disabled>`}</label>
      </div>
      <p class="hint">${final ? "Al aprobar, el alumno queda ACREDITADO y su certificado se emite solo. 0 oportunidades = ilimitadas. Para dar más oportunidades a un alumno, usá Seguimiento." : "El alumno ve la corrección con la respuesta correcta y la explicación de cada pregunta."}</p>
      <div id="qList" class="qlist"></div>
      <button type="button" class="btn btn-ghost" id="qAdd" style="width:100%;margin-top:10px">+ Agregar pregunta</button>
      <p class="error-msg" id="aErr" role="alert"></p>
      <div class="modal-actions"><span class="muted" id="qCount" style="margin-right:auto;font-size:13px"></span><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="aSave">Guardar preguntas</button></div>`, (m) => {
      const list = m.querySelector("#qList");
      // Lee lo escrito antes de redibujar para no perder cambios.
      const collect = () => list.querySelectorAll(".qedit").forEach((box) => {
        const q = qs[+box.dataset.i];
        q.q = box.querySelector('[data-f="q"]').value;
        q.options = [...box.querySelectorAll("[data-o]")].map((x) => x.value);
        const r = box.querySelector("input[type=radio]:checked");
        q.correct = r ? +r.value : 0;
        const ex = box.querySelector('[data-f="explain"]');
        if(ex) q.explain = ex.value;
      });
      const paint = () => {
        list.innerHTML = qs.map(qHtml).join("");
        m.querySelector("#qCount").textContent = qs.length + (qs.length === 1 ? " pregunta" : " preguntas");
        list.querySelectorAll(".qedit").forEach((box) => {
          const i = +box.dataset.i;
          const act = (fn) => () => { collect(); fn(); paint(); };
          box.querySelector("[data-rm]").onclick = act(() => qs.splice(i, 1));
          box.querySelector("[data-up]").onclick = act(() => { [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]]; });
          box.querySelector("[data-down]").onclick = act(() => { [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]]; });
          box.querySelector("[data-addopt]")?.addEventListener("click", act(() => qs[i].options.push("")));
          box.querySelectorAll("[data-ro]").forEach((b) => b.onclick = act(() => {
            const oi = +b.dataset.ro;
            qs[i].options.splice(oi, 1);
            if(qs[i].correct === oi) qs[i].correct = 0; else if(qs[i].correct > oi) qs[i].correct--;
          }));
          box.querySelectorAll("input[type=radio]").forEach((r) => r.onchange = () => box.querySelectorAll(".qopt").forEach((x) => x.classList.toggle("ok", x.contains(r) && r.checked)));
        });
      };
      paint();
      m.querySelector("#qAdd").onclick = () => {
        collect();
        qs.push({q:"", options: final ? ["", "", "", ""] : ["", "", "", ""], correct:0, explain:""});
        paint();
        list.lastElementChild.scrollIntoView({behavior:"smooth", block:"center"});
        list.lastElementChild.querySelector("textarea").focus({preventScroll:true});
      };
      m.querySelector("#aSave").onclick = async () => {
        collect();
        const err = m.querySelector("#aErr");
        err.textContent = "";
        const bad = qs.findIndex((q) => !q.q.trim() || q.options.filter((o) => o.trim()).length < 2 || !(q.options[q.correct] || "").trim());
        if(bad >= 0){ err.textContent = "Revisá la pregunta " + (bad + 1) + ": necesita enunciado, al menos 2 opciones y la correcta marcada."; return; }
        const clean = qs.map((q) => {
          const keep = q.options.map((o, oi) => [o.trim(), oi]).filter(([o]) => o);
          const out = {q: q.q.trim(), options: keep.map(([o]) => o), correct: keep.findIndex(([, oi]) => oi === q.correct)};
          if(!final && (q.explain || "").trim()) out.explain = q.explain.trim();
          return out;
        });
        const body = {course: course.id, lesson: lesson.id, kind: final ? "final" : "practica", title: lesson.title, questions: clean, draft: false,
          passScore: Math.min(100, Math.max(1, +m.querySelector("#aPass").value || (final ? 80 : 67))),
          maxAttempts: final ? Math.max(0, +m.querySelector("#aMax").value || 0) : 0};
        const btn = m.querySelector("#aSave");
        btn.disabled = true;
        try{
          if(a) await pb.collection("assessments").update(a.id, body);
          else await pb.collection("assessments").create(body);
          closeModal();
          ok("¡Guardado con éxito!", clean.length + " preguntas listas en el campus.");
          if(after) after(); else renderCurso(course.id);
        }catch(e2){ err.textContent = errMsg(e2); btn.disabled = false; }
      };
    }, true);
  }

  const ACCEPT = {video:"video/*", audio:"audio/*", pdf:"application/pdf", image:"image/*"};

  function lessonModal(course, l, nextOrder){
    const isNew = !l;
    const x = l || {title:"", section:"", description:"", kind:"video", url:"", content:"", duration:"", order: nextOrder};
    openModal(`<span class="eyebrow">${esc(course.title)}</span><h2 style="margin-top:8px">${isNew ? "Nueva lección" : "Editar lección"}</h2>
      <form id="lForm" novalidate>
        <label class="field"><span>Título</span><input class="input" name="title" required value="${esc(x.title)}"></label>
        <div class="two">
          <label class="field"><span>Tipo</span><select class="input" name="kind">${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}"${x.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Sección / unidad</span><input class="input" name="section" value="${esc(x.section || "")}" placeholder="Ej: Biomecánica"></label>
        </div>
        <label class="field"><span>Descripción corta</span><input class="input" name="description" value="${esc(x.description || "")}"></label>
        <div class="field" data-for="file"><span>Archivo</span>
          ${x.file ? `<span class="hint" style="margin:0">Actual: <a href="${fileUrl(x, x.file)}" target="_blank" rel="noopener" style="color:var(--yellow)">${esc(x.file)}</a>. Subí otro para reemplazarlo.</span>` : ""}
          <input class="input" type="file" name="file"></div>
        <label class="field" data-for="url"><span>Link de YouTube, Vimeo u otro embebible</span><input class="input" name="url" type="url" value="${esc(x.url || "")}" placeholder="https://www.youtube.com/watch?v=…"></label>
        <label class="field"><span data-content-label>Contenido / material complementario</span><textarea class="input" name="content" rows="6">${esc(fromHtml(x.content))}</textarea></label>
        <div class="two">
          <label class="field"><span>Duración (opcional)</span><input class="input" name="duration" value="${esc(x.duration || "")}" placeholder="12 min"></label>
          <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(x.order || 0)}"></label>
        </div>
        <div id="upWrap" hidden><div class="upbar"><i id="upFill"></i></div><span class="hint mono" id="upTxt">0%</span></div>
        <p class="error-msg" id="lErr2" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="lSave">${isNew ? "Agregar lección" : "Guardar"}</button></div>
      </form>`, (m) => {
      const form = m.querySelector("#lForm");
      const sync = () => {
        const k = form.kind.value;
        m.querySelector('[data-for="file"]').hidden = !ACCEPT[k];
        m.querySelector('[data-for="url"]').hidden = k !== "embed";
        form.file.accept = ACCEPT[k] || "";
        m.querySelector("[data-content-label]").textContent = k === "text" ? "Contenido de la lectura" : "Material complementario (opcional)";
      };
      form.kind.onchange = sync;
      sync();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = m.querySelector("#lErr2");
        err.textContent = "";
        const k = form.kind.value;
        if(!form.title.value.trim()){ err.textContent = "La lección necesita un título."; return; }
        if(k === "embed" && !form.url.value.trim()){ err.textContent = "Pegá el link del video."; return; }
        const fd = new FormData();
        fd.set("course", course.id);
        fd.set("title", form.title.value.trim());
        fd.set("kind", k);
        fd.set("section", form.section.value.trim());
        fd.set("description", form.description.value.trim());
        fd.set("url", k === "embed" ? form.url.value.trim() : "");
        fd.set("content", toHtml(form.content.value));
        fd.set("duration", form.duration.value.trim());
        fd.set("order", form.order.value || "0");
        const file = ACCEPT[k] && form.file.files[0];
        if(file) fd.set("file", file);

        const btn = m.querySelector("#lSave");
        btn.disabled = true;
        try{
          await uploadRecord("lessons", isNew ? null : l.id, fd, file ? (p) => {
            m.querySelector("#upWrap").hidden = false;
            m.querySelector("#upFill").style.width = p + "%";
            m.querySelector("#upTxt").textContent = p < 100 ? "Subiendo " + p + "% · " + Math.round(file.size / 1048576) + " MB" : "Procesando…";
          } : null);
          closeModal();
          ok(isNew ? "¡Lección creada con éxito!" : "¡Lección guardada!");
          renderCurso(course.id);
        }catch(e2){
          err.textContent = e2.message;
          btn.disabled = false;
        }
      };
    });
  }

  // Sube con XMLHttpRequest para poder mostrar el progreso de archivos grandes.
  function uploadRecord(collection, id, formData, onProgress){
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(id ? "PATCH" : "POST", "/pb/api/collections/" + collection + "/records" + (id ? "/" + id : ""));
      xhr.setRequestHeader("Authorization", pb.authStore.token);
      if(onProgress) xhr.upload.onprogress = (e) => { if(e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let data = null;
        try{ data = JSON.parse(xhr.responseText); }catch{}
        if(xhr.status >= 200 && xhr.status < 300) return resolve(data);
        const fieldErr = data && data.data && Object.entries(data.data)[0];
        reject(new Error(fieldErr ? fieldErr[0] + ": " + fieldErr[1].message : (data && data.message) || "Error " + xhr.status));
      };
      xhr.onerror = () => reject(new Error("Se cortó la conexión durante la subida."));
      xhr.send(formData);
    });
  }

  /* =====================================================
     CERTIFICADOS EMITIDOS
     ===================================================== */
  const certState = {page:1, q:""};

  async function renderCertificados(){
    const filter = certState.q ? pb.filter("(studentName ~ {:q} || folio ~ {:q} || title ~ {:q})", {q: certState.q}) : "";
    const res = await pb.collection("certificates").getList(certState.page, 30, {sort:"-created", filter});
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Generador de certificados</span><h1>Certificados</h1></div>
        <div class="actions"><button class="btn btn-primary" id="newCert">+ Emitir certificado</button></div></div>
      <div class="toolbar"><input class="input" id="q" type="search" placeholder="Buscar por alumno, folio o certificación" value="${esc(certState.q)}"></div>
      ${res.items.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Folio</th><th>Alumno</th><th>Certificación</th><th>Emisión</th><th>Origen</th><th></th></tr></thead>
        <tbody class="stagger">${res.items.map((c) => `<tr data-id="${c.id}">
          <td class="num">${esc(c.folio)}</td>
          <td><div class="who-cell"><div class="avatar">${esc(initials(c.studentName))}</div><b>${esc(c.studentName)}</b></div></td>
          <td>${esc(c.title)}${c.hours ? `<span class="sub">${esc(c.hours)}</span>` : ""}</td>
          <td>${esc(Cert.dateShort(c.issueDate))}</td>
          <td>${c.source === "curso" ? '<span class="badge good">Curso completado</span>' : '<span class="badge hot">Emitido por admin</span>'}</td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-view>Ver</button><button class="btn btn-danger btn-sm" data-del>Revocar</button></div></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="table-wrap"><div class="empty-row">Todavía no hay certificados${certState.q ? " con esa búsqueda" : ""}. Se generan solos cuando un alumno completa un curso, o emitilos acá.</div></div>`}
      ${pager(res)}`;
    stagger(view);
    $("newCert").onclick = () => issueModal({});
    const byId = new Map(res.items.map((c) => [c.id, c]));
    view.querySelectorAll("tr[data-id]").forEach((tr) => {
      const c = byId.get(tr.dataset.id);
      tr.querySelector("[data-view]").onclick = () => certViewModal(c);
      tr.querySelector("[data-del]").onclick = async () => {
        if(!(await confirmBox("Revocar certificado", "El folio " + c.folio + " deja de ser válido y desaparece del panel del alumno.", "Revocar"))) return;
        try{ await pb.collection("certificates").delete(c.id); ok("¡Certificado revocado!"); renderCertificados(); }
        catch(err){ fail(err); }
      };
    });
    searchInput("q", (v) => { certState.q = v; certState.page = 1; return renderCertificados(); });
    bindPager(certState, renderCertificados);
  }

  function certActions(c){
    return `<div class="cert-actions">
      <button class="btn btn-primary" data-dl="pdf">Descargar PDF</button>
      <button class="btn btn-ghost" data-dl="png">Descargar PNG</button>
      <button class="btn btn-ghost" data-copy>Copiar link de verificación</button>
    </div>`;
  }
  function bindCertActions(m, c){
    m.querySelectorAll("[data-dl]").forEach((b) => b.onclick = async () => {
      const label = b.textContent;
      b.disabled = true; b.textContent = "Generando…";
      try{ await Cert.download(c, b.dataset.dl); ok("¡Descarga lista!", "Certificado " + c.folio + " en " + b.dataset.dl.toUpperCase() + "."); }
      catch(err){ fail(err.message); }
      finally{ b.disabled = false; b.textContent = label; }
    });
    m.querySelector("[data-copy]").onclick = () => navigator.clipboard.writeText(location.origin + "/verificar?folio=" + c.folio).then(() => ok("¡Link copiado!", "Cualquiera puede verificar el certificado con ese link."));
  }

  function certViewModal(c){
    openModal(`<span class="eyebrow">Folio ${esc(c.folio)}</span><h2 style="margin-top:8px">${esc(c.studentName)}</h2>
      <div id="certPrev"></div>${certActions(c)}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cerrar</button></div>`, (m) => {
      Cert.mount(m.querySelector("#certPrev"), c);
      bindCertActions(m, c);
    }, true);
  }

  // Emitir certificado con vista previa en vivo.
  async function issueModal({user}){
    const [users, programs, courses] = await Promise.all([
      pb.collection("users").getFullList({fields:"id,name,email,docId", sort:"name"}),
      pb.collection("programs").getFullList({sort:"order,title"}),
      getCourses(),
    ]);
    const titles = [...programs.map((p) => p.title), ...courses.map((c) => c.title)];
    openModal(`<span class="eyebrow">Generador de certificados</span><h2 style="margin-top:8px">Emitir certificado</h2>
      <div class="issue">
        <form id="iForm" novalidate>
          <label class="field"><span>Alumno (buscá por nombre o correo)</span>
            <input class="input" name="who" list="uList" placeholder="Escribí para buscar…" value="${user ? esc(user.email) : ""}" autocomplete="off">
            <datalist id="uList">${users.map((u) => `<option value="${esc(u.email)}">${esc(u.name || "")}</option>`).join("")}</datalist></label>
          <label class="field"><span>Nombre en el certificado</span><input class="input" name="studentName" required value="${esc(user ? user.name || "" : "")}"></label>
          <label class="field"><span>Certificación</span><select class="input" name="titleSel">
            ${titles.map((t) => `<option>${esc(t)}</option>`).join("")}<option value="__otra">Otra (escribirla)…</option></select></label>
          <label class="field" id="customWrap" hidden><span>Nombre de la certificación</span><input class="input" name="titleCustom"></label>
          <div class="two">
            <label class="field"><span>Horas / duración</span><input class="input" name="hours" placeholder="Ej: 120 horas"></label>
            <label class="field"><span>Fecha de emisión</span><input class="input" name="issueDate" type="date" value="${todayISO()}"></label>
          </div>
          <label class="field"><span>Identificación (opcional)</span><input class="input" name="docId" value="${esc(user ? user.docId || "" : "")}" placeholder="CURP / DNI"></label>
          <p class="hint">Si elegís un alumno con cuenta, el certificado aparece en su panel. También podés emitirlo para alguien sin cuenta.</p>
          <p class="error-msg" id="iErr" role="alert"></p>
          <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" id="iSave">Emitir certificado</button><button type="button" class="btn btn-ghost" data-close>Cancelar</button></div>
        </form>
        <div class="prev"><span class="eyebrow">Vista previa en vivo</span><div id="iPrev" style="margin-top:10px"></div></div>
      </div>`, (m) => {
      const form = m.querySelector("#iForm");
      const byEmail = new Map(users.map((u) => [u.email, u]));
      let selectedUser = user || null;
      const data = () => ({
        studentName: form.studentName.value.trim() || "Nombre del Alumno",
        title: form.titleSel.value === "__otra" ? form.titleCustom.value.trim() : form.titleSel.value,
        hours: form.hours.value.trim(),
        issueDate: form.issueDate.value,
        docId: form.docId.value.trim(),
        folio: "IF-" + new Date().getFullYear() + "-XXXX",
      });
      let t;
      const refresh = () => { clearTimeout(t); t = setTimeout(() => Cert.mount(m.querySelector("#iPrev"), data()), 180); };
      form.who.oninput = () => {
        const u = byEmail.get(form.who.value.trim());
        selectedUser = u || null;
        if(u){ form.studentName.value = u.name || ""; form.docId.value = u.docId || ""; refresh(); }
      };
      form.titleSel.onchange = () => { m.querySelector("#customWrap").hidden = form.titleSel.value !== "__otra"; refresh(); };
      form.addEventListener("input", refresh);
      Cert.mount(m.querySelector("#iPrev"), data());

      form.onsubmit = async (e) => {
        e.preventDefault();
        const d = data();
        const err = m.querySelector("#iErr");
        if(!form.studentName.value.trim()){ err.textContent = "Escribí el nombre del alumno."; return; }
        if(!d.title){ err.textContent = "Elegí o escribí la certificación."; return; }
        const btn = m.querySelector("#iSave");
        btn.disabled = true;
        try{
          const course = courses.find((c) => c.title === d.title);
          const cert = await api("/api/admin/certificates", {...d, user: selectedUser ? selectedUser.id : "", course: course ? course.id : ""});
          ok("¡Certificado emitido con éxito!", "Folio " + cert.folio);
          certViewModal(cert);
          if(location.hash.startsWith("#/certificados")) renderCertificados();
        }catch(e2){
          err.textContent = e2.message;
          btn.disabled = false;
        }
      };
    }, true);
  }

  /* =====================================================
     CATÁLOGO DE CERTIFICACIONES
     ===================================================== */
  async function renderCertificaciones(){
    const items = await pb.collection("programs").getFullList({sort:"order,title"});
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Certificaciones ISSA que ve el alumno: ficha, temario y precio</span><h1>Certificaciones</h1></div>
        <div class="actions"><button class="btn btn-primary" id="newProg">+ Nueva certificación</button></div></div>
      <div class="tiles stagger">${items.map((p) => `<div class="card tile spot" data-id="${p.id}" tabindex="0" role="button">
        <div class="cv${p.image ? "" : " ph"}" ${p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}>${p.image ? "" : `<span>${esc(initials(p.title))}</span>`}</div>
        <div class="cb"><div class="badges"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span>${p.published ? '<span class="badge good">Visible</span>' : '<span class="badge">Oculta</span>'}${p.course ? '<span class="badge">📝 Evaluación</span>' : ""}${(p.modules || []).length ? `<span class="badge">${p.modules.length} módulos</span>` : '<span class="badge bad">Sin temario</span>'}</div>
          <h3>${esc(p.title)}</h3><p>${p.price ? "<b style='color:var(--fg)'>$" + (+p.price).toLocaleString("es-MX") + "</b> · " : ""}${esc(p.summary || "")}</p></div></div>`).join("")}
        <button class="tile add" id="newProg2"><span class="plus">+</span>Nueva certificación</button></div>`;
    stagger(view);
    $("newProg").onclick = $("newProg2").onclick = () => programModal(null, items.length + 1);
    const byId = new Map(items.map((p) => [p.id, p]));
    view.querySelectorAll(".tile[data-id]").forEach((el) => {
      const open = () => programModal(byId.get(el.dataset.id));
      el.onclick = open;
      el.onkeydown = (e) => { if(e.key === "Enter") open(); };
    });
  }

  function programModal(p, nextOrder){
    const isNew = !p;
    const x = p || {title:"", kind:"certificacion", summary:"", duration:"", modality:"Online + práctica", published:true, order: nextOrder};
    const mods = Array.isArray(x.modules) ? x.modules : [];
    openModal(`<span class="eyebrow">Catálogo · certificación ISSA</span><h2 style="margin-top:8px">${isNew ? "Nueva certificación" : "Editar certificación"}</h2>
      <form id="pForm" novalidate>
        <div class="prog-ed">
        <div>
        <h3 class="ed-h">Datos y precio</h3>
        <label class="field"><span>Nombre</span><input class="input" name="title" required value="${esc(x.title)}"></label>
        <div class="two">
          <label class="field"><span>Tipo</span><select class="input" name="kind">${Object.entries(KIND_PROGRAM).map(([k, v]) => `<option value="${k}"${x.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(x.order || 0)}"></label>
        </div>
        <label class="field"><span>Descripción breve (tarjeta)</span><textarea class="input" name="summary" rows="2">${esc(x.summary || "")}</textarea></label>
        <div class="two">
          <label class="field"><span>Duración</span><input class="input" name="duration" value="${esc(x.duration || "")}" placeholder="Ej: 4 meses"></label>
          <label class="field"><span>Modalidad</span><input class="input" name="modality" value="${esc(x.modality || "")}"></label>
        </div>
        <div class="two">
          <label class="field"><span>Precio (moneda de Ajustes)</span><input class="input" name="price" type="number" min="0" step="0.01" value="${esc(x.price || "")}" placeholder="Ej: 851.09"></label>
          <label class="field"><span>Precio anterior (tachado, opcional)</span><input class="input" name="priceBefore" type="number" min="0" step="0.01" value="${esc(x.priceBefore || "")}"></label>
        </div>
        <div class="two">
          <label class="field"><span>Nota del precio (opcional)</span><input class="input" name="priceNote" maxlength="120" value="${esc(x.priceNote || "")}" placeholder="o $10,230 MXN a 6 meses sin intereses"></label>
          <label class="field"><span>Texto si no hay precio</span><input class="input" name="priceLabel" value="${esc(x.priceLabel || "")}" placeholder="Precio a consultar"></label>
        </div>
        <label class="field"><span>Nota destacada en la web (opcional)</span><input class="input" name="note" value="${esc(x.note || "")}" placeholder="Ej: Precio Buen Fin"></label>
        <div class="field"><span>Imagen (16:9)</span>
          <div class="cover-prev" id="pPrev" ${x.image ? `style="background-image:url('${fileUrl(x, x.image, "640x360")}')"` : ""}>${x.image ? "" : "Sin imagen"}</div>
          <input class="input" type="file" name="image" accept="image/png,image/jpeg,image/webp"></div>
        <p class="hint" style="margin-top:-6px">La misma imagen se ve en el panel, en el campus y en la tarjeta de la web. JPG, PNG o WEBP de hasta 10 MB.</p>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="published"${x.published ? " checked" : ""}> Visible en el campus y en la web</label>
        </div>
        <div>
        <h3 class="ed-h">Ficha del programa (lo que ve el alumno)</h3>
        <label class="field"><span>Destacados · uno por línea</span><textarea class="input" name="highlights" rows="3" placeholder="10 módulos&#10;Certificación ISSA&#10;Incluye RCP/DEA">${esc(x.highlights || "")}</textarea></label>
        <label class="field"><span>El programa · qué va a lograr</span><textarea class="input" name="objective" rows="4">${esc(x.objective || "")}</textarea></label>
        <label class="field"><span>A quién va dirigido · un perfil por línea</span><textarea class="input" name="audience" rows="3">${esc(x.audience || "")}</textarea></label>
        <label class="field"><span>Recursos y metodología · uno por línea</span><textarea class="input" name="resources" rows="3">${esc(x.resources || "")}</textarea></label>
        <label class="field"><span>Perfil de egreso</span><textarea class="input" name="profile" rows="3">${esc(x.profile || "")}</textarea></label>
        <div class="field"><span>Temario en PDF (opcional)</span>
          ${x.brochure ? `<div class="brochure-row"><a class="btn btn-ghost btn-sm" href="${fileUrl(x, x.brochure)}" target="_blank" rel="noopener">Ver PDF actual ↗</a><label class="check"><input type="checkbox" name="brochureRm"> Quitarlo</label></div>` : ""}
          <input class="input" type="file" name="brochure" accept="application/pdf"></div>
        </div>
        </div>
        <div class="field"><span>Módulos · el alumno los abre uno por uno</span>
          <div class="mods" id="pMods"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="pAddMod">+ Agregar módulo</button></div>
        ${isNew ? '<p class="hint">Guardá la certificación y después creale su evaluación.</p>' : `<div class="field"><span>Evaluación de la certificación</span><div class="card" id="pExam" style="padding:14px 16px"><span class="muted">Cargando…</span></div></div>`}
        <p class="error-msg" id="pErr" role="alert"></p>
        <div class="modal-actions">${isNew ? "" : '<button type="button" class="btn btn-danger" id="pDel" style="margin-right:auto">Eliminar</button>'}<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="pSave">${isNew ? "Crear" : "Guardar"}</button></div>
      </form>`, (m) => {
      const form = m.querySelector("#pForm");
      // Editor de módulos: título + temas (uno por línea), con orden.
      const modBox = m.querySelector("#pMods");
      const readMods = () => [...modBox.querySelectorAll(".mod-ed")].map((r) => ({title: r.querySelector("[data-t]").value.trim(), topics: r.querySelector("[data-k]").value.trim()})).filter((r) => r.title || r.topics);
      const paintMods = (list) => {
        modBox.innerHTML = list.map((md, i) => `<div class="mod-ed"><div class="mod-ed-h"><b>${i + 1}</b><input class="input" data-t placeholder="Ej: Módulo 1: Fundamentos" value="${esc(md.title)}">
          <button type="button" class="btn btn-ghost btn-sm" data-up="${i}"${i ? "" : " disabled"} aria-label="Subir">↑</button><button type="button" class="btn btn-ghost btn-sm" data-dn="${i}"${i < list.length - 1 ? "" : " disabled"} aria-label="Bajar">↓</button><button type="button" class="btn btn-danger btn-sm" data-rm="${i}">Quitar</button></div>
          <textarea class="input" data-k rows="3" placeholder="Temas, uno por línea">${esc(md.topics)}</textarea></div>`).join("") || '<p class="muted" style="margin:0 0 10px">Sin módulos todavía.</p>';
        modBox.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { const l = readAll(); l.splice(+b.dataset.rm, 1); paintMods(l); });
        modBox.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => { const l = readAll(), k = +b.dataset.up; [l[k - 1], l[k]] = [l[k], l[k - 1]]; paintMods(l); });
        modBox.querySelectorAll("[data-dn]").forEach((b) => b.onclick = () => { const l = readAll(), k = +b.dataset.dn; [l[k + 1], l[k]] = [l[k], l[k + 1]]; paintMods(l); });
      };
      const readAll = () => [...modBox.querySelectorAll(".mod-ed")].map((r) => ({title: r.querySelector("[data-t]").value, topics: r.querySelector("[data-k]").value}));
      paintMods(mods.map((md) => ({title: md.title || "", topics: md.topics || ""})));
      m.querySelector("#pAddMod").onclick = () => { const l = readAll(); l.push({title:"", topics:""}); paintMods(l); modBox.lastElementChild.querySelector("[data-t]").focus(); };
      form.image.onchange = () => {
        const f = form.image.files[0];
        if(f){ const prev = m.querySelector("#pPrev"); prev.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')"; prev.textContent = ""; }
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        if(!form.title.value.trim()){ m.querySelector("#pErr").textContent = "Falta el nombre."; return; }
        const fd = new FormData();
        ["title", "kind", "summary", "duration", "modality", "priceLabel", "note", "priceNote", "highlights", "objective", "audience", "resources", "profile"].forEach((k) => fd.set(k, form[k].value.trim()));
        const num = (v) => String(Math.max(0, Math.round((parseFloat(v) || 0) * 100) / 100));
        fd.set("price", num(form.price.value));
        fd.set("priceBefore", num(form.priceBefore.value));
        fd.set("modules", JSON.stringify(readMods()));
        fd.set("order", form.order.value || "0");
        fd.set("published", form.published.checked ? "true" : "false");
        if(form.image.files[0]) fd.set("image", form.image.files[0]);
        if(form.brochure.files[0]) fd.set("brochure", form.brochure.files[0]);
        else if(form.brochureRm && form.brochureRm.checked) fd.set("brochure", "");
        m.querySelector("#pSave").disabled = true;
        try{
          if(isNew) await pb.collection("programs").create(fd);
          else await pb.collection("programs").update(p.id, fd);
          // El certificado usa el título del curso de la evaluación: se mantiene igual al de la certificación.
          // Su portada en el campus es la misma imagen de la certificación.
          if(!isNew && p.course){
            const cd = new FormData();
            cd.set("title", form.title.value.trim());
            cd.set("certHours", form.duration.value.trim());
            if(form.image.files[0]) cd.set("cover", form.image.files[0]);
            await pb.collection("courses").update(p.course, cd).catch(() => {});
            await getCourses(true);
          }
          closeModal();
          ok(isNew ? "¡Creado con éxito!" : "¡Guardado con éxito!", "El catálogo del alumno ya está actualizado.");
          renderCertificaciones();
        }catch(err){
          m.querySelector("#pErr").textContent = errMsg(err);
          m.querySelector("#pSave").disabled = false;
        }
      };
      if(!isNew) paintProgramExam(m.querySelector("#pExam"), p);
      m.querySelector("#pDel")?.addEventListener("click", async () => {
        if(!(await confirmBox("Eliminar certificación", "Se quita \"" + p.title + "\" del catálogo. Los certificados ya emitidos no cambian." + (p.course ? " Su evaluación queda guardada en Cursos." : "")))) return;
        try{ await pb.collection("programs").delete(p.id); ok("¡Eliminada!"); renderCertificaciones(); }
        catch(err){ fail(err); }
      });
    }, true);
  }

  // Busca el curso, la lección de examen y las preguntas de una certificación (sin crear nada).
  async function programExam(p){
    if(!p.course) return {};
    const course = await pb.collection("courses").getOne(p.course).catch(() => null);
    if(!course) return {};
    const lesson = (await pb.collection("lessons").getFullList({filter: pb.filter('course = {:c} && kind = "exam"', {c: course.id}), sort:"order"}))[0] || null;
    const a = lesson ? (await pb.collection("assessments").getFullList({filter: pb.filter("lesson = {:l}", {l: lesson.id})}))[0] || null : null;
    return {course, lesson, a};
  }

  // Crea lo que falte para que la certificación tenga examen: su curso (oculto del catálogo libre) y la lección.
  async function ensureProgramExam(p){
    let {course, lesson, a} = await programExam(p);
    if(!course){
      const fd = new FormData();
      Object.entries({title: p.title, subtitle: "Evaluación de la certificación", published: true, openAccess: false, isGift: false,
        certEnabled: true, certHours: p.duration || "", order: (await getCourses(true)).length + 1}).forEach(([k, v]) => fd.set(k, String(v)));
      // Misma imagen que la certificación.
      if(p.image){
        const blob = await fetch(fileUrl(p, p.image)).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
        if(blob) fd.set("cover", new File([blob], p.image, {type: blob.type}));
      }
      course = await pb.collection("courses").create(fd);
      await pb.collection("programs").update(p.id, {course: course.id});
      p.course = course.id;
    }
    if(!lesson){
      const others = await pb.collection("lessons").getFullList({filter: pb.filter("course = {:c}", {c: course.id}), fields:"order"});
      lesson = await pb.collection("lessons").create({course: course.id, title: "Examen de certificación", section: "Acreditación", kind: "exam",
        order: Math.max(0, ...others.map((l) => l.order || 0)) + 1,
        description: "Aprobá con el puntaje mínimo y tu certificado se emite al instante."});
    }
    await getCourses(true);
    return {course, lesson, a};
  }

  async function paintProgramExam(box, p){
    const {course, lesson, a} = await programExam(p).catch(() => ({}));
    if(!box.isConnected) return;
    const qn = a && Array.isArray(a.questions) ? a.questions.length : 0;
    box.innerHTML = qn
      ? `<b>${qn} preguntas</b><span class="muted"> · aprueba con ${a.passScore || 80}% · ${a.maxAttempts ? a.maxAttempts + " oportunidades" : "oportunidades ilimitadas"}</span>
         <p class="hint" style="margin:8px 0 12px">Para que un alumno la rinda, habilitale «${esc(course.title)}» en Alumnos → Editar. Al aprobar queda ACREDITADO y recibe su certificado.</p>
         <div class="row-actions"><button type="button" class="btn btn-primary btn-sm" data-exam>Editar preguntas</button><a class="btn btn-ghost btn-sm" href="#/cursos/${course.id}" data-close>Material de estudio</a></div>`
      : `<span class="muted">${lesson ? "La evaluación está creada pero todavía no tiene preguntas." : "Esta certificación todavía no tiene evaluación."}</span>
         <div class="row-actions" style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm" data-exam>${lesson ? "Cargar preguntas" : "+ Crear evaluación"}</button></div>`;
    box.querySelector("[data-exam]").onclick = async (e) => {
      e.target.disabled = true;
      try{
        const x = await ensureProgramExam(p);
        closeModal();
        assessmentModal(x.course, x.lesson, x.a, renderCertificaciones);
      }catch(err){ e.target.disabled = false; fail(err); }
    };
  }

  /* =====================================================
     SEGUIMIENTO: inscripciones, evaluaciones y acreditación
     ===================================================== */
  const trackState = {q:"", course:"", status:"all"};
  const TRACK_STATUS = {acreditado:["Acreditado", "good"], agotado:["Sin oportunidades", "bad"], evaluando:["En evaluación", "hot"], cursando:["Cursando", ""], inscripto:["Inscripto", ""]};

  async function loadTracking(){
    const [students, courses, lessons, progress, assess, results, certs] = await Promise.all([
      pb.collection("users").getFullList({filter:'role != "admin" && role != "agent"', fields:"id,courses", batch:1000}),
      getCourses(true),
      pb.collection("lessons").getFullList({fields:"id,course,kind", batch:1000}),
      pb.collection("progress").getFullList({fields:"user,course", batch:2000}),
      pb.collection("assessments").getFullList({fields:"id,course,kind,maxAttempts"}),
      pb.collection("assessment_results").getFullList({fields:"id,user,course,kind,score,passed,created,attemptNo", sort:"created", batch:2000}),
      pb.collection("certificates").getFullList({fields:"id,user,course,folio,issueDate", batch:1000}),
    ]);
    let enr = await pb.collection("enrollments").getFullList({expand:"user", sort:"-created", batch:1000});
    // Alumnos con cursos asignados a mano antes de existir las inscripciones: las completamos.
    const have = new Set(enr.map((e) => e.user + ":" + e.course));
    const missing = students.flatMap((u) => (u.courses || []).filter((c) => !have.has(u.id + ":" + c)).map((c) => ({user:u.id, course:c})));
    if(missing.length){
      await Promise.all(missing.map((x) => pb.collection("enrollments").create({...x, status:"inscripto", source:"admin", attempts:0, extraAttempts:0}).catch(() => null)));
      enr = await pb.collection("enrollments").getFullList({expand:"user", sort:"-created", batch:1000});
    }
    const lessonCount = {}, prog = {}, best = {};
    lessons.forEach((l) => { lessonCount[l.course] = (lessonCount[l.course] || 0) + 1; });
    progress.forEach((p) => { const k = p.user + ":" + p.course; prog[k] = (prog[k] || 0) + 1; });
    results.forEach((r) => { const k = r.user + ":" + r.course + ":" + r.kind; best[k] = Math.max(best[k] || 0, r.score); });
    const finalBy = new Map(assess.filter((a) => a.kind === "final").map((a) => [a.course, a]));
    const certBy = new Map(certs.map((c) => [c.user + ":" + c.course, c]));
    const names = new Map(courses.map((c) => [c.id, c.title]));
    const rows = enr.filter((e) => e.expand && e.expand.user).map((e) => {
      const k = e.user + ":" + e.course, fin = finalBy.get(e.course);
      const allowed = fin && fin.maxAttempts > 0 ? fin.maxAttempts + (e.extraAttempts || 0) : 0;
      const pct = lessonCount[e.course] ? Math.round(((prog[k] || 0) / lessonCount[e.course]) * 100) : 0;
      const status = e.status === "acreditado" ? "acreditado" : allowed && (e.attempts || 0) >= allowed ? "agotado" : (e.attempts || 0) > 0 ? "evaluando" : pct > 0 ? "cursando" : "inscripto";
      return {e, u:e.expand.user, course:names.get(e.course) || "Curso eliminado", pct, practice:best[k + ":practica"], exam:best[k + ":final"], allowed, status, cert:certBy.get(k),
        history: results.filter((r) => r.user === e.user && r.course === e.course)};
    });
    return {rows, courses};
  }

  async function renderSeguimiento(){
    const {rows, courses} = await loadTracking();
    const count = (s) => rows.filter((r) => r.status === s).length;
    const examScores = rows.filter((r) => r.exam != null).map((r) => r.exam);
    const q = trackState.q.toLowerCase();
    const shown = rows.filter((r) => (trackState.status === "all" || r.status === trackState.status)
      && (!trackState.course || r.e.course === trackState.course)
      && (!q || (r.u.name || "").toLowerCase().includes(q) || (r.u.email || "").toLowerCase().includes(q) || (r.u.phone || "").includes(q)));
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Registro → curso → examen → certificado</span><h1>Seguimiento</h1></div>
        <div class="actions"><button class="btn btn-ghost" id="trackCsv">Exportar CSV</button></div></div>
      <div class="kpis stagger">
        ${kpi("Inscripciones", rows.length, "🧾", new Set(rows.map((r) => r.e.user)).size + " alumnos")}
        ${kpi("Cursando", count("cursando") + count("inscripto"), "📚", "todavía sin examen")}
        ${kpi("En evaluación", count("evaluando"), "📝", "rindieron sin acreditar")}
        ${kpi("Acreditados", count("acreditado"), "✅", rows.length ? Math.round((count("acreditado") / rows.length) * 100) + "% de los inscriptos" : "—")}
        ${kpi("Sin oportunidades", count("agotado"), "🆘", "necesitan apoyo")}
        ${kpi("Promedio examen", examScores.length ? Math.round(examScores.reduce((a, b) => a + b, 0) / examScores.length) : 0, "🎯", "mejor nota por alumno", "%")}
      </div>
      <div class="toolbar">
        <input class="input" id="q" type="search" placeholder="Buscar por nombre, correo o teléfono" value="${esc(trackState.q)}">
        <select class="input mini-select" id="tCourse" style="padding:10px 14px"><option value="">Todos los cursos</option>${courses.map((c) => `<option value="${c.id}"${trackState.course === c.id ? " selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
        <div class="seg" id="tSeg">${[["all", "Todos"], ["inscripto", "Inscriptos"], ["cursando", "Cursando"], ["evaluando", "En evaluación"], ["acreditado", "Acreditados"], ["agotado", "Sin oportunidades"]].map(([k, v]) => `<button data-s="${k}" class="${trackState.status === k ? "on" : ""}">${v}</button>`).join("")}</div>
      </div>
      ${shown.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Alumno</th><th>Curso · inscripción</th><th>Avance</th><th>Comprobación</th><th>Examen final</th><th>Intentos</th><th>Estado</th><th>Certificado</th><th></th></tr></thead>
        <tbody class="stagger">${shown.map((r, i) => {
          const [label, cls] = TRACK_STATUS[r.status];
          return `<tr data-i="${rows.indexOf(r)}">
          <td><div class="who-cell">${avatarHtml(r.u)}<div><b>${esc(r.u.name || "—")}</b><span class="sub">${esc(r.u.email)}</span>${r.u.phone ? `<a class="sub" style="color:var(--yellow)" target="_blank" rel="noopener" href="${waLink(r.u.country, r.u.phone)}">+${esc(r.u.country || "")} ${esc(r.u.phone)}</a>` : ""}</div></div></td>
          <td style="min-width:170px"><b style="font-size:13.5px">${esc(r.course)}</b><span class="sub">${fmtDate(r.e.created)} · ${{registro:"Registro", evaluacion:"Evaluación", admin:"Admin"}[r.e.source] || "—"}</span></td>
          <td>${scoreChip(r.pct, r.pct === 100)}</td>
          <td>${r.practice != null ? scoreChip(r.practice, r.practice >= 67) : '<span class="muted">—</span>'}</td>
          <td>${r.exam != null ? scoreChip(r.exam, r.exam >= 80) : '<span class="muted">—</span>'}</td>
          <td class="num">${r.e.attempts || 0}${r.allowed ? " / " + r.allowed : ""}</td>
          <td><span class="badge ${cls}">${label}</span>${r.e.accreditedAt ? `<span class="sub">${fmtDate(r.e.accreditedAt)}</span>` : ""}</td>
          <td>${r.cert ? `<b class="mono" style="font-size:12.5px">${esc(r.cert.folio)}</b><span class="sub">${esc(Cert.dateShort(r.cert.issueDate))}</span>` : '<span class="muted">—</span>'}</td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-hist>Historial</button>${r.status !== "acreditado" && r.allowed ? '<button class="btn btn-primary btn-sm" data-more>+1 oportunidad</button>' : ""}</div></td>
        </tr>`;}).join("")}</tbody></table></div>` : `<div class="table-wrap"><div class="empty-row">No hay inscripciones${trackState.q || trackState.course || trackState.status !== "all" ? " con ese filtro" : " todavía"}.</div></div>`}`;
    stagger(view);
    view.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
    segPill($("tSeg"));
    $("tSeg").querySelectorAll("button").forEach((b) => b.onclick = () => { trackState.status = b.dataset.s; renderSeguimiento(); });
    $("tCourse").onchange = (e) => { trackState.course = e.target.value; renderSeguimiento(); };
    searchInput("q", (v) => { trackState.q = v; return renderSeguimiento(); });
    $("trackCsv").onclick = () => {
      const head = ["Nombre", "Correo", "País", "Teléfono", "Curso", "Inscripción", "Origen", "Avance %", "Comprobación %", "Examen %", "Intentos", "Intentos permitidos", "Estado", "Fecha acreditación", "Folio"];
      const lines = rows.map((r) => [r.u.name, r.u.email, r.u.country, r.u.phone, r.course, fmtDate(r.e.created), r.e.source, r.pct, r.practice ?? "", r.exam ?? "", r.e.attempts || 0, r.allowed || "ilimitados", TRACK_STATUS[r.status][0], r.e.accreditedAt ? fmtDate(r.e.accreditedAt) : "", r.cert ? r.cert.folio : ""]);
      const csv = "﻿" + [head, ...lines].map((l) => l.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
      a.download = "seguimiento-innovafit-" + todayISO() + ".csv";
      a.click();
      ok("¡CSV exportado!", rows.length + " inscripciones.");
    };
    view.querySelectorAll("tr[data-i]").forEach((tr) => {
      const r = rows[+tr.dataset.i];
      tr.querySelector("[data-hist]").onclick = () => historyModal(r);
      tr.querySelector("[data-more]")?.addEventListener("click", async () => {
        try{
          await pb.collection("enrollments").update(r.e.id, {extraAttempts: (r.e.extraAttempts || 0) + 1});
          ok("¡Oportunidad habilitada!", (r.u.name || r.u.email) + " ya puede volver a rendir el examen.");
          renderSeguimiento();
        }catch(err){ fail(err); }
      });
    });
  }

  function scoreChip(v, good){
    return `<span class="score-chip"><span class="mono" style="font-weight:700">${v}%</span><span class="mini"><i class="${good ? "ok" : ""}" style="width:${v}%"></i></span></span>`;
  }

  function historyModal(r){
    const KIND = {practica:"Comprobación", final:"Examen final"};
    const msg = "Hola " + ((r.u.name || "").split(" ")[0] || "") + "! Te escribimos de InnovaFit por tu curso " + r.course + ".";
    openModal(`<span class="eyebrow">${esc(r.course)}</span><h2 style="margin-top:8px">${esc(r.u.name || r.u.email)}</h2>
      <div class="cred" style="margin-top:12px">
        <div><span>Estado</span><b>${TRACK_STATUS[r.status][0]}</b></div>
        <div><span>Avance del curso</span><b>${r.pct}%</b></div>
        <div><span>Oportunidades del examen</span><b>${(r.e.attempts || 0) + (r.allowed ? " usadas de " + r.allowed : " usadas")}</b></div>
        ${r.cert ? `<div><span>Certificado</span><b class="mono">${esc(r.cert.folio)}</b></div>` : ""}
      </div>
      ${r.history.length ? `<div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>Fecha</th><th>Evaluación</th><th>Calificación</th><th>Resultado</th></tr></thead><tbody>
        ${r.history.slice().reverse().map((h) => `<tr><td>${fmtDateTime(h.created)}</td><td>${KIND[h.kind] || h.kind}${h.attemptNo ? " · intento " + h.attemptNo : ""}</td><td>${scoreChip(h.score, h.passed)}</td><td>${h.passed ? '<span class="badge good">Aprobó</span>' : '<span class="badge bad">No aprobó</span>'}</td></tr>`).join("")}
      </tbody></table></div>` : '<p class="muted">Todavía no rindió ninguna evaluación.</p>'}
      <div class="modal-actions">${r.u.phone ? `<a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink(r.u.country, r.u.phone, msg)}">Escribirle por WhatsApp</a>` : ""}<button class="btn btn-primary" data-close>Listo</button></div>`, null, true);
  }

  /* =====================================================
     AJUSTES: campaña comercial y sello del certificado
     ===================================================== */
  /* ---------- InnovaSale: descuentos por tiempo limitado (dentro de la campaña) ---------- */
  const toLocalInput = (d) => (d && !isNaN(d) ? new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const leftText = (ms) => {
    const t = Math.floor(ms / 60000), d = Math.floor(t / 1440), h = Math.floor(t / 60) % 24, m = t % 60;
    return (d ? d + " d " : "") + (d || h ? h + " h " : "") + m + " min";
  };

  function saleAdminHtml(s, progs){
    const mode = s.saleMode || "off";
    return `<div class="sale-admin" id="saleBox">
      <h3>🔥 InnovaSale · descuentos por tiempo limitado</h3>
      <p class="hint" style="margin:0 0 14px">Con la campaña activa, el catálogo de certificaciones de la web y la sección Certificaciones del campus se convierten en InnovaSale: fuego, cuenta regresiva, precios con descuento y cupos. Al terminar el tiempo vuelve solo a la normalidad.</p>
      <label class="field"><span>Descuentos</span><select class="input" name="saleMode">
        <option value="off"${mode === "off" ? " selected" : ""}>Sin descuentos</option>
        <option value="general"${mode === "general" ? " selected" : ""}>Un mismo % para todas las certificaciones</option>
        <option value="custom"${mode === "custom" ? " selected" : ""}>Un % distinto por certificación</option></select></label>
      <div data-sale="on">
        <div class="two">
          <label class="field" data-sale="general"><span>% de descuento para todas</span><input class="input" name="salePercent" type="number" min="1" max="90" value="${esc(s.salePercent || "")}" placeholder="Ej: 30"></label>
          <label class="field"><span>Cupos por certificación</span><input class="input" name="saleSlots" type="number" min="0" value="${esc(s.saleSlots || "")}" placeholder="Ej: 15 (vacío = sin cupos)"></label>
        </div>
        <div class="field"><span>Duración de la oferta</span>
          <div class="sale-dur">${[["24 h", 24], ["48 h", 48], ["72 h", 72], ["7 días", 168]].map(([l, h]) => `<button type="button" class="btn btn-ghost btn-sm" data-hours="${h}">${l}</button>`).join("")}</div>
          <input class="input" name="saleEnds" type="datetime-local" value="${toLocalInput(s.saleEnds ? new Date(String(s.saleEnds).replace(" ", "T")) : null)}">
          <small class="sale-left" id="saleLeft"></small></div>
        <div class="two">
          <label class="field"><span>Texto de la oferta</span><input class="input" name="saleText" maxlength="240" value="${esc(s.saleText || "")}" placeholder="Ofertas exclusivas en certificaciones por tiempo limitado."></label>
          <label class="field"><span>Moneda de los precios</span><input class="input" name="saleCurrency" maxlength="6" value="${esc(s.saleCurrency || "USD")}"></label>
        </div>
        <div class="field"><span>Precios por certificación</span>
          <div class="table-wrap"><table class="sale-table"><thead><tr><th>Certificación</th><th>Precio regular</th><th data-sale="custom">% desc.</th><th>Cupos</th><th>Ocupados</th><th>Precio InnovaSale</th></tr></thead><tbody>
            ${progs.map((p) => `<tr data-id="${p.id}"><td>${esc(p.title)}${p.published ? "" : ' <span class="badge">Oculta</span>'}</td>
              <td><input class="input" data-f="price" type="number" min="0" step="0.01" value="${esc(p.price || "")}" placeholder="Sin precio"></td>
              <td data-sale="custom"><input class="input" data-f="salePercent" type="number" min="0" max="90" value="${esc(p.salePercent || "")}" placeholder="0"></td>
              <td><input class="input" data-f="saleSlots" type="number" min="0" value="${esc(p.saleSlots || "")}" placeholder="General"></td>
              <td><input class="input" data-f="slotsTaken" type="number" min="0" value="${esc(p.slotsTaken || 0)}" title="Cada inscripción con descuento suma uno. Ponelo en 0 para reiniciar los cupos."></td>
              <td class="sale-final mono"></td></tr>`).join("")}
          </tbody></table></div>
          <p class="hint">Sin precio regular, la web muestra solo el % de descuento. Cupos vacíos usan los cupos generales. En modo "por certificación", las que queden en 0% no entran en la oferta. Cada inscripción con descuento ocupa un cupo; al agotarse, esa certificación vuelve a su precio regular. Para una oferta nueva, poné "Ocupados" en 0.</p></div>
      </div></div>`;
  }

  // Muestra/oculta según el modo, recalcula precios y devuelve lo que hay que guardar (o el error).
  function saleAdminMount(form, s){
    const box = form.querySelector("#saleBox");
    const read = () => {
      const mode = form.saleMode.value;
      const general = Math.round(+form.salePercent.value || 0);
      const endVal = form.saleEnds.value;
      const ends = endVal ? new Date(endVal) : null;
      const rows = [...box.querySelectorAll("tr[data-id]")].map((tr) => {
        const v = (f) => Math.max(0, Math.round(+tr.querySelector(`[data-f="${f}"]`).value || 0));
        const price = Math.max(0, Math.round((+tr.querySelector('[data-f="price"]').value || 0) * 100) / 100);
        return {tr, id: tr.dataset.id, price, salePercent: Math.min(90, v("salePercent")), saleSlots: v("saleSlots"), slotsTaken: v("slotsTaken")};
      });
      box.querySelectorAll('[data-sale="on"]').forEach((el) => (el.hidden = mode === "off"));
      box.querySelectorAll('[data-sale="general"]').forEach((el) => (el.hidden = mode !== "general"));
      box.querySelectorAll('[data-sale="custom"]').forEach((el) => (el.hidden = mode !== "custom"));
      const cur = form.saleCurrency.value.trim() || "USD";
      rows.forEach((r) => {
        const pct = mode === "general" ? general : r.salePercent;
        r.tr.querySelector(".sale-final").innerHTML = !pct || mode === "off" ? '<span class="muted">—</span>'
          : r.price ? `<b>${money(Math.round(r.price * (100 - pct)) / 100)}</b> ${esc(cur)} <span class="badge hot">-${pct}%</span>` : `<span class="badge hot">-${pct}%</span>`;
      });
      const left = ends ? ends - Date.now() : 0;
      $("saleLeft").textContent = !ends ? "Elegí cuándo termina." : left > 0 ? "Termina en " + leftText(left) + "." : "Esa fecha ya pasó: la oferta no se mostrará.";
      $("saleLeft").classList.toggle("bad", !!ends && left <= 0);
      let error = "";
      if(mode !== "off"){
        if(!ends || left <= 0) error = "InnovaSale: elegí una fecha de fin futura.";
        else if(mode === "general" && (general < 1 || general > 90)) error = "InnovaSale: el % de descuento va de 1 a 90.";
        else if(mode === "custom" && !rows.some((r) => r.salePercent > 0)) error = "InnovaSale: poné el % de descuento de al menos una certificación.";
      }
      return {
        error,
        rows: rows.map(({tr, ...r}) => r),
        settings: {
          saleMode: mode,
          salePercent: String(Math.min(90, general)),
          saleSlots: String(Math.max(0, Math.round(+form.saleSlots.value || 0))),
          saleEnds: ends && !isNaN(ends) ? ends.toISOString().replace("T", " ") : "",
          saleCurrency: cur,
          saleText: form.saleText.value.trim(),
        },
      };
    };
    box.querySelectorAll("[data-hours]").forEach((b) => b.onclick = () => {
      form.saleEnds.value = toLocalInput(new Date(Date.now() + b.dataset.hours * 3600000));
      read();
    });
    box.addEventListener("input", read);
    box.addEventListener("change", read);
    read();
    return read;
  }

  async function renderAjustes(){
    const s = await UI.settings(true);
    const progs = await pb.collection("programs").getFullList({sort:"order,title"});
    const sample = {studentName:"Nombre Apellido Ejemplo", title:"Fundamentos de Biomecánica", hours:"Módulo introductorio", issueDate:todayISO(), folio:"IF-2026-0000", score:95};
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Configuración</span><h1>Ajustes</h1></div></div>
      <div class="editor">
        <form class="card panel spot" id="campForm" novalidate>
          <h2>Campaña comercial</h2>
          <p class="hint" style="margin:0 0 14px">Se muestra en la pantalla de registro, en Mis cursos y en Certificaciones, con una cinta “BUEN FIN” sobre cada curso.</p>
          <label class="check" style="margin-bottom:14px"><input type="checkbox" name="campaignOn"${s.campaignOn ? " checked" : ""}> Campaña activa</label>
          <label class="field"><span>Título</span><input class="input" name="campaignTitle" value="${esc(s.campaignTitle || "")}" maxlength="80"></label>
          <label class="field"><span>Texto</span><input class="input" name="campaignText" value="${esc(s.campaignText || "")}" maxlength="240"></label>
          <div class="field"><span>Logo de la campaña (opcional)</span>
            <div class="cover-prev" id="campPrev" style="aspect-ratio:3/1;background-size:contain;${s.campaignLogo ? `background-image:url('${fileUrl(s, s.campaignLogo)}')` : ""}">${s.campaignLogo ? "" : "Sin logo: se usa la insignia Buen Fin de InnovaFit"}</div>
            <input class="input" type="file" name="campaignLogo" accept="image/*"></div>
          <p class="hint">Si InnovaFit está registrada como participante de El Buen Fin, subí acá el logo oficial que te dieron.</p>
          ${saleAdminHtml(s, progs)}
          <p class="error-msg" id="campErr" role="alert"></p>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary">Guardar campaña</button>${s.campaignLogo ? '<button type="button" class="btn btn-ghost" id="campRm">Quitar logo</button>' : ""}</div>
        </form>
        <form class="card panel" id="sealForm" novalidate>
          <h2>Sello de acreditación</h2>
          <p class="hint" style="margin:0 0 14px">Va al pie de cada certificado. Subí el logo de acreditación y aprobación de InnovaFit (PNG con fondo transparente o SVG, cuadrado).</p>
          <div id="certPrev"></div>
          <input class="input" type="file" name="sealLogo" accept="image/png,image/svg+xml,image/webp,image/jpeg" style="margin-top:14px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary">Guardar sello</button>${s.sealLogo ? '<button type="button" class="btn btn-ghost" id="sealRm">Volver al sello de fábrica</button>' : ""}</div>
        </form>
      </div>`;
    stagger(view);
    Cert.setSeal(s.sealLogo ? fileUrl(s, s.sealLogo) : "/assets/cert/seal-default.svg");
    let prev = Cert.mount($("certPrev"), sample);
    const save = async (data, msg) => {
      try{
        await pb.collection("settings").update(s.id, data);
        await UI.settings(true);
        ok("¡Guardado con éxito!", msg);
        renderAjustes();
      }catch(err){ fail(err); }
    };
    const camp = $("campForm");
    camp.campaignLogo.onchange = () => { const f = camp.campaignLogo.files[0]; if(f){ const p = $("campPrev"); p.style.backgroundImage = "url('" + URL.createObjectURL(f) + "')"; p.textContent = ""; } };
    const paintSale = saleAdminMount(camp, s);
    camp.onsubmit = async (e) => {
      e.preventDefault();
      $("campErr").textContent = "";
      const sale = paintSale();
      if(camp.campaignOn.checked && sale.error) return void ($("campErr").textContent = sale.error);
      const fd = new FormData();
      fd.set("campaignOn", camp.campaignOn.checked ? "true" : "false");
      fd.set("campaignTitle", camp.campaignTitle.value.trim());
      fd.set("campaignText", camp.campaignText.value.trim());
      if(camp.campaignLogo.files[0]) fd.set("campaignLogo", camp.campaignLogo.files[0]);
      Object.entries(sale.settings).forEach(([k, v]) => fd.set(k, v));
      try{
        // Precios, % y cupos de cada certificación: solo se guardan las filas que cambiaron.
        const byId = new Map(progs.map((p) => [p.id, p]));
        await Promise.all(sale.rows.filter((r) => {
          const p = byId.get(r.id);
          return (+p.price || 0) !== r.price || (+p.salePercent || 0) !== r.salePercent || (+p.saleSlots || 0) !== r.saleSlots || (+p.slotsTaken || 0) !== r.slotsTaken;
        }).map((r) => pb.collection("programs").update(r.id, {price: r.price, salePercent: r.salePercent, saleSlots: r.saleSlots, slotsTaken: r.slotsTaken})));
      }catch(err){ return fail(err); }
      const live = camp.campaignOn.checked && sale.settings.saleMode !== "off";
      save(fd, live ? "InnovaSale ya está activo en la web y en el campus." : camp.campaignOn.checked ? "La campaña ya se ve en el campus." : "La campaña quedó desactivada.");
    };
    $("campRm")?.addEventListener("click", () => save({campaignLogo: null}, "Se usa la insignia de InnovaFit."));
    const seal = $("sealForm");
    seal.sealLogo.onchange = () => {
      const f = seal.sealLogo.files[0];
      if(!f) return;
      prev.destroy();
      Cert.setSeal(URL.createObjectURL(f));
      prev = Cert.mount($("certPrev"), sample);
    };
    seal.onsubmit = (e) => {
      e.preventDefault();
      if(!seal.sealLogo.files[0]) return fail("Elegí la imagen del sello.");
      const fd = new FormData();
      fd.set("sealLogo", seal.sealLogo.files[0]);
      save(fd, "Los certificados nuevos y los ya emitidos muestran el sello nuevo.");
    };
    $("sealRm")?.addEventListener("click", () => save({sealLogo: null}, "Volvió el sello de fábrica."));
  }

  /* =====================================================
     WEB: textos de la landing, editables
     ===================================================== */
  const WEB_SPEC = [
    {key:"hero", label:"Portada (primer plano del recorrido)", fields:[["label", "Etiqueta chica"], ["title1", "Título · línea 1"], ["title2", "Título · línea 2 (en degradado)"], ["sub", "Bajada", "area"], ["cta", "Botón principal"], ["alt", "Botón al reto de 25 preguntas"], ["scroll", "Indicación para deslizar"]]},
    {key:"story", label:"Recorrido con el iPad (5 planos)", hint:"Cada texto aparece en un plano de cámara distinto mientras el iPad muestra esa parte del campus.", list:{key:"items", fields:[["title", "Título"], ["text", "Texto", "area"]], names:["Plano 2 · Registro", "Plano 3 · Cursos y certificaciones", "Plano 4 · Clases", "Plano 5 · Examen", "Plano 6 · Certificado"], fixed:true}},
    {key:"steps", label:"Cómo funciona (cronograma)", fields:[["title", "Título"], ["sub", "Bajada", "area"]], list:{key:"items", fields:[["when", "Cuándo (abajo de la columna)"], ["title", "Paso"], ["text", "Texto"]], names:["Paso 1", "Paso 2", "Paso 3", "Paso 4", "Paso 5"], fixed:true}},
    {key:"catalog", label:"Catálogo de cursos", hint:"Las tarjetas salen de Cursos (publicados con Inscripción libre) y de Certificaciones, con su precio y nota.", fields:[["title", "Título"], ["sub", "Bajada", "area"], ["centerLabel", "Texto del círculo"], ["tags", "Etiquetas (separadas por coma)", "area"], ["freeBadge", "Etiqueta de los cursos gratis"], ["freeNote", "Nota de los cursos gratis"], ["freeButton", "Botón de los cursos gratis"], ["askButton", "Botón de las certificaciones"]]},
    {key:"cert", label:"Certificado en vivo", fields:[["title", "Título"], ["text", "Texto", "area"], ["inputLabel", "Texto sobre el campo del nombre"]]},
    {key:"faq", label:"Preguntas frecuentes", fields:[["title", "Título"]], list:{key:"items", fields:[["q", "Pregunta"], ["a", "Respuesta", "area"]], add:"+ Agregar pregunta"}},
    {key:"cta", label:"Cierre", fields:[["title", "Título"], ["highlight", "Título en degradado"], ["text", "Frase", "area"], ["button", "Botón principal"], ["alt", "Botón de WhatsApp"]]},
    {key:"footer", label:"Pie de página", fields:[["about", "Descripción"], ["contact", "Contacto"]]},
  ];
  // Imágenes de la landing: campo en settings, nombre, ayuda e imagen de fábrica (sin imagen = pantalla de muestra).
  const WEB_IMAGES = [
    ["heroImage", "Persona de la escena", "La que mira el iPad durante el recorrido. Ideal: PNG recortado, sin fondo, de la cintura para arriba y mirando hacia la izquierda.", "/assets/campus/atleta-retrato.webp"],
    ["screen1", "iPad · pantalla de inicio", "Captura horizontal 4:3 (ej. 1600 × 1200). Si no subís nada, se ve la pantalla de muestra.", ""],
    ["screen2", "iPad · registro", "Captura horizontal 4:3.", ""],
    ["screen3", "iPad · cursos y certificaciones", "Captura horizontal 4:3.", ""],
    ["screen4", "iPad · clase", "Captura horizontal 4:3.", ""],
    ["screen5", "iPad · examen", "Captura horizontal 4:3.", ""],
    ["screen6", "iPad · certificado", "Captura horizontal 4:3.", ""],
    ["ctaImage", "Foto del cierre", "Va en el bloque final, sobre el brillo naranja. Ideal: PNG recortado sin fondo.", "/assets/campus/pareja-innovafit.webp"],
  ];
  async function renderWeb(){
    const s = await UI.settings(true);
    const LCm = window.LandingContent;
    let C = LCm.merge(LCm.DEFAULTS, s.landing);
    const input = (path, label, type, value) => {
      if(type === "abc") return `<label class="field"><span>${esc(label)}</span><select class="input" data-path="${path}">${["A", "B", "C"].map((x) => `<option${value === x ? " selected" : ""}>${x}</option>`).join("")}</select></label>`;
      if(type === "area") return `<label class="field"><span>${esc(label)}</span><textarea class="input" rows="3" data-path="${path}">${esc(value)}</textarea></label>`;
      return `<label class="field"><span>${esc(label)}</span><input class="input" data-path="${path}" value="${esc(value)}"></label>`;
    };
    const listHtml = (b) => {
      const L = b.list, base = L.key ? b.key + "." + L.key : b.key, arr = L.key ? C[b.key][L.key] : C[b.key];
      return `<div class="witems" data-list="${base}">${arr.map((it, i) => `<div class="witem">
        <div class="witem-h"><b>${esc(L.names ? L.names[i] || "Ítem " + (i + 1) : "Pregunta " + (i + 1))}</b>${L.fixed ? "" : `<button type="button" class="btn btn-danger btn-sm" data-rm="${i}">Quitar</button>`}</div>
        ${L.fields.map(([k, label, type]) => input(base + "." + i + "." + k, label, type, it[k])).join("")}</div>`).join("")}
        ${L.add ? `<button type="button" class="btn btn-ghost btn-sm" data-add>${esc(L.add)}</button>` : ""}</div>`;
    };
    const blocksHtml = () => WEB_SPEC.map((b, bi) => `<details class="wblock"${bi === 0 ? " open" : ""}><summary>${esc(b.label)}</summary><div class="wbody">
      ${b.hint ? `<p class="hint" style="margin:0 0 12px">${esc(b.hint)}</p>` : ""}
      ${(b.fields || []).map(([k, label, type]) => input(b.key + "." + k, label, type, C[b.key][k])).join("")}
      ${b.list ? listHtml(b) : ""}</div></details>`).join("");

    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">La landing de innovafit</span><h1>Web</h1></div>
        <div class="actions"><a class="btn btn-ghost" href="/" target="_blank">Ver la web ↗</a><button class="btn btn-primary" id="wSave">Guardar y publicar</button></div></div>
      <div class="web">
        <div>
          <div class="card panel spot" style="margin-bottom:14px">
            <h2 style="font-size:22px;margin-bottom:6px">Imágenes de la web</h2>
            <p class="hint" style="margin:0 0 14px">Las fotos de las tarjetas del catálogo se cambian en cada curso y certificación (campo "Foto para la web").</p>
            ${WEB_IMAGES.map(([f, label, hint, def]) => `<div class="whero" style="margin-bottom:14px">
              <div class="whero-img" style="background-image:url('${s[f] ? fileUrl(s, s[f]) : def}');${def || s[f] ? "" : "display:grid;place-items:center;font-size:12px;color:var(--muted)"}">${def || s[f] ? "" : "Pantalla de muestra"}</div>
              <div><b style="display:block;margin-bottom:4px">${esc(label)}</b><p class="hint" style="margin:0 0 10px">${esc(hint)}</p>
              <input class="input" type="file" data-img="${f}" accept="image/png,image/jpeg,image/webp">
              ${s[f] ? `<button type="button" class="btn btn-ghost btn-sm" data-img-rm="${f}" style="margin-top:10px">${def ? "Volver a la imagen original" : "Volver a la pantalla de muestra"}</button>` : ""}</div></div>`).join("")}
          </div>
          <form id="wForm" novalidate>${blocksHtml()}</form>
          <div class="wfoot"><button type="button" class="btn btn-ghost btn-sm" id="wReset">Restaurar todos los textos originales</button></div>
        </div>
        <div class="wprev"><div class="wprev-frame" id="wFrameBox"><iframe id="wFrame" src="/" title="Vista previa de la web" loading="lazy"></iframe></div><p class="hint" style="margin-top:8px">Vista previa de lo publicado. Se actualiza al guardar.</p></div>
      </div>`;
    stagger(view);

    // Escala la vista previa (la web real a 1440 px) al ancho disponible.
    const box = $("wFrameBox"), frame = $("wFrame");
    const fit = () => { const k = box.clientWidth / 1440; frame.style.transform = "scale(" + k + ")"; frame.style.height = (box.clientHeight / k) + "px"; };
    fit(); new ResizeObserver(fit).observe(box);

    const form = $("wForm");
    // Lee el formulario sobre una copia del contenido actual.
    const collect = () => {
      const out = JSON.parse(JSON.stringify(C));
      form.querySelectorAll("[data-path]").forEach((el) => {
        const parts = el.dataset.path.split(".");
        let o = out;
        parts.slice(0, -1).forEach((p) => { o = o[p]; });
        o[parts[parts.length - 1]] = el.value;
      });
      return out;
    };
    const repaint = () => {
      const open = [...form.querySelectorAll("details")].map((d) => d.open);
      form.innerHTML = blocksHtml();
      form.querySelectorAll("details").forEach((d, i) => { d.open = open[i]; });
      bindLists();
    };
    function bindLists(){
      form.querySelectorAll("[data-list]").forEach((box) => {
        const path = box.dataset.list.split(".");
        const arr = () => path.reduce((o, p) => o[p], C);
        box.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => { C = collect(); arr().splice(+b.dataset.rm, 1); repaint(); });
        box.querySelector("[data-add]")?.addEventListener("click", () => { C = collect(); arr().push({q:"", a:""}); repaint(); });
      });
    }
    bindLists();

    const saveFile = async (data, msg) => {
      try{ await pb.collection("settings").update(s.id, data); await UI.settings(true); ok("¡Guardado con éxito!", msg); renderWeb(); }
      catch(err){ fail(err); }
    };
    view.querySelectorAll("[data-img]").forEach((inp) => inp.onchange = () => {
      const f = inp.files[0];
      if(!f) return;
      inp.closest(".whero").querySelector(".whero-img").style.backgroundImage = "url('" + URL.createObjectURL(f) + "')";
      const fd = new FormData(); fd.set(inp.dataset.img, f);
      saveFile(fd, "La nueva imagen ya está en la web.");
    });
    view.querySelectorAll("[data-img-rm]").forEach((b) => b.onclick = () => saveFile({[b.dataset.imgRm]: null}, "Volvió la imagen original."));
    $("wSave").onclick = async () => {
      const data = collect();
      if(data.faq.items.some((f) => !f.q.trim() || !f.a.trim())) return fail("Hay una pregunta frecuente sin pregunta o sin respuesta.");
      if(!(data.hero.title1 + data.hero.title2).trim()) return fail("La portada necesita un título.");
      const btn = $("wSave");
      btn.disabled = true;
      try{
        await pb.collection("settings").update(s.id, {landing: data});
        C = data;
        ok("¡Publicado con éxito!", "Los cambios ya se ven en la web.");
        frame.contentWindow.location.reload();
      }catch(err){ fail(err); }
      finally{ btn.disabled = false; }
    };
    $("wReset").onclick = async () => {
      if(!(await confirmBox("Restaurar textos", "La web vuelve a los textos originales. Las imágenes, cursos y certificaciones no cambian.", "Restaurar"))) return;
      saveFile({landing: null}, "La web volvió a los textos originales.");
    };
  }

  /* =====================================================
     VENTAS: inscripciones a certificaciones ISSA
     ===================================================== */
  const INS = {
    nuevo:["Nueva", "hot"], contactado:["En contacto", ""], por_validar:["Comprobante por validar", "hot"], pagado:["Pagada · falta acceso", "good"],
    acceso:["Acceso enviado", "good"], rechazado:["Comprobante rechazado", "bad"], cancelado:["Cancelada", ""],
  };
  const PAID = ["pagado", "acceso"];
  const money = (n, cur) => "$" + (+n || 0).toLocaleString("es-MX", {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2}) + (cur ? " " + cur : "");
  const nowPb = () => new Date().toISOString().replace("T", " ");
  const isAdmin = () => pb.authStore.record && pb.authStore.record.role === "admin";
  const csvCell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  function downloadCsv(name, head, rows){
    const csv = [head.join(",")].concat(rows.map((r) => r.map(csvCell).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], {type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    ok("¡CSV exportado!", rows.length + " filas descargadas.");
  }

  let teamCache = null;
  async function getTeam(force){
    if(!teamCache || force) teamCache = await pb.collection("users").getFullList({filter:'role = "admin" || role = "agent"', sort:"name", fields:"id,name,email,role,avatar,collectionId"});
    return teamCache;
  }
  const teamName = (id) => { const u = (teamCache || []).find((x) => x.id === id); return u ? (u.name || u.email) : ""; };

  const salesState = {page:1, q:"", status:"open", program:"", mine:false};
  const SALES_SEGS = [["open", "Activas"], ["nuevo", "Nuevas"], ["por_validar", "Por validar"], ["pagado", "Falta acceso"], ["acceso", "Completadas"], ["closed", "Canceladas"], ["all", "Todas"]];

  function salesFilter(){
    const parts = [];
    const st = salesState.status;
    if(st === "open") parts.push('(status = "nuevo" || status = "contactado" || status = "por_validar" || status = "rechazado" || status = "pagado")');
    else if(st === "closed") parts.push('status = "cancelado"');
    else if(st !== "all") parts.push(pb.filter("status = {:s}", {s: st}));
    if(salesState.program) parts.push(pb.filter("program = {:p}", {p: salesState.program}));
    if(salesState.mine) parts.push(pb.filter("agent = {:u}", {u: pb.authStore.record.id}));
    if(salesState.q) parts.push(pb.filter("(name ~ {:q} || email ~ {:q} || code ~ {:q} || phone ~ {:q})", {q: salesState.q}));
    return parts.join(" && ");
  }

  async function renderVentas(){
    await getTeam();
    const [res, progs, counts] = await Promise.all([
      pb.collection("inscriptions").getList(salesState.page, 30, {sort:"-created", filter: salesFilter()}),
      pb.collection("programs").getFullList({sort:"order,title", fields:"id,title"}),
      Promise.all(["nuevo", "por_validar", "pagado"].map((s) => pb.collection("inscriptions").getList(1, 1, {filter: pb.filter("status = {:s}", {s}), fields:"id"}).then((r) => r.totalItems))),
    ]);
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Inscripciones a certificaciones ISSA</span><h1>Ventas</h1></div>
        <div class="actions"><button class="btn btn-ghost" id="sCsv">Exportar CSV</button></div></div>
      <div class="kpis stagger sales-kpis">
        ${kpi("Nuevas", counts[0], "🆕", "esperan que un asesor las contacte")}
        ${kpi("Por validar", counts[1], "🧾", "comprobantes para revisar")}
        ${kpi("Falta acceso", counts[2], "📨", "pagadas sin acceso enviado")}
      </div>
      <div class="toolbar">
        <div class="seg" id="sSeg">${SALES_SEGS.map(([k, l]) => `<button data-f="${k}" class="${salesState.status === k ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      <div class="toolbar">
        <input class="input" id="sQ" type="search" placeholder="Buscar por nombre, correo, folio o teléfono" value="${esc(salesState.q)}">
        <select class="input mini-sel" id="sProg"><option value="">Todas las certificaciones</option>${progs.map((p) => `<option value="${p.id}"${salesState.program === p.id ? " selected" : ""}>${esc(p.title)}</option>`).join("")}</select>
        <label class="check"><input type="checkbox" id="sMine"${salesState.mine ? " checked" : ""}> Solo las mías</label>
      </div>
      ${res.items.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Alumno</th><th>Certificación</th><th>Precio</th><th>Estado</th><th>Asesor</th><th>Fecha</th><th></th></tr></thead>
        <tbody class="stagger">${res.items.map((i) => { const st = INS[i.status] || ["", ""]; return `<tr data-id="${i.id}" class="click-row">
          <td><b>${esc(i.name)}</b><span class="sub">${esc(i.email)} · <span class="mono">${esc(i.code)}</span></span></td>
          <td>${esc(i.programTitle)}</td>
          <td class="num">${i.price ? money(i.price, i.currency) : "—"}${i.saleApplied ? ` <span class="badge hot">-${i.discount}%</span>` : ""}</td>
          <td><span class="badge ${st[1]}">${esc(st[0])}</span></td>
          <td>${i.agent ? esc(teamName(i.agent)) : '<span class="muted">Sin asignar</span>'}</td>
          <td><span class="sub" style="color:var(--fg)">${fmtDateTime(i.created)}</span></td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-open>Abrir</button></div></td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="table-wrap"><div class="empty-row">No hay inscripciones${salesState.q || salesState.program ? " con ese filtro" : " en este estado"}.</div></div>`}
      ${pager(res)}`;
    stagger(view);
    view.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
    segPill($("sSeg"));
    $("sSeg").onclick = (e) => {
      const f = e.target.dataset.f;
      if(!f) return;
      salesState.status = f; salesState.page = 1;
      $("sSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      segPill($("sSeg"));
      setTimeout(renderVentas, 220);
    };
    searchInput("sQ", (v) => { salesState.q = v; salesState.page = 1; return renderVentas(); });
    $("sProg").onchange = (e) => { salesState.program = e.target.value; salesState.page = 1; renderVentas(); };
    $("sMine").onchange = (e) => { salesState.mine = e.target.checked; salesState.page = 1; renderVentas(); };
    bindPager(salesState, renderVentas);
    const byId = new Map(res.items.map((i) => [i.id, i]));
    view.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = () => inscriptionModal(byId.get(tr.dataset.id)));
    $("sCsv").onclick = async () => {
      const rows = await pb.collection("inscriptions").getFullList({sort:"-created", filter: salesFilter(), batch:500});
      downloadCsv("inscripciones-innovafit.csv",
        ["fecha", "folio", "estado", "certificacion", "nombre", "correo", "codigo_pais", "telefono", "ciudad", "identificacion", "experiencia", "forma_pago", "horario", "precio_lista", "descuento", "precio", "moneda", "pagado", "correo_acceso", "asesor", "notas"],
        rows.map((i) => [i.created, i.code, (INS[i.status] || [i.status])[0], i.programTitle, i.name, i.email, i.country, i.phone, i.city, i.docId, i.experience, i.payPlan, i.contactTime, i.listPrice, i.discount, i.price, i.currency, i.paidAmount, i.accessEmail, teamName(i.agent), i.notes]));
    };
  }

  async function inscriptionModal(i){
    const team = await getTeam();
    const st = INS[i.status] || ["", ""];
    const me = pb.authStore.record;
    const receiptUrl = i.receipt ? pb.files.getURL(i, i.receipt, {token: await pb.files.getToken()}) : "";
    const isPdf = /\.pdf$/i.test(i.receipt || "");
    const wa = waLink(i.country, i.phone, "Hola " + (i.name || "").split(" ")[0] + "! Soy " + (me.name || "del equipo") + " de InnovaFit 👋 Te escribo por tu inscripción en " + i.programTitle + " (folio " + i.code + ").");
    const row = (k, v) => v ? `<div><span>${k}</span><b>${v}</b></div>` : "";
    const steps = [["Inscripción", i.created], ["Comprobante", i.receiptAt], ["Validación", i.reviewedAt], ["Acceso enviado", i.accessSentAt]];
    openModal(`<span class="eyebrow">Folio ${esc(i.code)} · ${fmtDateTime(i.created)}</span>
      <div class="ins-head"><h2>${esc(i.name)}</h2><span class="badge ${st[1]}">${esc(st[0])}</span></div>
      <div class="ins-grid">
        <div>
          <div class="cred ins-data">
            ${row("Certificación", esc(i.programTitle))}
            ${row("Precio", (i.price ? esc(money(i.price, i.currency)) : "Sin precio") + (i.saleApplied ? ` · InnovaSale -${i.discount}% (lista ${esc(money(i.listPrice))})` : "") + (i.usedSlot ? " · usó cupo" : ""))}
            ${row("Correo", esc(i.email))}
            ${row("WhatsApp", "+" + esc(i.country) + " " + esc(i.phone))}
            ${row("Ciudad", esc(i.city))}
            ${row("Identificación", esc(i.docId))}
            ${row("Perfil", esc(i.experience))}
            ${row("Forma de pago", esc(i.payPlan))}
            ${row("Contactar", esc(i.contactTime))}
            ${row("Mensaje", esc(i.message))}
          </div>
          <ol class="ins-tl">${steps.map(([l, d]) => `<li class="${d ? "done" : ""}"><b>${l}</b><span>${d ? fmtDateTime(d) : "—"}</span></li>`).join("")}</ol>
        </div>
        <div>
          <div class="card receipt-box">
            <h3>Comprobante</h3>
            ${i.receipt ? `${isPdf ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${receiptUrl}">Abrir PDF del comprobante ↗</a>` : `<a target="_blank" rel="noopener" href="${receiptUrl}"><img src="${receiptUrl}" alt="Comprobante de pago"></a>`}
              <div class="cred ins-data">${row("Enviado", fmtDateTime(i.receiptAt))}${row("Monto declarado", esc(money(i.declaredAmount, i.currency)))}${row("Referencia", esc(i.payRef))}${row("Correo para el acceso", esc(i.accessEmail))}</div>`
              : `<p class="muted" style="margin:0">El alumno todavía no subió el comprobante.${i.accessEmail ? " Correo para el acceso: <b>" + esc(i.accessEmail) + "</b>" : ""}</p>`}
            ${i.rejectReason && i.status === "rechazado" ? `<p class="error-msg" style="margin-top:10px">Motivo del rechazo: ${esc(i.rejectReason)}</p>` : ""}
            ${PAID.includes(i.status) ? `<p class="hint" style="margin:10px 0 0">Validó ${esc(teamName(i.reviewedBy) || "—")} · cobrado ${esc(money(i.paidAmount, i.currency))}</p>` : ""}
          </div>
          <label class="field" style="margin-top:14px"><span>Asesor a cargo</span><select class="input" id="iAgent"><option value="">Sin asignar</option>${team.map((u) => `<option value="${u.id}"${i.agent === u.id ? " selected" : ""}>${esc(u.name || u.email)}${u.id === me.id ? " (yo)" : ""}</option>`).join("")}</select></label>
          <label class="field"><span>Notas internas del equipo</span><textarea class="input" id="iNotes" rows="3" maxlength="3000">${esc(i.notes || "")}</textarea></label>
        </div>
      </div>
      <div class="ins-actions">
        <a class="btn btn-ghost" target="_blank" rel="noopener" href="${wa}">WhatsApp</a>
        ${i.status === "nuevo" ? `<button class="btn btn-ghost" data-act="contactado">Marcar en contacto</button>` : ""}
        ${i.status === "por_validar" ? `<button class="btn btn-danger" data-act="rechazar">Rechazar comprobante</button><button class="btn btn-primary" data-act="validar">Validar pago</button>` : ""}
        ${["nuevo", "contactado", "rechazado"].includes(i.status) ? `<button class="btn btn-ghost" data-act="validar">Registrar pago sin comprobante</button>` : ""}
        ${i.status === "pagado" ? `<button class="btn btn-primary" data-act="acceso">Marcar acceso enviado</button>` : ""}
        ${i.status !== "cancelado" && i.status !== "acceso" ? `<button class="btn btn-ghost ins-cancel" data-act="cancelar">Cancelar inscripción</button>` : ""}
        <button class="btn btn-primary" id="iSave">Guardar</button>
      </div>`, (m) => {
      const save = async (patch, msg) => {
        try{
          await pb.collection("inscriptions").update(i.id, {agent: m.querySelector("#iAgent").value, notes: m.querySelector("#iNotes").value.trim(), ...patch});
          closeModal();
          ok("¡Guardado con éxito!", msg);
          refreshBadges();
          route(true);
        }catch(err){ fail(err); }
      };
      m.querySelector("#iSave").onclick = () => save({}, "La inscripción quedó actualizada.");
      m.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
        const a = b.dataset.act;
        const mine = m.querySelector("#iAgent").value || me.id;
        if(a === "contactado") return save({status:"contactado", agent: mine}, "Quedó en contacto contigo como asesor.");
        if(a === "acceso") return save({status:"acceso", accessSentAt: nowPb()}, "El alumno ve en su panel que el acceso fue enviado a " + (i.accessEmail || i.email) + ".");
        if(a === "cancelar"){
          if(!(await confirmBox("Cancelar inscripción", "Se cancela la inscripción de " + i.name + (i.usedSlot ? " y se devuelve su cupo de oferta" : "") + ".", "Cancelar inscripción"))) return;
          try{ await api("/api/inscriptions/" + i.id + "/cancel", {}); ok("Inscripción cancelada"); refreshBadges(); route(true); }catch(err){ fail(err.message); }
          return;
        }
        if(a === "rechazar"){
          const why = await promptBox("Rechazar comprobante", "El alumno ve este motivo y puede subir otro comprobante.", "Ej: el monto no coincide con el precio acordado", "Rechazar");
          if(why === null) return;
          return save({status:"rechazado", rejectReason: why || "No pudimos validar el comprobante.", reviewedBy: me.id, reviewedAt: nowPb()}, "El alumno ya ve el motivo en su panel.");
        }
        if(a === "validar"){
          const def = i.declaredAmount || i.price || "";
          const amount = await promptBox("Validar pago", "Monto cobrado (" + (i.currency || "") + "). Queda registrado en Finanzas.", "Monto", "Validar pago", String(def), "number");
          if(amount === null) return;
          return save({status:"pagado", paidAmount: Math.round((parseFloat(amount) || 0) * 100) / 100, reviewedBy: me.id, reviewedAt: nowPb(), agent: mine, rejectReason:""}, "Pago validado. Falta enviar el acceso a " + (i.accessEmail || i.email) + ".");
        }
      });
    }, true);
  }

  // Pregunta un texto (o número). Devuelve null si cancela.
  function promptBox(title, text, placeholder, okLabel, value, type){
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if(!done){ done = true; resolve(v); } };
      openModal(`<h2>${esc(title)}</h2><p class="muted" style="margin:0 0 14px">${esc(text)}</p>
        <input class="input" id="pbIn" type="${type || "text"}" ${type === "number" ? 'step="0.01" min="0"' : 'maxlength="400"'} placeholder="${esc(placeholder || "")}" value="${esc(value || "")}">
        <div class="modal-actions" style="margin-top:16px"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="pbOk">${esc(okLabel || "Aceptar")}</button></div>`, (m) => {
        const inp = m.querySelector("#pbIn");
        m.querySelector("#pbOk").onclick = () => { const v = inp.value.trim(); closeModal(); finish(v); };
        inp.onkeydown = (e) => { if(e.key === "Enter") m.querySelector("#pbOk").click(); };
        m.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => finish(null)));
        document.addEventListener("keydown", function esc2(e){ if(e.key === "Escape"){ document.removeEventListener("keydown", esc2); finish(null); } });
      });
    });
  }

  /* =====================================================
     FINANZAS: prospectos, inscripciones, ventas e ingresos
     ===================================================== */
  const finState = {range:"30"};
  const RANGES = [["7", "7 días"], ["30", "30 días"], ["90", "90 días"], ["365", "12 meses"], ["all", "Todo"]];

  async function renderFinanzas(){
    const [all, progs, s, students] = await Promise.all([
      pb.collection("inscriptions").getFullList({sort:"created", batch:1000, fields:"id,created,status,program,programTitle,price,listPrice,discount,saleApplied,paidAmount,reviewedAt,agent,reviewedBy,payPlan,country,name,email,phone,code,currency"}),
      pb.collection("programs").getFullList({sort:"order,title", fields:"id,title,price,saleSlots,slotsTaken"}),
      UI.settings(true),
      pb.collection("users").getFullList({filter:'role != "admin" && role != "agent"', fields:"id,created", batch:1000}),
      getTeam(),
    ]);
    const cur = (s.saleCurrency || "USD").trim();
    const days = finState.range === "all" ? Infinity : +finState.range;
    const since = days === Infinity ? 0 : Date.now() - days * 86400000;
    const inRange = (d) => d && toDate(d).getTime() >= since;
    const paidAt = (i) => i.reviewedAt || i.created;
    const ins = all.filter((i) => inRange(i.created));
    const sales = all.filter((i) => PAID.includes(i.status) && inRange(paidAt(i)));
    const revenue = sales.reduce((a, i) => a + (+i.paidAmount || +i.price || 0), 0);
    const avg = sales.length ? revenue / sales.length : 0;
    const conv = ins.length ? Math.round((ins.filter((i) => PAID.includes(i.status)).length / ins.length) * 100) : 0;
    const open = all.filter((i) => ["nuevo", "contactado", "rechazado"].includes(i.status));
    const toValidate = all.filter((i) => i.status === "por_validar").length;
    const discountGiven = sales.reduce((a, i) => a + Math.max(0, (+i.listPrice || 0) - (+i.price || 0)), 0);
    const newStudents = students.filter((u) => inRange(u.created)).length;

    // Ingresos por período: días (≤30), semanas (90) o meses.
    const unit = days <= 30 ? "day" : days <= 90 ? "week" : "month";
    const keyOf = (d) => {
      const x = toDate(d);
      if(unit === "day") return dayKey(x);
      if(unit === "week"){ const m = new Date(x); m.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(m); }
      return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0");
    };
    const buckets = [];
    const first = days === Infinity ? (sales[0] ? toDate(paidAt(sales[0])) : new Date()) : new Date(since);
    const cursor = new Date(first); cursor.setHours(0, 0, 0, 0);
    if(unit === "week") cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    if(unit === "month") cursor.setDate(1);
    for(let guard = 0; cursor <= new Date() && guard < 400; guard++){
      buckets.push({key: keyOf(cursor), d: new Date(cursor), v: 0, n: 0});
      if(unit === "day") cursor.setDate(cursor.getDate() + 1);
      else if(unit === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
    const bMap = new Map(buckets.map((b) => [b.key, b]));
    sales.forEach((i) => { const b = bMap.get(keyOf(paidAt(i))); if(b){ b.v += +i.paidAmount || +i.price || 0; b.n++; } });
    const label = (d) => unit === "month" ? d.toLocaleDateString("es-MX", {month:"short", year:"2-digit"}) : String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
    const revData = buckets.map((b) => ({label: label(b.d), value: Math.round(b.v), tip: money(b.v, cur), tipSub: (unit === "week" ? "Semana del " : "") + b.d.toLocaleDateString("es-MX", {day: unit === "month" ? undefined : "numeric", month:"long", year: unit === "month" ? "numeric" : undefined}) + " · " + b.n + (b.n === 1 ? " venta" : " ventas")}));

    // Por certificación
    const byProg = new Map();
    sales.forEach((i) => { const k = i.programTitle || "—"; const v = byProg.get(k) || {n:0, v:0}; v.n++; v.v += +i.paidAmount || +i.price || 0; byProg.set(k, v); });
    const progRows = [...byProg.entries()].sort((a, b) => b[1].n - a[1].n || b[1].v - a[1].v);
    const maxN = Math.max(1, ...progRows.map(([, v]) => v.n));
    const leadsByProg = new Map();
    ins.forEach((i) => leadsByProg.set(i.programTitle, (leadsByProg.get(i.programTitle) || 0) + 1));
    const topLead = [...leadsByProg.entries()].sort((a, b) => b[1] - a[1])[0];

    // Embudo
    const reached = (i, lvl) => ({nuevo:0, contactado:1, rechazado:2, por_validar:2, pagado:3, acceso:4, cancelado:-1}[i.status] ?? 0) >= lvl;
    const funnel = [["Inscripciones", ins.length], ["Contactadas", ins.filter((i) => reached(i, 1)).length], ["Con comprobante", ins.filter((i) => reached(i, 2)).length], ["Pagadas", ins.filter((i) => reached(i, 3)).length], ["Acceso enviado", ins.filter((i) => reached(i, 4)).length]];

    const countBy = (list, f) => { const m = new Map(); list.forEach((x) => { const k = f(x) || "—"; m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const byAgent = countBy(sales, (i) => teamName(i.reviewedBy || i.agent) || "Sin asesor");
    const byPlan = countBy(ins, (i) => i.payPlan);
    const byCountry = countBy(ins, (i) => i.country ? "+" + i.country : "");
    const saleN = sales.filter((i) => i.saleApplied).length;

    const hbars = (rows, fmt, max) => rows.length ? `<div class="hbars">${rows.map(([name, v], k) => `<div class="hbar"><div class="top"><span>${esc(name)}</span><span>${fmt(v)}</span></div><div class="track"><i style="width:${Math.max(2, ((typeof v === "number" ? v : v.n) / (max || Math.max(1, ...rows.map(([, x]) => (typeof x === "number" ? x : x.n))))) * 100)}%;animation-delay:${k * 70}ms"></i></div></div>`).join("")}</div>` : '<p class="muted">Sin datos en este período.</p>';
    const stale = open.filter((i) => Date.now() - toDate(i.created).getTime() > 48 * 3600000 && i.status === "nuevo");

    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Información comercial</span><h1>Finanzas</h1></div>
        <div class="actions"><button class="btn btn-ghost" id="fCsv">Exportar ventas CSV</button></div></div>
      <div class="toolbar"><div class="seg" id="fSeg">${RANGES.map(([k, l]) => `<button data-r="${k}" class="${finState.range === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <span class="muted" style="font-size:13px">Montos en ${esc(cur)} · ventas = pagos validados</span></div>
      <div class="kpis stagger">
        <div class="card kpi spot kpi-money"><div class="k-top"><span class="l">Ingresos</span><span class="ico">💰</span></div><b>${esc(money(Math.round(revenue)))}</b><small>${sales.length} ${sales.length === 1 ? "venta" : "ventas"} validadas</small></div>
        ${kpi("Ventas", sales.length, "🧾", saleN ? saleN + " con InnovaSale" : "pagos validados")}
        <div class="card kpi spot kpi-money"><div class="k-top"><span class="l">Ticket promedio</span><span class="ico">🎯</span></div><b>${esc(money(Math.round(avg)))}</b><small>por venta</small></div>
        ${kpi("Conversión", conv, "📈", "inscripciones que pagaron", "%")}
        ${kpi("Inscripciones", ins.length, "📝", "en el período")}
        ${kpi("Prospectos activos", open.length, "🔥", stale.length ? `<span style="color:var(--bad);font-weight:700">${stale.length} sin contactar hace +48 h</span>` : "esperando pago")}
        ${kpi("Por validar", toValidate, "⏳", "comprobantes pendientes")}
        ${kpi("Alumnos nuevos", newStudents, "👥", "registrados en el campus")}
      </div>
      <div class="charts">
        <div class="card chart-card spot"><h3>Ingresos por ${unit === "day" ? "día" : unit === "week" ? "semana" : "mes"}</h3><p class="sub">Pagos validados · pasá el cursor por cada barra</p><div id="chRev"></div></div>
        <div class="card chart-card spot"><h3>Más vendida</h3><p class="sub">Ventas por certificación en el período</p>
          ${progRows.length ? `<div class="top-sale"><span class="eyebrow">🏆 N.º 1</span><b>${esc(progRows[0][0])}</b><small>${progRows[0][1].n} ${progRows[0][1].n === 1 ? "venta" : "ventas"} · ${esc(money(Math.round(progRows[0][1].v), cur))}</small></div>` : ""}
          ${hbars(progRows, (v) => v.n + " · " + money(Math.round(v.v)), maxN)}
          ${topLead ? `<p class="hint" style="margin:14px 0 0">Más pedida (inscripciones): <b style="color:var(--fg)">${esc(topLead[0])}</b> con ${topLead[1]}.</p>` : ""}
        </div>
      </div>
      <div class="charts b">
        <div class="card chart-card spot"><h3>Embudo de venta</h3><p class="sub">Inscripciones del período y hasta dónde llegaron</p>
          ${hbars(funnel.map(([n, v]) => [n, v]), (v) => v + (funnel[0][1] ? " · " + Math.round((v / funnel[0][1]) * 100) + "%" : ""), Math.max(1, funnel[0][1]))}</div>
        <div class="card chart-card spot"><h3>Ventas por asesor</h3><p class="sub">Quién validó cada venta</p>${hbars(byAgent, (v) => v)}</div>
      </div>
      <div class="charts b">
        <div class="card chart-card spot"><h3>Forma de pago preferida</h3><p class="sub">Lo que eligieron al inscribirse</p>${hbars(byPlan, (v) => v)}</div>
        <div class="card chart-card spot"><h3>Países</h3><p class="sub">Código de país del WhatsApp</p>${hbars(byCountry.slice(0, 8), (v) => v)}</div>
      </div>
      ${progs.some((p) => p.slotsTaken) ? `<div class="card chart-card spot" style="margin-bottom:16px"><h3>Cupos de InnovaSale</h3><p class="sub">Cupos con descuento ocupados por certificación</p>
        ${hbars(progs.filter((p) => p.slotsTaken).map((p) => [p.title, p.slotsTaken]), (v) => v + " ocupados")}</div>` : ""}
      <div class="head" style="margin:26px 0 12px"><h2 style="font-size:28px">Prospectos para seguir</h2><a class="btn btn-ghost btn-sm" href="#/ventas">Ir a Ventas →</a></div>
      ${open.length ? `<div class="table-wrap"><table><thead><tr><th>Prospecto</th><th>Certificación</th><th>Estado</th><th>Inscripción</th><th></th></tr></thead><tbody>
        ${open.slice().reverse().slice(0, 12).map((i) => `<tr><td><b>${esc(i.name)}</b><span class="sub">${esc(i.email)}</span></td><td>${esc(i.programTitle)}</td><td><span class="badge ${(INS[i.status] || ["", ""])[1]}">${esc((INS[i.status] || [i.status])[0])}</span></td><td><span class="sub" style="color:var(--fg)">${fmtDateTime(i.created)}</span></td>
          <td><div class="row-actions"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(i.country, i.phone, "Hola " + (i.name || "").split(" ")[0] + "! Te escribo de InnovaFit por tu inscripción en " + i.programTitle + " (folio " + i.code + ").")}">WhatsApp</a></div></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="table-wrap"><div class="empty-row">No hay prospectos activos.</div></div>`}`;
    stagger(view);
    view.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));
    barChart($("chRev"), revData, {label:"Ingresos por período"});
    segPill($("fSeg"));
    $("fSeg").onclick = (e) => {
      const r = e.target.dataset.r;
      if(!r) return;
      finState.range = r;
      $("fSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      segPill($("fSeg"));
      setTimeout(renderFinanzas, 220);
    };
    $("fCsv").onclick = () => downloadCsv("ventas-innovafit.csv",
      ["fecha_pago", "folio", "certificacion", "nombre", "correo", "precio_lista", "descuento", "precio", "cobrado", "moneda", "asesor"],
      sales.map((i) => [paidAt(i), i.code, i.programTitle, i.name, i.email, i.listPrice, i.discount, i.price, i.paidAmount, i.currency, teamName(i.reviewedBy || i.agent)]));
  }

  /* =====================================================
     SOPORTE: tickets de los alumnos
     ===================================================== */
  const supState = {filter:"pending", q:""};
  const TK = {abierto:["Abierto", "hot"], respondido:["Respondido", "good"], cerrado:["Cerrado", ""]};

  async function renderSoporteAdmin(){
    await getTeam();
    const parts = [];
    if(supState.filter === "pending") parts.push('(status = "abierto" || unreadTeam = true)');
    if(supState.filter === "respondido") parts.push('status = "respondido"');
    if(supState.filter === "cerrado") parts.push('status = "cerrado"');
    if(supState.filter === "mine") parts.push(pb.filter("assignee = {:u}", {u: pb.authStore.record.id}));
    if(supState.q) parts.push(pb.filter("(subject ~ {:q} || user.name ~ {:q} || user.email ~ {:q})", {q: supState.q}));
    const list = await pb.collection("tickets").getList(1, 60, {sort:"-unreadTeam,-lastAt", filter: parts.join(" && "), expand:"user"});
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Consultas de los alumnos</span><h1>Soporte</h1></div></div>
      <div class="toolbar">
        <div class="seg" id="tSeg">${[["pending", "Pendientes"], ["mine", "Asignados a mí"], ["respondido", "Respondidos"], ["cerrado", "Cerrados"], ["all", "Todos"]].map(([k, l]) => `<button data-f="${k}" class="${supState.filter === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <input class="input" id="tQ" type="search" placeholder="Buscar por asunto o alumno" value="${esc(supState.q)}">
      </div>
      ${list.items.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Consulta</th><th>Alumno</th><th>Estado</th><th>Asignado</th><th>Última actividad</th></tr></thead>
        <tbody class="stagger">${list.items.map((t) => { const u = t.expand && t.expand.user; const st = TK[t.status] || TK.abierto; return `<tr class="click-row" data-id="${t.id}">
          <td style="width:20px">${t.unreadTeam ? '<span class="tk-new" title="Mensaje sin atender"></span>' : ""}</td>
          <td><b>${esc(t.subject)}</b><span class="sub">${esc(t.category || "Consulta")} · #${esc(t.id.slice(0, 6).toUpperCase())}</span></td>
          <td>${u ? `<div class="who-cell">${avatarHtml(u)}<div><b>${esc(u.name || "—")}</b><span class="sub">${esc(u.email)}</span></div></div>` : "—"}</td>
          <td><span class="badge ${st[1]}">${st[0]}</span></td>
          <td>${t.assignee ? esc(teamName(t.assignee)) : '<span class="muted">—</span>'}</td>
          <td><span class="sub" style="color:var(--fg)">${fmtDateTime(t.lastAt || t.created)}</span></td></tr>`; }).join("")}</tbody></table></div>`
        : `<div class="table-wrap"><div class="empty-row">No hay consultas ${supState.filter === "pending" ? "pendientes 🎉" : "en esta vista"}.</div></div>`}`;
    stagger(view);
    segPill($("tSeg"));
    $("tSeg").onclick = (e) => {
      const f = e.target.dataset.f;
      if(!f) return;
      supState.filter = f;
      $("tSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      segPill($("tSeg"));
      setTimeout(renderSoporteAdmin, 220);
    };
    searchInput("tQ", (v) => { supState.q = v; return renderSoporteAdmin(); });
    view.querySelectorAll("tr[data-id]").forEach((tr) => tr.onclick = () => { location.hash = "#/soporte/" + tr.dataset.id; });
  }

  let ticketTimer = 0;
  async function renderTicketAdmin(id){
    await getTeam();
    const me = pb.authStore.record;
    let t = await pb.collection("tickets").getOne(id, {expand:"user"});
    const u = t.expand && t.expand.user;
    const paint = async () => {
      const msgs = await pb.collection("ticket_messages").getFullList({filter: pb.filter("ticket = {:t}", {t: id}), sort:"created"});
      const token = msgs.some((x) => x.file) ? await pb.files.getToken() : "";
      const box = $("thread");
      if(!box) return;
      const grew = box.dataset.n !== String(msgs.length);
      box.dataset.n = msgs.length;
      box.innerHTML = msgs.map((x) => `<div class="msg ${x.fromTeam ? "me" : "team"}">
        <div class="msg-h"><b>${esc(x.fromTeam ? x.authorName || "Equipo" : (u && u.name) || "Alumno")}</b>${x.fromTeam ? '<span class="badge hot">Equipo</span>' : ""}<small>${fmtDateTime(x.created)}</small></div>
        <div class="msg-b">${esc(x.body).replace(/\n/g, "<br>")}</div>
        ${x.file ? `<a class="msg-file" target="_blank" rel="noopener" href="${pb.files.getURL(x, x.file, {token})}">📎 Ver adjunto</a>` : ""}</div>`).join("");
      $("tkState").innerHTML = `<span class="badge ${(TK[t.status] || TK.abierto)[1]}">${(TK[t.status] || TK.abierto)[0]}</span>`;
      $("tkClose").textContent = t.status === "cerrado" ? "Reabrir" : "Cerrar consulta";
      if(grew) box.lastElementChild?.scrollIntoView({block:"nearest"});
    };
    view.innerHTML = `
      <a class="eyebrow" href="#/soporte" style="text-decoration:none">← Soporte</a>
      <div class="head" style="margin-top:8px"><div><span class="eyebrow">${esc(t.category || "Consulta")} · #${esc(t.id.slice(0, 6).toUpperCase())} · abierta ${fmtDateTime(t.created)}</span><h1 style="font-size:clamp(28px,4vw,44px)">${esc(t.subject)}</h1></div><div id="tkState"></div></div>
      <div class="tk-admin">
        <div>
          <div class="card thread" id="thread"></div>
          <form class="card reply" id="rpForm" novalidate>
            <textarea class="input" name="body" rows="4" maxlength="5000" placeholder="Respondé como ${esc(me.name || me.email)}…"></textarea>
            <div class="reply-a"><label class="btn btn-ghost btn-sm attach">📎 Adjuntar<input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden></label><span class="muted" id="rpFile"></span>
              <button class="btn btn-primary btn-sm" id="rpSend">Enviar respuesta</button></div>
          </form>
        </div>
        <aside class="card panel tk-side">
          ${u ? `<div class="who-cell" style="margin-bottom:14px">${avatarHtml(u)}<div><b>${esc(u.name || "—")}</b><span class="sub">${esc(u.email)}</span></div></div>
            ${u.phone ? `<a class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:10px" target="_blank" rel="noopener" href="${waLink(u.country, u.phone, "Hola " + (u.name || "").split(" ")[0] + "! Te escribo de InnovaFit por tu consulta: " + t.subject)}">WhatsApp</a>` : ""}` : ""}
          <label class="field"><span>Asignado a</span><select class="input" id="tkAs"><option value="">Sin asignar</option>${teamCache.map((x) => `<option value="${x.id}"${t.assignee === x.id ? " selected" : ""}>${esc(x.name || x.email)}${x.id === me.id ? " (yo)" : ""}</option>`).join("")}</select></label>
          <button class="btn btn-ghost btn-sm" id="tkClose" style="width:100%"></button>
        </aside>
      </div>`;
    const f = $("rpForm");
    f.file.onchange = () => { $("rpFile").textContent = f.file.files[0] ? f.file.files[0].name : ""; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = f.body.value.trim(), file = f.file.files[0];
      if(!body) return;
      if(file && file.size > 10 * 1024 * 1024) return fail("El archivo pesa más de 10 MB.");
      $("rpSend").disabled = true;
      try{
        const fd = new FormData();
        fd.set("ticket", id); fd.set("author", me.id); fd.set("authorName", me.name || me.email); fd.set("fromTeam", "true"); fd.set("body", body);
        if(file) fd.set("file", file);
        await pb.collection("ticket_messages").create(fd);
        t = await pb.collection("tickets").update(id, {status:"respondido", unreadUser:true, unreadTeam:false, lastAt: nowPb(), assignee: $("tkAs").value || me.id}, {expand:"user"});
        $("tkAs").value = t.assignee;
        f.reset(); $("rpFile").textContent = "";
        ok("¡Respuesta enviada!", "El alumno la ve en Soporte con un aviso.");
        refreshBadges();
        await paint();
      }catch(err){ fail(err); }
      finally{ $("rpSend").disabled = false; }
    };
    $("tkAs").onchange = async (e) => { try{ t = await pb.collection("tickets").update(id, {assignee: e.target.value}); ok("¡Asignado!", e.target.value ? teamName(e.target.value) + " sigue esta consulta." : "La consulta quedó sin asignar."); }catch(err){ fail(err); } };
    $("tkClose").onclick = async () => {
      try{ t = await pb.collection("tickets").update(id, {status: t.status === "cerrado" ? "abierto" : "cerrado", unreadTeam:false}); refreshBadges(); paint(); }
      catch(err){ fail(err); }
    };
    await paint();
    if(t.unreadTeam){ t = await pb.collection("tickets").update(id, {unreadTeam:false}).catch(() => t); refreshBadges(); }
    clearInterval(ticketTimer);
    ticketTimer = setInterval(async () => {
      if(!location.hash.startsWith("#/soporte/" + id)) return clearInterval(ticketTimer);
      try{ const fresh = await pb.collection("tickets").getOne(id); if(fresh.updated !== t.updated){ t = fresh; await paint(); } }catch{}
    }, 15000);
  }

  // Avisos en el menú: comprobantes por validar, inscripciones nuevas y consultas sin atender.
  async function refreshBadges(){
    try{
      const [nuevas, validar, tickets] = await Promise.all([
        pb.collection("inscriptions").getList(1, 1, {filter:'status = "nuevo"', fields:"id"}),
        pb.collection("inscriptions").getList(1, 1, {filter:'status = "por_validar"', fields:"id"}),
        pb.collection("tickets").getList(1, 1, {filter:"unreadTeam = true", fields:"id"}),
      ]);
      const set = (nav, n) => {
        const a = document.querySelector(`.rail a[data-nav="${nav}"]`);
        if(!a) return;
        let b = a.querySelector(".rail-badge");
        if(!n){ b?.remove(); return; }
        if(!b){ b = document.createElement("b"); b.className = "rail-badge"; a.appendChild(b); }
        b.textContent = n > 99 ? "99+" : n;
      };
      set("ventas", nuevas.totalItems + validar.totalItems);
      set("soporte", tickets.totalItems);
    }catch{}
  }

  /* =====================================================
     MANUAL DEL EQUIPO (solo admin y asesores)
     ===================================================== */
  let manualQ = "";
  async function renderManual(id){
    const list = await pb.collection("manuals").getFullList({sort:"order,created"});
    const q = manualQ.toLowerCase();
    const text = (m) => (m.title + " " + m.section + " " + m.summary + " " + (m.body || "").replace(/<[^>]+>/g, " ")).toLowerCase();
    const shown = q ? list.filter((m) => text(m).includes(q)) : list;
    const cur = list.find((m) => m.id === id) || shown[0] || null;
    const groups = [];
    shown.forEach((m) => { const g = groups.find((x) => x.name === (m.section || "General")); g ? g.items.push(m) : groups.push({name: m.section || "General", items:[m]}); });
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Solo para el equipo InnovaFit</span><h1>Manual del campus</h1></div>
        <div class="actions">${isAdmin() ? '<button class="btn btn-ghost" id="mNew">+ Nuevo capítulo</button>' : ""}<button class="btn btn-primary" id="mAll">Descargar manual completo (PDF)</button></div></div>
      <div class="manual">
        <aside class="card manual-toc">
          <input class="input" id="mQ" type="search" placeholder="Buscar en el manual" value="${esc(manualQ)}">
          ${groups.map((g) => `<div class="mt-g"><span class="eyebrow">${esc(g.name)}</span>${g.items.map((m) => `<a href="#/manual/${m.id}" class="${cur && cur.id === m.id ? "on" : ""}">${esc(m.title)}</a>`).join("")}</div>`).join("") || '<p class="muted" style="font-size:13px">Sin resultados.</p>'}
        </aside>
        <article class="card manual-doc">${cur ? `<span class="eyebrow">${esc(cur.section || "General")}</span><h2>${esc(cur.title)}</h2>${cur.summary ? `<p class="manual-sum">${esc(cur.summary)}</p>` : ""}
          <div class="rich manual-body">${cur.body || ""}</div>
          <div class="manual-foot"><button class="btn btn-ghost btn-sm" id="mOne">Descargar este capítulo (PDF)</button>${isAdmin() ? '<button class="btn btn-ghost btn-sm" id="mEdit">Editar</button><button class="btn btn-danger btn-sm" id="mDel">Eliminar</button>' : ""}</div>`
          : `<h2>Todavía no hay capítulos</h2><p class="muted">${isAdmin() ? "Creá el primero con “+ Nuevo capítulo”." : "El administrador todavía no cargó el manual."}</p>`}</article>
      </div>`;
    stagger(view);
    const mq = $("mQ");
    let tq;
    mq.oninput = () => { clearTimeout(tq); tq = setTimeout(() => { manualQ = mq.value.trim(); renderManual(id).then(() => { const x = $("mQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }); }, 250); };
    $("mAll").onclick = () => printManual(list, "Manual del campus InnovaFit");
    $("mOne")?.addEventListener("click", () => printManual([cur], cur.title));
    $("mNew")?.addEventListener("click", () => manualModal(null, list.length + 1));
    $("mEdit")?.addEventListener("click", () => manualModal(cur));
    $("mDel")?.addEventListener("click", async () => {
      if(!(await confirmBox("Eliminar capítulo", "Se borra \"" + cur.title + "\" del manual."))) return;
      try{ await pb.collection("manuals").delete(cur.id); ok("¡Eliminado!"); location.hash = "#/manual"; }catch(err){ fail(err); }
    });
  }

  function manualModal(m, nextOrder){
    const x = m || {title:"", section:"", summary:"", body:"", order: nextOrder};
    openModal(`<span class="eyebrow">Manual</span><h2 style="margin-top:8px">${m ? "Editar capítulo" : "Nuevo capítulo"}</h2>
      <form id="mForm" novalidate>
        <div class="two"><label class="field"><span>Título</span><input class="input" name="title" value="${esc(x.title)}"></label>
          <label class="field"><span>Sección</span><input class="input" name="section" value="${esc(x.section)}" placeholder="Ej: Ventas"></label></div>
        <div class="two"><label class="field"><span>Resumen</span><input class="input" name="summary" maxlength="400" value="${esc(x.summary)}"></label>
          <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(x.order || 0)}"></label></div>
        <label class="field"><span>Contenido</span><textarea class="input mono" name="body" rows="16">${esc(fromHtml(x.body))}</textarea></label>
        <p class="hint">Texto simple: dejá una línea vacía entre párrafos. También acepta HTML (&lt;h3&gt;, &lt;ol&gt;, &lt;b&gt;…).</p>
        <p class="error-msg" id="mErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary">${m ? "Guardar" : "Crear"}</button></div>
      </form>`, (md) => {
      const f = md.querySelector("#mForm");
      f.onsubmit = async (e) => {
        e.preventDefault();
        if(!f.title.value.trim()) return void (md.querySelector("#mErr").textContent = "Falta el título.");
        const data = {title: f.title.value.trim(), section: f.section.value.trim(), summary: f.summary.value.trim(), order: +f.order.value || 0, body: toHtml(f.body.value)};
        try{
          const r = m ? await pb.collection("manuals").update(m.id, data) : await pb.collection("manuals").create(data);
          closeModal();
          ok("¡Guardado con éxito!", "El equipo ya ve el capítulo actualizado.");
          if(location.hash === "#/manual/" + r.id) renderManual(r.id); else location.hash = "#/manual/" + r.id;
        }catch(err){ md.querySelector("#mErr").textContent = errMsg(err); }
      };
    }, true);
  }

  // Versión imprimible del manual: el navegador la guarda como PDF ("Guardar como PDF").
  function printManual(items, title){
    const w = window.open("", "_blank");
    if(!w) return fail("El navegador bloqueó la ventana. Permití ventanas emergentes para descargar el manual.");
    const date = new Date().toLocaleDateString("es-MX", {day:"numeric", month:"long", year:"numeric"});
    const cover = items.length > 1;
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        @page{size:A4;margin:18mm 16mm}
        body{font-family:Manrope,Segoe UI,Arial,sans-serif;color:#1b1814;font-size:11.5pt;line-height:1.55;margin:0}
        h1{font-size:30pt;margin:0 0 6pt;letter-spacing:-.01em}
        h2{font-size:18pt;margin:0 0 4pt;color:#111}
        h3{font-size:13pt;margin:16pt 0 4pt}
        .k{font:700 8pt/1 monospace;letter-spacing:.14em;text-transform:uppercase;color:#e2541b}
        .cover{height:250mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always;border-left:6px solid #ff7a1f;padding-left:18mm}
        .cover img{height:34px;margin-bottom:28pt}
        .cover p{color:#6b625a;font-size:12pt}
        .toc{page-break-after:always}
        .toc li{margin:4pt 0}
        .ch{page-break-before:always}
        .ch:first-of-type{page-break-before:auto}
        .sum{color:#6b625a;font-size:12pt;margin:0 0 12pt;padding-bottom:10pt;border-bottom:2px solid #ffc93c}
        ol,ul{padding-left:18pt}
        li{margin:3pt 0}
        table{border-collapse:collapse;width:100%;margin:8pt 0}
        td,th{border:1px solid #ddd;padding:5pt 7pt;text-align:left;font-size:10pt}
        .foot{position:fixed;bottom:0;left:0;right:0;font-size:8pt;color:#9a9086;text-align:center}
      </style></head><body>
      ${cover ? `<section class="cover"><img src="${location.origin}/assets/innovafit-logo-dark.png" onerror="this.remove()" alt=""><span class="k">Uso interno · equipo InnovaFit</span><h1>${esc(title)}</h1><p>Funciones del campus, del panel y procedimientos del equipo.<br>Versión del ${date}.</p></section>
        <section class="toc"><span class="k">Contenido</span><ol>${items.map((m) => `<li><b>${esc(m.title)}</b> <span style="color:#9a9086">· ${esc(m.section || "")}</span></li>`).join("")}</ol></section>` : ""}
      ${items.map((m) => `<section class="ch"><span class="k">${esc(m.section || "")}</span><h2>${esc(m.title)}</h2>${m.summary ? `<p class="sum">${esc(m.summary)}</p>` : ""}${m.body || ""}</section>`).join("")}
      <div class="foot">InnovaFit · ${esc(title)} · ${date} · Confidencial</div>
      <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
    w.document.close();
  }

  /* ---------- Router ---------- */
  // Los asesores solo ven ventas, soporte y el manual.
  const AGENT_SECTIONS = ["ventas", "soporte", "manual"];
  async function route(keepModal){
    let [, section = isAdmin() ? "resumen" : "ventas", id] = (location.hash.match(/^#\/([^/]+)(?:\/([^/]+))?/) || []);
    if(!isAdmin() && !AGENT_SECTIONS.includes(section)) section = "ventas";
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === section));
    moveRailIndicator();
    if(!keepModal) refreshBadges();
    try{
      if(section === "ventas") await renderVentas();
      else if(section === "finanzas") await renderFinanzas();
      else if(section === "soporte" && id) await renderTicketAdmin(id);
      else if(section === "soporte") await renderSoporteAdmin();
      else if(section === "manual") await renderManual(id);
      else if(!isAdmin()) await renderVentas();
      else if(section === "evaluaciones") await renderEvaluaciones();
      else if(section === "alumnos") await renderAlumnos();
      else if(section === "cursos" && id) await renderCurso(id);
      else if(section === "cursos") await renderCursos();
      else if(section === "certificados"){
        await renderCertificados();
        if(id === "nuevo" && !keepModal){ history.replaceState(null, "", "#/certificados"); issueModal({}); }
      }
      else if(section === "certificaciones") await renderCertificaciones();
      else if(section === "seguimiento") await renderSeguimiento();
      else if(section === "ajustes") await renderAjustes();
      else if(section === "web") await renderWeb();
      else await renderResumen();
      view.classList.remove("view-in"); void view.offsetWidth; view.classList.add("view-in");
    }catch(err){
      if(err.status === 401 || err.status === 403){ pb.authStore.clear(); showLogin("Tu sesión expiró. Entrá de nuevo."); return; }
      view.innerHTML = `<div class="card" style="padding:40px;text-align:center"><h2 style="font-size:28px;margin-bottom:10px">No se pudo cargar</h2><p class="muted">${esc(errMsg(err))}</p><button class="btn btn-ghost" onclick="location.reload()">Reintentar</button></div>`;
    }
  }
  window.addEventListener("hashchange", () => { if(pb.authStore.isValid){ closeModal(); route(); } });
  window.addEventListener("resize", moveRailIndicator);

  async function boot(){
    if(!pb.authStore.isValid){ showLogin(); return; }
    try{ await pb.collection("users").authRefresh(); }
    catch{ pb.authStore.clear(); showLogin(); return; }
    const me = pb.authStore.record;
    if(me.role !== "admin" && me.role !== "agent"){ pb.authStore.clear(); showLogin("Esta cuenta no es del equipo InnovaFit."); return; }
    $("loginView").hidden = true;
    $("appView").hidden = false;
    document.querySelectorAll(".rail a[data-nav]").forEach((a) => (a.hidden = me.role !== "admin" && !AGENT_SECTIONS.includes(a.dataset.nav)));
    document.querySelector(".rail .tag").textContent = me.role === "admin" ? "Admin" : "Equipo";
    $("me").textContent = me.email;
    $("meName").textContent = me.name || "Admin";
    $("meAv").outerHTML = avatarHtml(me);
    UI.settings(); // sello del certificado
    view.innerHTML = `<div style="min-height:50vh;display:grid;place-items:center"><div class="spinner"></div></div>`;
    route();
  }

  boot();
})();
