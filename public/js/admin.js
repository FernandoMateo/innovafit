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
      if(res.record.role !== "admin"){
        pb.authStore.clear();
        $("lErr").textContent = "Esta cuenta no tiene permisos de administrador.";
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
    const [attempts, students, courses, certs, recent] = await Promise.all([
      pb.collection("attempts").getFullList({fields:"created,score,passed,sections", batch:1000}),
      pb.collection("users").getList(1, 1, {filter:'role != "admin"', fields:"id"}),
      getCourses(true),
      pb.collection("certificates").getList(1, 1, {fields:"id"}),
      pb.collection("attempts").getList(1, 6, {sort:"-created"}),
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
        ${kpi("Alumnos", students.totalItems, "👥", "con acceso al campus")}
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
          <td>${u.role === "admin" ? '<span class="badge hot">Admin</span>' : '<span class="badge">Alumno</span>'}</td>
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
          <option value="student"${!u || u.role !== "admin" ? " selected" : ""}>Alumno</option>
          <option value="admin"${u && u.role === "admin" ? " selected" : ""}>Administrador</option></select></label>
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
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Contenido</span><h1>Cursos</h1></div>
        <div class="actions"><a class="btn btn-primary" href="#/cursos/nuevo">+ Nuevo curso</a></div></div>
      <div class="tiles stagger">${courses.map((c, i) => `<a class="card tile spot" href="#/cursos/${c.id}">
        <div class="cv${c.cover ? "" : " ph"}" ${c.cover ? `style="background-image:url('${fileUrl(c, c.cover, "640x360")}')"` : ""}>${c.cover ? "" : `<span>${esc(initials(c.title))}</span>`}</div>
        <div class="cb"><div class="badges">${c.published ? '<span class="badge good">Publicado</span>' : '<span class="badge">Borrador</span>'}${c.isGift ? '<span class="badge hot">🎁 Regalo</span>' : ""}${c.certEnabled ? '<span class="badge">🎓 Certifica</span>' : ""}</div>
          <h3>${esc(c.title)}</h3><p>${counts[i]} lecciones</p></div></a>`).join("")}
        <a class="tile add" href="#/cursos/nuevo"><span class="plus">+</span>Nuevo curso</a></div>`;
    stagger(view);
  }

  async function renderCurso(id){
    const isNew = id === "nuevo";
    const c = isNew ? {title:"", subtitle:"", description:"", published:false, isGift:false, certEnabled:true, certHours:"", order:(await getCourses()).length + 1} : await pb.collection("courses").getOne(id);
    const lessons = isNew ? [] : await pb.collection("lessons").getFullList({filter: pb.filter("course = {:c}", {c: id}), sort:"order,created"});

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
            <input class="input" type="file" name="cover" accept="image/*"></div>
          <div class="two">
            <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(c.order || 0)}"></label>
            <div class="field"><span>Visibilidad</span>
              <label class="check" style="margin-top:6px"><input type="checkbox" name="published"${c.published ? " checked" : ""}> Publicado</label>
              <label class="check"><input type="checkbox" name="isGift"${c.isGift ? " checked" : ""}> Regalo al aprobar</label></div>
          </div>
          <div class="two">
            <div class="field"><span>Certificado</span><label class="check" style="margin-top:6px"><input type="checkbox" name="certEnabled"${c.certEnabled ? " checked" : ""}> Emitir al completar</label></div>
            <label class="field"><span>Horas / duración en el certificado</span><input class="input" name="certHours" value="${esc(c.certHours || "")}" placeholder="Ej: 20 horas"></label>
          </div>
          <p class="hint">Solo los alumnos habilitados ven el curso, y únicamente si está publicado. Con "Emitir al completar", el alumno recibe su certificado InnovaFit al terminar todas las lecciones.</p>
          <p class="error-msg" id="cErr" role="alert"></p>
          <button class="btn btn-primary" id="cSave">${isNew ? "Crear curso" : "Guardar curso"}</button>
        </form>

        <div class="card panel">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
            <h2 style="margin:0">Lecciones</h2>
            ${isNew ? "" : '<button class="btn btn-primary btn-sm" id="addLesson">+ Agregar lección</button>'}
          </div>
          ${isNew ? '<p class="muted">Guardá el curso para empezar a cargar lecciones.</p>' : lessons.length ? `<div class="lessons stagger" id="lessonList">${lessonRows(lessons)}</div>` : '<p class="muted">Todavía no hay lecciones. Agregá videos, audios, PDF, imágenes, links de YouTube/Vimeo o lecturas.</p>'}
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

  function lessonRows(lessons){
    let last = null;
    return lessons.map((l, i) => {
      let sep = "";
      if((l.section || "") !== last){ last = l.section || ""; if(last) sep = `<div class="sec-sep">${esc(last)}</div>`; }
      const needsFile = ["video", "audio", "pdf", "image"].includes(l.kind) && !l.file;
      const needsUrl = l.kind === "embed" && !l.url;
      return sep + `<div class="lrow" data-lid="${l.id}">
        <div class="ord"><button data-move="-1" aria-label="Subir"${i === 0 ? " disabled" : ""}>▲</button><button data-move="1" aria-label="Bajar"${i === lessons.length - 1 ? " disabled" : ""}>▼</button></div>
        <div><b>${i + 1}. ${esc(l.title)}</b><small>${KIND_LABEL[l.kind] || l.kind}${l.duration ? " · " + esc(l.duration) : ""}${needsFile ? ' · <span class="warn">falta el archivo</span>' : ""}${needsUrl ? ' · <span class="warn">falta el link</span>' : ""}</small></div>
        <div class="row-actions"><button class="btn btn-ghost btn-sm" data-edit>Editar</button><button class="btn btn-danger btn-sm" data-del aria-label="Eliminar">✕</button></div>
      </div>`;
    }).join("");
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
      <div class="head"><div><span class="eyebrow">Lo que ve el alumno en su panel</span><h1>Certificaciones</h1></div>
        <div class="actions"><button class="btn btn-primary" id="newProg">+ Nueva certificación</button></div></div>
      <div class="tiles stagger">${items.map((p) => `<div class="card tile spot" data-id="${p.id}" tabindex="0" role="button">
        <div class="cv${p.image ? "" : " ph"}" ${p.image ? `style="background-image:url('${fileUrl(p, p.image, "640x360")}')"` : ""}>${p.image ? "" : `<span>${esc(initials(p.title))}</span>`}</div>
        <div class="cb"><div class="badges"><span class="badge hot">${esc(KIND_PROGRAM[p.kind] || "Certificación")}</span>${p.published ? '<span class="badge good">Visible</span>' : '<span class="badge">Oculta</span>'}</div>
          <h3>${esc(p.title)}</h3><p>${esc(p.summary || "")}</p></div></div>`).join("")}
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
    openModal(`<span class="eyebrow">Catálogo</span><h2 style="margin-top:8px">${isNew ? "Nueva certificación" : "Editar certificación"}</h2>
      <form id="pForm" novalidate>
        <label class="field"><span>Nombre</span><input class="input" name="title" required value="${esc(x.title)}"></label>
        <div class="two">
          <label class="field"><span>Tipo</span><select class="input" name="kind">${Object.entries(KIND_PROGRAM).map(([k, v]) => `<option value="${k}"${x.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Orden</span><input class="input" name="order" type="number" value="${esc(x.order || 0)}"></label>
        </div>
        <label class="field"><span>Descripción breve</span><textarea class="input" name="summary" rows="3">${esc(x.summary || "")}</textarea></label>
        <div class="two">
          <label class="field"><span>Duración</span><input class="input" name="duration" value="${esc(x.duration || "")}" placeholder="Ej: 4 meses"></label>
          <label class="field"><span>Modalidad</span><input class="input" name="modality" value="${esc(x.modality || "")}"></label>
        </div>
        <label class="field"><span>Imagen (opcional)</span><input class="input" type="file" name="image" accept="image/*"></label>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="published"${x.published ? " checked" : ""}> Visible para los alumnos</label>
        <p class="error-msg" id="pErr" role="alert"></p>
        <div class="modal-actions">${isNew ? "" : '<button type="button" class="btn btn-danger" id="pDel" style="margin-right:auto">Eliminar</button>'}<button type="button" class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="pSave">${isNew ? "Crear" : "Guardar"}</button></div>
      </form>`, (m) => {
      const form = m.querySelector("#pForm");
      form.onsubmit = async (e) => {
        e.preventDefault();
        if(!form.title.value.trim()){ m.querySelector("#pErr").textContent = "Falta el nombre."; return; }
        const fd = new FormData();
        ["title", "kind", "summary", "duration", "modality"].forEach((k) => fd.set(k, form[k].value.trim()));
        fd.set("order", form.order.value || "0");
        fd.set("published", form.published.checked ? "true" : "false");
        if(form.image.files[0]) fd.set("image", form.image.files[0]);
        m.querySelector("#pSave").disabled = true;
        try{
          if(isNew) await pb.collection("programs").create(fd);
          else await pb.collection("programs").update(p.id, fd);
          closeModal();
          ok(isNew ? "¡Creado con éxito!" : "¡Guardado con éxito!", "El catálogo del alumno ya está actualizado.");
          renderCertificaciones();
        }catch(err){
          m.querySelector("#pErr").textContent = errMsg(err);
          m.querySelector("#pSave").disabled = false;
        }
      };
      m.querySelector("#pDel")?.addEventListener("click", async () => {
        if(!(await confirmBox("Eliminar certificación", "Se quita \"" + p.title + "\" del catálogo. Los certificados ya emitidos no cambian."))) return;
        try{ await pb.collection("programs").delete(p.id); ok("¡Eliminada!"); renderCertificaciones(); }
        catch(err){ fail(err); }
      });
    });
  }

  /* ---------- Router ---------- */
  async function route(keepModal){
    const [, section = "resumen", id] = (location.hash.match(/^#\/([^/]+)(?:\/([^/]+))?/) || []);
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === section));
    moveRailIndicator();
    try{
      if(section === "evaluaciones") await renderEvaluaciones();
      else if(section === "alumnos") await renderAlumnos();
      else if(section === "cursos" && id) await renderCurso(id);
      else if(section === "cursos") await renderCursos();
      else if(section === "certificados"){
        await renderCertificados();
        if(id === "nuevo" && !keepModal){ history.replaceState(null, "", "#/certificados"); issueModal({}); }
      }
      else if(section === "certificaciones") await renderCertificaciones();
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
    if(me.role !== "admin"){ pb.authStore.clear(); showLogin("Esta cuenta no tiene permisos de administrador."); return; }
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("me").textContent = me.email;
    $("meName").textContent = me.name || "Admin";
    $("meAv").outerHTML = avatarHtml(me);
    view.innerHTML = `<div style="min-height:50vh;display:grid;place-items:center"><div class="spinner"></div></div>`;
    route();
  }

  boot();
})();
