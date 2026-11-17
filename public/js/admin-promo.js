// Admin → Promociones (CRUD de campañas con % por programa) e Inscripciones (leads de la landing /black-friday).
// Usa las utilidades que expone admin.js en window.AdminKit (se carga antes, pero solo se usan al navegar).
(function(){
  "use strict";
  const {pb, esc, api, errMsg, countUp} = UI;
  const K = () => window.AdminKit;
  const $ = (id) => document.getElementById(id);

  const ST = {nuevo:["Nuevo", "hot"], contactado:["Contactado", ""], en_checkout:["En checkout", "hot"], pagado:["Pagado", "good"], descartado:["Descartado", "bad"]};
  const PST = {programada:["Programada", "hot"], activa:["Activa", "good"], finalizada:["Finalizada", ""]};
  const CRM = {pendiente:["CRM pendiente", "hot"], enviado:["En CRM", "good"], error:["Error CRM", "bad"], omitido:["Sin CRM", ""]};
  const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  const pbDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);
  // Mismo cálculo que el servidor (lib/promo-routes.js → effectiveStatus).
  function effective(p){
    const now = Date.now(), s = pbDate(p.startsAt), e = pbDate(p.endsAt);
    if(p.status === "finalizada" || (e && e <= now)) return "finalizada";
    if(s && s > now) return "programada";
    if(p.status === "programada" && !s) return "programada";
    return "activa";
  }
  const toLocalInput = (v) => {
    const d = pbDate(v);
    if(!d || isNaN(d)) return "";
    const z = new Date(d - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 16);
  };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString().replace("T", " ") : "");
  const pbUtc = (d) => d.toISOString().replace("T", " ").slice(0, 19);

  let progCache = null, promoCache = null;
  async function programs(force){
    if(!progCache || force) progCache = await pb.collection("programs").getFullList({sort:"order,title", fields:"id,title,kind,published,price"});
    return progCache;
  }
  async function promotions(force){
    if(!promoCache || force) promoCache = await pb.collection("promotions").getFullList({sort:"-created"});
    return promoCache;
  }

  /* =====================================================
     PROMOCIONES
     ===================================================== */
  async function renderPromos(id){
    if(id) return editPromo(id === "nueva" ? null : id);
    const {view, stagger} = K();
    const [list, progs, integ] = await Promise.all([promotions(true), programs(true), api("/api/admin/promo/integrations").catch(() => null)]);
    const names = new Map(progs.map((p) => [p.id, p.title]));
    const chip = (on, label, off) => `<span class="badge ${on ? "good" : ""}">${on ? "✓ " + label : off}</span>`;
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Campañas de la landing /black-friday</span><h1>Promociones</h1></div>
        <div class="actions"><a class="btn btn-ghost" href="/black-friday?preview=1" target="_blank" rel="noopener">Ver landing</a><a class="btn btn-primary" href="#/promociones/nueva">+ Nueva promoción</a></div></div>
      ${integ ? `<div class="integ">${chip(integ.pixel, "Meta Pixel", "Meta Pixel sin configurar")}${chip(integ.capi, "Conversions API", "CAPI sin configurar")}${chip(!!integ.crm, integ.crm === "kommo" ? "Kommo conectado" : "Webhook CRM", "CRM sin configurar")}${chip(integ.paymentWebhook, "Webhook de pago", "Webhook de pago sin configurar")}</div>` : ""}
      <div class="tiles stagger">${list.map((p) => {
        const st = PST[effective(p)];
        const items = Array.isArray(p.items) ? p.items : [];
        const pcts = items.map((i) => +i.pct || 0).filter(Boolean);
        const s = pbDate(p.startsAt), e = pbDate(p.endsAt);
        return `<a class="card tile spot promo-card" href="#/promociones/${p.id}"><div class="cb">
          <div class="badges"><span class="badge ${st[1]}">${st[0]}</span>${p.landing ? '<span class="badge hot">En la landing</span>' : ""}</div>
          <h3>${esc(p.name)}</h3>
          <p>${s || e ? (s ? K().fmtDateTime(p.startsAt) : "…") + " → " + (e ? K().fmtDateTime(p.endsAt) : "…") : "Sin fechas"}</p>
          <div class="meta">${items.map((i) => `<span class="pct-chip" title="${esc(names.get(i.program) || "")}">${esc((names.get(i.program) || "¿?").replace(/^(Certificación|Especialización) (en )?/i, "").slice(0, 26))} · ${+i.pct || 0}%</span>`).join("")}</div>
          <p class="mono" style="font-size:12px;color:var(--yellow)">/promo/${esc(p.slug || slugify(p.name))}</p>${pcts.length ? " · de " + Math.min(...pcts) + "% a " + Math.max(...pcts) + "%" : " · sin % cargados"}</p>
        </div></a>`;
      }).join("")}<a class="tile add" href="#/promociones/nueva"><span class="plus">+</span>Nueva promoción</a></div>`;
    stagger(view);
  }

  async function editPromo(id){
    const {view, ok, fail, confirmBox} = K();
    const [p, progs, lessons] = await Promise.all([
      id ? pb.collection("promotions").getOne(id) : Promise.resolve(null),
      programs(true),
      pb.collection("lessons").getFullList({filter:'kind = "video" || kind = "embed"', sort:"course,order", fields:"id,title,course,kind", expand:"course"}).catch(() => []),
    ]);
    const d = p || {name:"", bannerTitle:"", status:"programada", landing:true, currency:"USD", items:[], mentorships:[], faq:[], conditions:"", checkoutUrl:"", demoLesson:"", demoVideoUrl:"", institutional:""};
    let items = (Array.isArray(d.items) ? d.items : []).map((x) => ({program:x.program, pct:+x.pct || 0, finalPrice:+x.finalPrice || 0, priceBefore:+x.priceBefore || 0, accreditation:x.accreditation || ""}));
    let mentors = Array.isArray(d.mentorships) ? d.mentorships.map((m) => ({...m})) : [];
    let faq = Array.isArray(d.faq) ? d.faq.map((f) => ({...f})) : [];
    const pname = (pid) => (progs.find((x) => x.id === pid) || {}).title || "Programa eliminado";

    view.innerHTML = `
      <div class="head"><div><span class="eyebrow"><a href="#/promociones" style="color:inherit">Promociones</a> / ${p ? "editar" : "nueva"}</span><h1>${p ? esc(p.name) : "Nueva promoción"}</h1></div>
        <div class="actions">${p ? `<a class="btn btn-ghost" href="/promo/${esc(p.slug || slugify(p.name))}?preview=1" target="_blank" rel="noopener">Vista previa</a>` + '<button class="btn btn-danger" id="pDel">Eliminar</button>' : ""}<button class="btn btn-primary" id="pSave">Guardar</button></div></div>
      <div class="prog-ed">
        <section class="card panel">
          <h3 class="ed-h">Campaña</h3>
          <label class="field"><span>Nombre</span><input class="input" id="pName" value="${esc(d.name)}" placeholder="Black Friday 2026"></label>
          <label class="field"><span>Dirección de su landing</span><div style="display:flex;align-items:center;gap:6px"><span class="mono muted" style="font-size:13px">/promo/</span><input class="input" id="pSlug" value="${esc(d.slug || "")}" placeholder="se arma con el nombre"></div></label>
          <label class="field"><span>Título de la barra superior</span><input class="input" id="pBanner" value="${esc(d.bannerTitle)}" placeholder="BLACK FRIDAY 2026"></label>
          <div class="two">
            <label class="field"><span>Inicio</span><input class="input" type="datetime-local" id="pStart" value="${toLocalInput(d.startsAt)}"></label>
            <label class="field"><span>Cierre</span><input class="input" type="datetime-local" id="pEnd" value="${toLocalInput(d.endsAt)}"></label>
          </div>
          <p class="hint">Hora de tu computadora. "Programada" se activa sola al llegar el inicio y todo pasa a "Finalizada" al llegar el cierre.</p>
          <div class="two">
            <label class="field"><span>Estado</span><select class="input" id="pStatus">${Object.entries(PST).map(([k, v]) => `<option value="${k}"${d.status === k ? " selected" : ""}>${v[0]}</option>`).join("")}</select></label>
            <label class="field"><span>Moneda</span><input class="input" id="pCur" value="${esc(d.currency || "USD")}" maxlength="6"></label>
          </div>
          <h3 class="ed-h" style="margin-top:18px">Paquete (bloque de la oferta)</h3>
          <label class="field"><span>Nombre del paquete</span><input class="input" id="pPackName" value="${esc(d.packName || "")}" placeholder="Certificación Internacional 5×1"></label>
          <div class="two">
            <label class="field"><span>Precio regular del paquete</span><input class="input" type="number" min="0" step="0.01" id="pPackBefore" value="${d.packPriceBefore || ""}"></label>
            <label class="field"><span>Precio especial del paquete</span><input class="input" type="number" min="0" step="0.01" id="pPackPrice" value="${d.packPrice || ""}"></label>
          </div>
          <p class="hint">El % de descuento del paquete se calcula solo con estos dos precios. Si los dejás vacíos, la landing muestra "Precio especial: consúltalo con un asesor".</p>
          <label class="check" style="margin-bottom:14px"><input type="checkbox" id="pLanding"${d.landing ? " checked" : ""}> Destacada: también se ve en /black-friday</label>
          <label class="field"><span>Condiciones aplicables</span><textarea class="input" id="pCond" rows="5" placeholder="Vigencia, programas participantes, formas de pago, restricciones…">${esc(d.conditions)}</textarea></label>
          <label class="field"><span>URL del checkout (pasarela de pago)</span><input class="input" id="pCheckout" value="${esc(d.checkoutUrl)}" placeholder="https://…"></label>
          <p class="hint">Se le agrega <code>?ref=FOLIO</code>. Configurá la pasarela para volver a <code>/black-friday-gracias?ref=FOLIO</code> y avisar el pago a <code>/api/promo/payment</code>. Sin URL, la compra sigue por WhatsApp.</p>

          <h3 class="ed-h" style="margin-top:22px">Video demo</h3>
          <label class="field"><span>Lección del campus</span><select class="input" id="pLesson"><option value="">— Ninguna —</option>${lessons.map((l) => `<option value="${l.id}"${d.demoLesson === l.id ? " selected" : ""}>${esc((l.expand && l.expand.course ? l.expand.course.title + " · " : "") + l.title)}</option>`).join("")}</select></label>
          <label class="field"><span>o link de YouTube / Vimeo (tiene prioridad)</span><input class="input" id="pVideoUrl" value="${esc(d.demoVideoUrl)}" placeholder="https://…"></label>

          <h3 class="ed-h" style="margin-top:22px">Respaldo institucional</h3>
          <label class="field"><span>Texto (redacción validada por InnovaFit)</span><textarea class="input" id="pInst" rows="3" placeholder="ISSA, presencia en 170+ países…">${esc(d.institutional)}</textarea></label>
        </section>

        <section>
          <div class="card panel" style="margin-bottom:16px">
            <h3 class="ed-h">Programas y descuento por programa</h3>
            <p class="hint" style="margin-top:0">Cada programa lleva su propio %. El orden es el de la landing. La acreditación se muestra solo en el programa que la tenga (NCCA ≠ NSCA).</p>
            <div class="promo-items" id="pItems"></div>
            <div style="display:flex;gap:8px;margin-top:10px"><select class="input" id="pAdd" style="flex:1"><option value="">+ Agregar programa…</option>${progs.map((x) => `<option value="${x.id}">${esc(x.title)}${x.published ? "" : " (borrador)"}</option>`).join("")}</select></div>
            <p class="hint" style="margin-top:8px">¿Falta un programa o su temario? Cargalo en <a href="#/certificaciones" style="color:var(--yellow)">Certificaciones</a> (no hace falta publicarlo en el campus).</p>
          </div>
          <div class="card panel" style="margin-bottom:16px">
            <h3 class="ed-h">Mentorías en vivo</h3>
            <div id="pMentors"></div>
            <button class="btn btn-ghost btn-sm" id="pMentorAdd">+ Mentoría</button>
          </div>
          <div class="card panel">
            <h3 class="ed-h">Preguntas frecuentes</h3>
            <p class="hint" style="margin-top:0">Solo respuestas oficiales. Si está vacío, la landing muestra 4 preguntas básicas sobre la vigencia y la modalidad.</p>
            <div id="pFaq"></div>
            <button class="btn btn-ghost btn-sm" id="pFaqAdd">+ Pregunta</button>
          </div>
        </section>
      </div>`;

    const drawItems = () => {
      $("pItems").innerHTML = items.length ? items.map((it, i) => `<div class="pitem" data-i="${i}">
        <div class="ord-b"><button data-up${i ? "" : " disabled"}>▲</button><button data-down${i < items.length - 1 ? "" : " disabled"}>▼</button></div>
        <b class="pname">${esc(pname(it.program))}</b>
        <button class="btn btn-ghost btn-sm rm" data-rm aria-label="Quitar">✕</button>
        <label class="mini"><span>% descuento</span><input class="input" type="number" min="0" max="90" step="1" data-k="pct" value="${it.pct}"></label>
        <label class="mini"><span>Precio final</span><input class="input" type="number" min="0" step="0.01" data-k="finalPrice" value="${it.finalPrice || ""}" placeholder="—"></label>
        <label class="mini"><span>Precio antes</span><input class="input" type="number" min="0" step="0.01" data-k="priceBefore" value="${it.priceBefore || ""}" placeholder="—"></label>
        <input class="input acc" data-k="accreditation" value="${esc(it.accreditation)}" placeholder="Acreditación de ESTE programa (opcional, ej. examen acreditado por …)" aria-label="Acreditación del programa">
      </div>`).join("") : '<p class="muted">Todavía no hay programas.</p>';
    };
    const drawMentors = () => {
      $("pMentors").innerHTML = mentors.map((m, i) => `<div class="mitem" data-i="${i}">
        <div class="two"><label class="field"><span>Título</span><input class="input" data-k="title" value="${esc(m.title)}"></label><label class="field"><span>Periodo</span><input class="input" data-k="period" value="${esc(m.period)}" placeholder="Enero – marzo 2027"></label></div>
        <div class="two"><label class="field"><span>Fechas y horario</span><input class="input" data-k="schedule" value="${esc(m.schedule)}" placeholder="Vacío = “Por confirmar”"></label><label class="field"><span>Enlace de Zoom</span><input class="input" data-k="zoomUrl" value="${esc(m.zoomUrl)}" placeholder="https://zoom.us/…"></label></div>
        <label class="field"><span>Descripción</span><textarea class="input" data-k="text" rows="2">${esc(m.text)}</textarea></label>
        <div style="display:flex;justify-content:space-between;align-items:center"><label class="check"><input type="checkbox" data-k="visible"${m.visible !== false ? " checked" : ""}> Visible en la landing</label><button class="btn btn-danger btn-sm" data-rm>Quitar</button></div>
      </div>`).join("");
    };
    const drawFaq = () => {
      $("pFaq").innerHTML = faq.map((f, i) => `<div class="fitem" data-i="${i}">
        <label class="field"><span>Pregunta</span><input class="input" data-k="q" value="${esc(f.q)}"></label>
        <label class="field"><span>Respuesta</span><textarea class="input" data-k="a" rows="3">${esc(f.a)}</textarea></label>
        <div style="text-align:right"><button class="btn btn-danger btn-sm" data-rm>Quitar</button></div></div>`).join("");
    };
    drawItems(); drawMentors(); drawFaq();

    // Edición en vivo de los repetidores
    const bindList = (rootId, arr, redraw, numeric) => {
      const root = $(rootId);
      root.addEventListener("input", (e) => {
        const row = e.target.closest("[data-i]"), k = e.target.dataset.k;
        if(!row || !k) return;
        const it = arr()[+row.dataset.i];
        it[k] = e.target.type === "checkbox" ? e.target.checked : numeric && numeric.includes(k) ? +e.target.value || 0 : e.target.value;
      });
      root.addEventListener("click", (e) => {
        const row = e.target.closest("[data-i]");
        if(!row) return;
        const i = +row.dataset.i, a = arr();
        if(e.target.closest("[data-rm]")){ a.splice(i, 1); redraw(); }
        else if(e.target.closest("[data-up]") && i > 0){ [a[i - 1], a[i]] = [a[i], a[i - 1]]; redraw(); }
        else if(e.target.closest("[data-down]") && i < a.length - 1){ [a[i + 1], a[i]] = [a[i], a[i + 1]]; redraw(); }
      });
    };
    bindList("pItems", () => items, drawItems, ["pct", "finalPrice", "priceBefore"]);
    bindList("pMentors", () => mentors, drawMentors);
    bindList("pFaq", () => faq, drawFaq);
    // checkbox "visible": el evento input del checkbox ya trae el target correcto
    $("pMentors").addEventListener("change", (e) => {
      const row = e.target.closest("[data-i]");
      if(row && e.target.dataset.k === "visible") mentors[+row.dataset.i].visible = e.target.checked;
    });
    $("pAdd").onchange = (e) => {
      const v = e.target.value;
      e.target.value = "";
      if(!v) return;
      if(items.some((x) => x.program === v)) return fail("Ese programa ya está en la promoción.");
      items.push({program:v, pct:0, finalPrice:0, priceBefore:0, accreditation:""});
      drawItems();
    };
    $("pMentorAdd").onclick = () => { mentors.push({title:"Mentoría online en vivo", period:"", schedule:"", zoomUrl:"", text:"", visible:true}); drawMentors(); };
    $("pFaqAdd").onclick = () => { faq.push({q:"", a:""}); drawFaq(); };

    $("pSave").onclick = async () => {
      const body = {
        name: $("pName").value.trim(),
        bannerTitle: $("pBanner").value.trim(),
        startsAt: fromLocalInput($("pStart").value),
        endsAt: fromLocalInput($("pEnd").value),
        status: $("pStatus").value,
        landing: $("pLanding").checked,
        currency: $("pCur").value.trim().toUpperCase() || "USD",
        conditions: $("pCond").value.trim(),
        checkoutUrl: $("pCheckout").value.trim(),
        packName: $("pPackName").value.trim(),
        packPriceBefore: +$("pPackBefore").value || 0,
        packPrice: +$("pPackPrice").value || 0,
        demoLesson: $("pLesson").value,
        demoVideoUrl: $("pVideoUrl").value.trim(),
        institutional: $("pInst").value.trim(),
        items: items.map((x) => ({program:x.program, pct:Math.max(0, Math.min(90, Math.round(+x.pct || 0))), finalPrice:+x.finalPrice || 0, priceBefore:+x.priceBefore || 0, accreditation:String(x.accreditation || "").trim()})),
        programs: items.map((x) => x.program),
        mentorships: mentors.map((m) => ({title:String(m.title || "").trim(), period:String(m.period || "").trim(), schedule:String(m.schedule || "").trim(), zoomUrl:String(m.zoomUrl || "").trim(), text:String(m.text || "").trim(), visible:m.visible !== false})),
        faq: faq.filter((f) => String(f.q || "").trim() && String(f.a || "").trim()).map((f) => ({q:f.q.trim(), a:f.a.trim()})),
      };
      if(body.name.length < 3) return fail("Ponele un nombre a la promoción.");
      if(body.startsAt && body.endsAt && new Date(body.endsAt.replace(" ", "T")) <= new Date(body.startsAt.replace(" ", "T"))) return fail("El cierre tiene que ser posterior al inicio.");
      if(body.packPrice && body.packPriceBefore && body.packPrice >= body.packPriceBefore) return fail("El precio especial del paquete tiene que ser menor que el regular.");
      if(body.checkoutUrl && !/^https:\/\//.test(body.checkoutUrl)) return fail("La URL del checkout tiene que empezar con https://");
      if(body.mentorships.some((m) => m.zoomUrl && !/^https:\/\//.test(m.zoomUrl))) return fail("Los enlaces de Zoom tienen que empezar con https://");
      const btn = $("pSave");
      btn.disabled = true;
      try{
        const saved = p ? await pb.collection("promotions").update(p.id, body) : await pb.collection("promotions").create(body);
        // Solo una promoción en la landing a la vez.
        if(body.landing){
          const others = (await promotions(true)).filter((x) => x.id !== saved.id && x.landing);
          await Promise.all(others.map((x) => pb.collection("promotions").update(x.id, {landing:false})));
        }
        await api("/api/admin/promo/refresh", {}).catch(() => {});
        promoCache = null;
        ok("¡Promoción guardada!", "La landing ya muestra los cambios.");
        if(!p) location.hash = "#/promociones/" + saved.id;
      }catch(err){ fail(err); }
      finally{ btn.disabled = false; }
    };
    if(p) $("pDel").onclick = async () => {
      const n = await pb.collection("promo_leads").getList(1, 1, {filter: pb.filter("promotion = {:p}", {p: p.id}), fields:"id"});
      if(!await confirmBox("Eliminar promoción", n.totalItems ? `Tiene ${n.totalItems} inscripciones asociadas: quedan guardadas pero sin promoción. ¿Eliminar igual?` : "Esta acción no se puede deshacer.")) return;
      try{
        await pb.collection("promotions").delete(p.id);
        await api("/api/admin/promo/refresh", {}).catch(() => {});
        ok("Promoción eliminada");
        location.hash = "#/promociones";
      }catch(err){ fail(err); }
    };
  }

  /* =====================================================
     INSCRIPCIONES (leads de la landing)
     ===================================================== */
  const S = {page:1, q:"", promotion:"", program:"", status:"", from:"", to:""};

  function filterStr(){
    const parts = [];
    if(S.promotion) parts.push(pb.filter("promotion = {:v}", {v: S.promotion}));
    if(S.program === "_none") parts.push('program = ""');
    else if(S.program) parts.push(pb.filter("program = {:v}", {v: S.program}));
    if(S.status) parts.push(pb.filter("status = {:v}", {v: S.status}));
    if(S.from) parts.push(pb.filter("created >= {:v}", {v: pbUtc(new Date(S.from + "T00:00:00"))}));
    if(S.to) parts.push(pb.filter("created <= {:v}", {v: pbUtc(new Date(S.to + "T23:59:59"))}));
    if(S.q) parts.push(pb.filter("(name ~ {:q} || email ~ {:q} || phone ~ {:q} || city ~ {:q} || utm_campaign ~ {:q})", {q: S.q}));
    return parts.join(" && ");
  }

  async function renderLeads(id){
    const {view, pager, bindPager, searchInput, stagger, kpi, fmtDateTime, waLink} = K();
    const [res, progs, promos, counts] = await Promise.all([
      pb.collection("promo_leads").getList(S.page, 30, {sort:"-created", filter: filterStr()}),
      programs(),
      promotions(),
      Promise.all(["", "nuevo", "en_checkout", "pagado"].map((s) => {
        const f = [filterStr(), s ? pb.filter("status = {:s}", {s}) : ""].filter(Boolean).join(" && ");
        return pb.collection("promo_leads").getList(1, 1, {filter: f, fields:"id"}).then((r) => r.totalItems);
      })),
    ]);
    const pName = new Map(promos.map((p) => [p.id, p.name]));
    const sel = (id, label, opts, val) => `<label>${label}<select class="input" id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${val === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    view.innerHTML = `
      <div class="head"><div><span class="eyebrow">Leads de la landing /black-friday</span><h1>Inscripciones</h1></div>
        <div class="actions"><button class="btn btn-ghost" id="lCsv">Exportar CSV</button><button class="btn btn-primary" id="lXlsx">Exportar Excel</button></div></div>
      <div class="kpis stagger sales-kpis">
        ${kpi("Con este filtro", counts[0], "📋", "inscripciones")}
        ${kpi("Nuevas", counts[1], "🆕", "esperan contacto")}
        ${kpi("En checkout", counts[2], "🛒", "iniciaron la compra")}
        ${kpi("Pagadas", counts[3], "✅", "pago confirmado")}
      </div>
      <div class="filters">
        ${sel("fPromo", "Promoción", [["", "Todas"], ...promos.map((p) => [p.id, p.name])], S.promotion)}
        ${sel("fProg", "Taller / programa", [["", "Todos"], ["_none", "Paquete completo"], ...progs.map((p) => [p.id, p.title])], S.program)}
        ${sel("fStatus", "Estado", [["", "Todos"], ...Object.entries(ST).map(([k, v]) => [k, v[0]])], S.status)}
        <label>Desde<input class="input" type="date" id="fFrom" value="${esc(S.from)}"></label>
        <label>Hasta<input class="input" type="date" id="fTo" value="${esc(S.to)}"></label>
      </div>
      <div class="toolbar"><input class="input" id="lQ" type="search" placeholder="Buscar por nombre, correo, teléfono, ciudad o campaña" value="${esc(S.q)}">
        ${S.promotion || S.program || S.status || S.from || S.to || S.q ? '<button class="btn btn-ghost btn-sm" id="fClear">Limpiar filtros</button>' : ""}</div>
      ${res.items.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Persona</th><th>WhatsApp</th><th>Programa</th><th>Estado</th><th>Origen</th><th>CRM</th><th>Fecha</th></tr></thead>
        <tbody class="stagger">${res.items.map((l) => `<tr data-id="${l.id}" class="click-row">
          <td><b>${esc(l.name)}</b><span class="sub">${esc(l.email)} · ${esc([l.city, l.countryName].filter(Boolean).join(", "))}</span></td>
          <td><a href="${waLink(l.country, l.phone, "Hola " + (l.name || "").split(" ")[0] + "! Te escribimos de InnovaFit por tu interés en la promoción " + (pName.get(l.promotion) || "Black Friday") + ".")}" target="_blank" rel="noopener" style="color:var(--good)" data-stop>+${esc(l.country)} ${esc(l.phone)}</a></td>
          <td>${esc(l.programTitle || "—")}<span class="sub">${esc(pName.get(l.promotion) || "")}</span></td>
          <td>${l.status === "pagado" ? '<span class="badge good">Pagado</span>' : `<select class="mini-select" data-status data-stop aria-label="Estado">${Object.entries(ST).filter(([k]) => k !== "pagado").map(([k, v]) => `<option value="${k}"${l.status === k ? " selected" : ""}>${v[0]}</option>`).join("")}</select>`}</td>
          <td><span class="sub" style="color:var(--fg)">${esc(l.utm_source || "directo")}</span><span class="sub">${esc(l.utm_campaign || "")}</span></td>
          <td><span class="badge ${(CRM[l.crmStatus] || ["", ""])[1]}">${esc((CRM[l.crmStatus] || [l.crmStatus || "—"])[0])}</span></td>
          <td><span class="sub" style="color:var(--fg)">${fmtDateTime(l.created)}</span></td></tr>`).join("")}</tbody></table></div>`
        : `<div class="table-wrap"><div class="empty-row">No hay inscripciones${filterStr() ? " con estos filtros" : " todavía"}.</div></div>`}
      ${pager(res)}`;
    stagger(view);
    view.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count));

    const rerender = () => { S.page = 1; renderLeads(); };
    $("fPromo").onchange = (e) => { S.promotion = e.target.value; rerender(); };
    $("fProg").onchange = (e) => { S.program = e.target.value; rerender(); };
    $("fStatus").onchange = (e) => { S.status = e.target.value; rerender(); };
    $("fFrom").onchange = (e) => { S.from = e.target.value; rerender(); };
    $("fTo").onchange = (e) => { S.to = e.target.value; rerender(); };
    if($("fClear")) $("fClear").onclick = () => { Object.assign(S, {q:"", promotion:"", program:"", status:"", from:"", to:""}); rerender(); };
    searchInput("lQ", (v) => { S.q = v; S.page = 1; return renderLeads(); });
    bindPager(S, renderLeads);

    const byId = new Map(res.items.map((l) => [l.id, l]));
    view.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.onclick = (e) => { if(!e.target.closest("[data-stop]")) leadModal(byId.get(tr.dataset.id), pName); };
      tr.querySelector("[data-status]")?.addEventListener("change", async (e) => {
        try{
          await pb.collection("promo_leads").update(tr.dataset.id, {status: e.target.value});
          K().ok("¡Estado actualizado!", ST[e.target.value][0]);
        }catch(err){ K().fail(err); }
      });
    });
    $("lCsv").onclick = () => exportLeads("csv", pName);
    $("lXlsx").onclick = () => exportLeads("xlsx", pName);
    if(id){ const l = byId.get(id) || await pb.collection("promo_leads").getOne(id).catch(() => null); if(l) leadModal(l, pName); }
  }

  function leadModal(l, pName){
    const {openModal, closeModal, ok, fail, fmtDateTime, waLink, isAdmin, confirmBox, money} = K();
    const row = (k, v) => v ? `<div><span>${k}</span><b>${esc(v)}</b></div>` : "";
    const st = ST[l.status] || [l.status, ""];
    openModal(`<span class="eyebrow">${fmtDateTime(l.created)} · ${esc(pName.get(l.promotion) || "Sin promoción")}</span>
      <div class="ins-head"><h2>${esc(l.name)}</h2><span class="badge ${st[1]}">${esc(st[0])}</span><span class="badge ${(CRM[l.crmStatus] || ["", ""])[1]}">${esc((CRM[l.crmStatus] || [l.crmStatus || ""])[0])}${l.crmId ? " #" + esc(l.crmId) : ""}</span></div>
      <div class="cred ins-data">
        ${row("WhatsApp", "+" + l.country + " " + l.phone)}${row("Correo", l.email)}${row("País / ciudad", [l.countryName, l.city].filter(Boolean).join(" / "))}
        ${row("Programa", l.programTitle)}${row("¿Trabaja como entrenador?", l.isTrainer === "si" ? "Sí" : l.isTrainer === "no" ? "No" : "")}
        ${row("Información que necesita", l.infoNeeded)}${row("Origen", l.source === "checkout" ? "Botón de compra" : "Formulario de información")}
        ${UTM.map((k) => row(k, l[k])).join("")}${row("Llegó desde", l.landingUrl)}
        ${row("Consentimiento", l.consent ? "Aceptó el aviso de privacidad · " + fmtDateTime(l.consentAt) : "")}
        ${row("Inició checkout", l.checkoutAt ? fmtDateTime(l.checkoutAt) : "")}
        ${l.status === "pagado" ? row("Pago", money(l.paidAmount, l.currency) + " · " + fmtDateTime(l.paidAt) + " · " + (l.paidVia === "webhook" ? "pasarela" : "confirmado por el equipo") + (l.payRef ? " · " + l.payRef : "")) : ""}
        ${l.crmError ? row("Error del CRM", l.crmError) : ""}
      </div>
      <label class="field"><span>Notas internas</span><textarea class="input" id="lNotes" rows="3">${esc(l.notes || "")}</textarea></label>
      ${l.status !== "pagado" ? `<details class="wblock" style="margin-bottom:12px"><summary>Confirmar pago validado</summary><div class="wbody">
        <p class="hint" style="margin:0 0 10px">Usalo solo si el pago está validado (comprobante o pasarela). Marca la inscripción como pagada y envía el evento Purchase a Meta.</p>
        <div class="two"><label class="field"><span>Monto cobrado</span><input class="input" type="number" min="0" step="0.01" id="lAmount"></label><label class="field"><span>Moneda</span><input class="input" id="lCur" value="${esc(l.currency || "USD")}"></label></div>
        <label class="field"><span>Referencia del pago</span><input class="input" id="lRef" placeholder="N.º de operación, comprobante…"></label>
        <button class="btn btn-primary btn-sm" id="lPaid">Confirmar pago</button></div></details>` : ""}
      <div class="modal-actions">
        ${isAdmin() ? '<button class="btn btn-danger" id="lDel" style="margin-right:auto">Eliminar</button>' : ""}
        <button class="btn btn-ghost" id="lCrm">${l.crmStatus === "enviado" ? "Reenviar" : "Enviar"} al CRM</button>
        <a class="btn btn-ghost" target="_blank" rel="noopener" href="${waLink(l.country, l.phone, "Hola " + (l.name || "").split(" ")[0] + "! Soy " + ((pb.authStore.record || {}).name || "del equipo") + " de InnovaFit 👋 Te escribo por tu interés en " + (l.programTitle || "la promoción") + ".")}">WhatsApp</a>
        <button class="btn btn-primary" id="lSave">Guardar notas</button>
      </div>`, (m) => {
      m.querySelector("#lSave").onclick = async () => {
        try{ await pb.collection("promo_leads").update(l.id, {notes: m.querySelector("#lNotes").value}); closeModal(); ok("¡Notas guardadas!"); }catch(err){ fail(err); }
      };
      m.querySelector("#lCrm").onclick = async (e) => {
        e.target.disabled = true;
        try{ const r = await api("/api/admin/promo-leads/" + l.id + "/crm", {}); ok(r.status === "omitido" ? "No hay CRM configurado" : "¡Enviado al CRM!", r.id ? "Lead #" + r.id : ""); closeModal(); renderLeads(); }
        catch(err){ fail(err.message); e.target.disabled = false; }
      };
      const paid = m.querySelector("#lPaid");
      if(paid) paid.onclick = async () => {
        const amount = +m.querySelector("#lAmount").value;
        if(!(amount > 0)) return fail("Escribí el monto cobrado.");
        paid.disabled = true;
        try{
          await api("/api/admin/promo-leads/" + l.id + "/paid", {amount, currency: m.querySelector("#lCur").value, payRef: m.querySelector("#lRef").value});
          closeModal(); ok("¡Pago confirmado!", "Se envió el evento Purchase."); renderLeads();
        }catch(err){ fail(err.message); paid.disabled = false; }
      };
      const del = m.querySelector("#lDel");
      if(del) del.onclick = async () => {
        if(!await confirmBox("Eliminar inscripción", "Se borra del campus (no del CRM). No se puede deshacer.")) return;
        try{ await pb.collection("promo_leads").delete(l.id); ok("Inscripción eliminada"); renderLeads(); }catch(err){ fail(err); }
      };
    });
  }

  const HEAD = ["fecha_creacion", "fecha_actualizacion", "estado", "promocion", "programa", "nombre_completo", "correo", "codigo_pais", "whatsapp", "pais", "ciudad",
    "trabaja_como_entrenador", "info_requerida", "origen", ...UTM, "landing_url", "consentimiento", "fecha_consentimiento", "inicio_checkout", "fecha_pago", "monto_pagado", "moneda", "referencia_pago", "crm", "crm_id", "notas"];
  const rowOf = (l, pName) => [l.created, l.updated, (ST[l.status] || [l.status])[0], pName.get(l.promotion) || "", l.programTitle, l.name, l.email, l.country, l.phone, l.countryName, l.city,
    l.isTrainer, l.infoNeeded, l.source, ...UTM.map((k) => l[k]), l.landingUrl, l.consent ? "si" : "no", l.consentAt, l.checkoutAt, l.paidAt, l.paidAmount || "", l.currency, l.payRef, l.crmStatus, l.crmId, l.notes];

  let xlsxP = null;
  const loadXlsx = () => xlsxP ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error("No se pudo cargar el generador de Excel. Probá con CSV.")); };
    document.head.appendChild(s);
  });

  async function exportLeads(kind, pName){
    const {downloadCsv, ok, fail, todayISO} = K();
    try{
      const rows = (await pb.collection("promo_leads").getFullList({sort:"-created", filter: filterStr(), batch:500})).map((l) => rowOf(l, pName));
      const name = "inscripciones-black-friday-" + todayISO();
      if(kind === "csv") return downloadCsv(name + ".csv", HEAD, rows);
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet([HEAD, ...rows]);
      ws["!cols"] = HEAD.map((h) => ({wch: Math.max(12, Math.min(40, h.length + 4))}));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inscripciones");
      XLSX.writeFile(wb, name + ".xlsx");
      ok("¡Excel exportado!", rows.length + " filas descargadas.");
    }catch(err){ fail(err.message || errMsg(err)); }
  }

  window.AdminPromo = {renderPromos, renderLeads};
})();
