// Landing de promociones · InnovaFit by ISSA (/black-friday = la destacada, /promo/<slug> = cada promoción)
// 1) carga la promoción vigente desde /api/promo/active (fechas, programas y % por programa los edita el admin)
// 2) formularios de información y de compra, con eventos de Meta deduplicados
// 3) coreografía de scroll con GSAP + ScrollTrigger + Lenis (desactivada con "reducir movimiento")
(function(){
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const T = window.PromoTrack;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pbDate = (v) => (v ? new Date(String(v).replace(" ", "T").replace(/Z?$/, "Z")) : null);
  const money = (n, cur) => "$" + (+n || 0).toLocaleString("es-MX", {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2}) + (cur ? " " + cur : "");
  const pad2 = (n) => String(n).padStart(2, "0");
  const KIND = {certificacion:"Certificación", especializacion:"Especialidad", paquete:"Paquete"};

  const COUNTRIES = [
    ["52","México","🇲🇽"],["54","Argentina","🇦🇷"],["57","Colombia","🇨🇴"],["56","Chile","🇨🇱"],["51","Perú","🇵🇪"],["593","Ecuador","🇪🇨"],
    ["1","Estados Unidos","🇺🇸"],["507","Panamá","🇵🇦"],["34","España","🇪🇸"],["58","Venezuela","🇻🇪"],["502","Guatemala","🇬🇹"],["506","Costa Rica","🇨🇷"],
    ["598","Uruguay","🇺🇾"],["591","Bolivia","🇧🇴"],["595","Paraguay","🇵🇾"],["503","El Salvador","🇸🇻"],["504","Honduras","🇭🇳"],["505","Nicaragua","🇳🇮"],["1-do","Rep. Dominicana","🇩🇴"],
  ];

  let D = {promo:null, programs:[], waNumber:"", pixelId:""};
  const PN = () => (D.promo && D.promo.name) || "la promoción";
  const state = {program: ""};

  /* ================= Datos ================= */
  async function load(){
    const headers = {};
    const slug = (location.pathname.match(/^\/promo\/([a-z0-9-]+)/i) || [])[1] || "";
    let url = "/api/promo/active" + (slug ? "?slug=" + encodeURIComponent(slug) : "");
    if(new URLSearchParams(location.search).get("preview") === "1"){
      try{
        const a = JSON.parse(localStorage.getItem("innovafit_admin_auth") || "null");
        if(a && a.token){ headers.Authorization = a.token; url += (url.includes("?") ? "&" : "?") + "preview=1"; }
      }catch{}
    }
    try{
      const r = await fetch(url, {headers});
      if(r.ok) D = await r.json();
    }catch{}
  }

  /* ================= Fechas ================= */
  const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  function fmtRange(s, e){
    if(!s && !e) return "";
    if(s && e){
      if(s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return "Del " + s.getDate() + " al " + e.getDate() + " de " + MONTHS[e.getMonth()];
      return "Del " + s.getDate() + " de " + MONTHS[s.getMonth()] + " al " + e.getDate() + " de " + MONTHS[e.getMonth()];
    }
    if(e) return "Hasta el " + e.getDate() + " de " + MONTHS[e.getMonth()];
    return "Desde el " + s.getDate() + " de " + MONTHS[s.getMonth()];
  }
  const fmtLong = (d) => d.getDate() + " de " + MONTHS[d.getMonth()] + " de " + d.getFullYear() + ", " + d.toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"});

  function countdown(el, target, onEnd){
    const units = [["d","días"],["h","horas"],["m","min"],["s","seg"]];
    el.hidden = false;
    el.setAttribute("role", "timer");
    el.innerHTML = units.map(([k, l]) => `<span class="u"><b data-u="${k}">00</b><small>${l}</small></span>`).join("");
    const cells = Object.fromEntries(units.map(([k]) => [k, el.querySelector(`[data-u="${k}"]`)]));
    let id = 0;
    const tick = () => {
      const left = Math.max(0, target - Date.now());
      const t = Math.floor(left / 1000);
      const v = {d: Math.floor(t / 86400), h: Math.floor(t / 3600) % 24, m: Math.floor(t / 60) % 60, s: t % 60};
      for(const k in v){
        const txt = pad2(v[k]);
        if(cells[k].textContent !== txt){ cells[k].textContent = txt; cells[k].classList.remove("flip"); void cells[k].offsetWidth; cells[k].classList.add("flip"); }
      }
      el.setAttribute("aria-label", `Faltan ${v.d} días, ${v.h} horas y ${v.m} minutos`);
      if(!left){ clearInterval(id); onEnd && onEnd(); }
    };
    tick();
    id = setInterval(tick, 1000);
  }

  /* ================= WhatsApp ================= */
  const waUrl = (text) => "https://wa.me/" + String(D.waNumber || "").replace(/\D/g, "") + (text ? "?text=" + encodeURIComponent(text) : "");
  function wireWhatsApp(){
    const base = "Hola InnovaFit 👋 Vi la promoción " + PN() + " y quiero más información.";
    $$("[data-contact]").forEach((a) => {
      if(!a.dataset.custom) a.href = waUrl(base);
      a.addEventListener("click", () => T.contact(a.dataset.contact));
    });
  }

  /* ================= Render ================= */
  const NUM = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let PACK = "Certificación Internacional 5×1";

  function render(){
    const p = D.promo;
    const progs = D.programs || [];
    const s = p && pbDate(p.startsAt), e = p && pbDate(p.endsAt);
    const range = fmtRange(s, e);
    const status = p ? p.status : "programada";
    const pack = (p && p.pack) || {};
    const cur = (p && p.currency) || "USD";

    // El paquete es siempre la Certificación Internacional 5×1 (cinco formaciones).
    PACK = pack.name || "Certificación Internacional 5×1";
    $$("[data-pack]").forEach((el) => { el.textContent = PACK; });
    // Barra superior
    $("#stripTitle").textContent = (p && p.bannerTitle) || "PROMOCIONES INNOVAFIT";
    $("#stripDates").textContent = range ? range + "." : status === "activa" ? "Promoción vigente." : status === "finalizada" ? "Promoción finalizada." : "Fechas por anunciar.";
    $("#stripOffer").textContent = PACK + ": cinco formaciones en un solo paquete" + (pack.pct ? ", con " + pack.pct + "% de descuento." : ".");

    // Nombre de la promoción en los textos
    const isBF = p && /black\s*friday|buen\s*fin/i.test(p.name);
    if(p){
      document.title = PACK + " · " + p.name + " | InnovaFit by ISSA";
      $("#promoEyebrow").textContent = "Promoción especial · " + p.name;
      $("#buyLead").textContent = isBF ? "Este Black Friday," : "Con " + p.name + ",";
      $("#finalPromo").textContent = isBF ? "la promoción especial de Black Friday" : "la promoción especial " + p.name;
      $("#doneName2").textContent = p.name;
    }
    $("#mbarText").textContent = pack.pct ? pack.pct + "% de descuento en el paquete." : "Cinco formaciones en un paquete.";

    // Bloque de la oferta: precio del paquete (lo carga el admin; si falta, no se inventa)
    if(pack.price){
      $("#priceNow").textContent = money(pack.price, cur);
      $("#priceNowLbl").textContent = "Precio especial" + (isBF ? " Black Friday" : "");
    }else{
      $("#priceNow").classList.add("ask");
    }
    if(pack.priceBefore && pack.price) $("#priceBefore").textContent = money(pack.priceBefore, cur);
    else $("#priceBeforeRow").hidden = true;
    if(pack.pct){ $("#priceOff").hidden = false; $("#priceOff").textContent = pack.pct + "% de descuento"; }

    const heroStatus = $("#heroStatus"), clock = $("#heroClock"), vt = $("#validityText");
    if(!p){
      vt.textContent = "Vigencia por anunciar.";
    }else if(status === "activa"){
      heroStatus.textContent = "Para entrenadores personales · " + (p.bannerTitle || p.name);
      vt.textContent = e ? "Promoción válida hasta el " + fmtLong(e) + "." : "Promoción vigente.";
      if(e) countdown(clock, e, () => location.reload());
    }else if(status === "programada"){
      heroStatus.textContent = "Para entrenadores personales · " + (p.bannerTitle || p.name) + " muy pronto";
      vt.textContent = s ? "La promoción comienza el " + fmtLong(s) + "." : "Vigencia por anunciar.";
      if(s) countdown(clock, s, () => location.reload());
    }else{
      vt.textContent = "Esta promoción ya terminó. Déjanos tus datos y te avisamos de la próxima.";
    }

    renderPrograms(progs);
    renderSelects(progs);
    renderBacking(progs, p);
    renderFaq(p, e, status);

    $("#condText").textContent = (p && p.conditions) || ("Promoción " + (range ? range.toLowerCase() : status === "activa" ? "vigente" : "con fechas por anunciar") + ". Las condiciones de inscripción y pago, los requisitos y las certificaciones o acreditaciones dependen de cada programa y se confirman antes de inscribirte.");

    // Compra según estado
    const buy = $("#buyBtn");
    if(status !== "activa"){
      buy.textContent = status === "finalizada" ? "Avísame de la próxima promoción" : "Avísame cuando empiece";
      buy.dataset.mode = "notify";
      $("#buyNote").textContent = status === "finalizada" ? "La compra con descuento ya cerró." : "La compra se habilita al iniciar la promoción.";
    }else if(!p.checkout){
      $("#buyNote").textContent = "Al continuar, un asesor te envía tu enlace de pago por WhatsApp.";
    }

    if(D.preview){
      const b = document.createElement("div");
      b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:130;padding:8px 12px;border-radius:10px;background:#f2c14e;color:#1a1100;font:700 12px var(--mono);letter-spacing:.08em;text-transform:uppercase";
      b.textContent = "Vista previa del equipo · " + status;
      document.body.appendChild(b);
    }

    wireWhatsApp();
    T.initPixel(D.pixelId);
  }

  // Bloque 4: una tarjeta por formación con su nombre oficial (Admin → Certificaciones) y su temario.
  function renderPrograms(progs){
    const track = $("#programsTrack");
    if(!progs.length){
      track.innerHTML = Array.from({length:5}, (_, i) => `<article class="pcard pending"><div class="pcard-img"><span class="ph">${i + 1}</span></div><div class="pcard-body"><span class="pcard-kind">Formación ${i + 1}</span><h3>Por anunciar</h3><p class="pending-note">InnovaFit publica aquí el nombre oficial y el temario.</p></div></article>`).join("");
      return;
    }
    // El paquete es de cinco: si todavía falta cargar alguna, se muestra su lugar sin inventar el nombre.
    const total = Math.max(5, progs.length);
    const missing = Array.from({length: total - progs.length}, (_, k) => progs.length + k);
    track.innerHTML = progs.map((pr, i) => `
      <article class="pcard${pr.summary ? "" : " pending"}" data-id="${esc(pr.id)}">
        <div class="pcard-img">
          ${pr.image ? `<img src="${esc(pr.image)}" alt="" loading="lazy" decoding="async">` : `<span class="ph">${i + 1}</span>`}
          <span class="pcard-num">${pad2(i + 1)} / ${pad2(total)}</span>
        </div>
        <div class="pcard-body">
          <span class="pcard-kind">Formación ${i + 1}${KIND[pr.kind] ? " · " + esc(KIND[pr.kind]) : ""}</span>
          <h3>${esc(pr.title)}</h3>
          ${pr.summary ? `<p>${esc(pr.summary)}</p>` : `<p class="pending-note">Descripción y temario oficiales en preparación.</p>`}
          ${pr.highlights.length ? `<div class="chips">${pr.highlights.slice(0, 3).map((h) => `<span>${esc(h)}</span>`).join("")}</div>` : ""}
          ${pr.accreditation ? `<p class="pcard-acc">${esc(pr.accreditation)}</p>` : ""}
          <button class="btn btn-line btn-sm" type="button" data-syllabus="${esc(pr.id)}">Ver temario</button>
        </div>
      </article>`).join("") + missing.map((i) => `<article class="pcard pending"><div class="pcard-img"><span class="ph">${i + 1}</span><span class="pcard-num">${pad2(i + 1)} / ${pad2(total)}</span></div><div class="pcard-body"><span class="pcard-kind">Formación ${i + 1}</span><h3>Por confirmar</h3><p class="pending-note">InnovaFit publica aquí el nombre oficial y el temario de esta formación.</p></div></article>`).join("");
  }

  function renderSelects(progs){
    const opts = progs.map((pr) => `<option value="${esc(pr.id)}">${esc(pr.title)}</option>`).join("");
    $("#programSelect").innerHTML = `<option value="">${esc(PACK)} (paquete)</option>` + opts;
    $("#coProgram").innerHTML = `<option value="">${esc(PACK)} (paquete)</option>` + opts;
    const cc = COUNTRIES.map(([c, n, f]) => `<option value="${c}" data-name="${esc(n)}">${f} ${esc(n)} +${c.replace(/-.*/, "")}</option>`).join("");
    $("#ccSelect").innerHTML = cc;
    $("#coCc").innerHTML = cc;
  }

  function modulesHtml(pr){
    if(!pr.modules.length) return `<div class="syl-empty">El temario oficial de este programa se publica aquí en cuanto InnovaFit lo valide.</div>`;
    return `<div class="mods">${pr.modules.map((m, i) => `<details class="mod"${i === 0 ? " open" : ""}><summary><span class="n">${pad2(i + 1)}</span>${esc(m.title)}</summary>
      ${m.topics.length ? `<ul>${m.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</details>`).join("")}</div>`;
  }

  function sideHtml(pr){
    return `<p class="pcard-kind">${esc(KIND[pr.kind] || "Formación")} · incluida en ${esc(PACK)}</p>
      <h3 id="sheetTitle">${esc(pr.title)}</h3>
      ${pr.objective ? `<h4>Objetivo</h4><p>${esc(pr.objective)}</p>` : pr.summary ? `<p>${esc(pr.summary)}</p>` : ""}
      ${pr.profile ? `<h4>Competencias</h4><p>${esc(pr.profile)}</p>` : ""}
      ${pr.audience.length ? `<h4>Para quién es</h4><ul>${pr.audience.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      ${pr.resources.length ? `<h4>Incluye</h4><ul>${pr.resources.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      ${pr.accreditation ? `<p class="accr-note">${esc(pr.accreditation)}</p>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${pr.brochure ? `<a class="btn btn-line btn-sm" href="${esc(pr.brochure)}" target="_blank" rel="noopener" download>Descargar temario PDF</a>` : ""}
        <a class="btn btn-gold btn-sm" href="#promocion" data-close-go>Ver la promoción del paquete</a>
      </div>`;
  }

  function renderBacking(progs, p){
    if(p && p.institutional) $("#institutional").textContent = p.institutional;
    // Cada acreditación solo junto al programa que la tiene.
    const withAccr = progs.filter((pr) => pr.accreditation);
    $("#accrList").innerHTML = withAccr.map((pr) => `<li><div><b>${esc(pr.title)}</b><span>${esc(pr.accreditation)}</span></div></li>`).join("");
  }

  function renderFaq(p, e, status){
    let list = (p && p.faq) || [];
    if(!list.length){
      const until = e ? "Hasta el " + fmtLong(e) + ", según sus condiciones comerciales."
        : status === "activa" ? "Está vigente según sus condiciones comerciales. Si se anuncia una fecha de cierre, la verás aquí."
        : "Las fechas se publican aquí en cuanto se confirmen.";
      list = [
        {q: "¿Qué incluye la " + PACK + "?", a: "Cinco programas de formación en un solo paquete. Los contenidos de cada uno están en su temario."},
        {q: "¿Necesito experiencia previa como entrenador?", a: "Depende de cada programa. Consulta las condiciones de admisión para conocer el perfil recomendado."},
        {q: "¿Cómo conozco los contenidos de cada formación?", a: "Con el botón «Ver temario» de cada programa, antes de inscribirte."},
        {q: "¿Cómo me inscribo?", a: "Haz clic en el botón de inscripción y sigue los pasos de compra, o escríbenos por WhatsApp para recibir asesoría."},
        {q: "¿Hasta cuándo está disponible la promoción?", a: until},
      ];
    }
    $("#faqList").innerHTML = list.map((f) => `<details class="qa"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`).join("");
  }

  /* ================= Interacción ================= */
  function openSyllabus(id){
    const pr = (D.programs || []).find((x) => x.id === id);
    if(!pr) return;
    $("#sheetBody").innerHTML = `${pr.imageFull ? `<div class="sheet-hero" style="background-image:url('${esc(pr.imageFull)}')"></div>` : ""}
      <div class="panel" style="grid-template-columns:1fr">${`<div>${sideHtml(pr, true)}</div>`}<div><h4 class="eyebrow" style="margin-top:6px">Temario</h4>${modulesHtml(pr)}</div></div>`;
    $("#sheet").showModal();
    T.track("ViewContent", {content_name: pr.title, content_ids: [pr.id], content_type: "product"}, "vc-" + pr.id + "-" + T.uuid(), "vc-" + pr.id);
  }

  function pickProgram(id){
    state.program = id || "";
    $("#programSelect").value = state.program;
    $("#coProgram").value = state.program;
  }

  // Bloque 7 (y botones de apoyo): solicitud de inscripción en un diálogo, sin salir de la sección.
  function openInscribe(){
    $("#programSelect").value = state.program;
    $$("dialog[open]").forEach((d) => d.close());
    $("#inscribe").showModal();
    if(window.gsap && !reduce && !$("#leadForm").hidden) gsap.from("#leadForm > *", {y: 18, opacity: 0, stagger: .03, duration: .5, ease: "power3.out", clearProps: "all"});
  }

  function bindUi(){
    document.addEventListener("click", (e) => {
      const syl = e.target.closest("[data-syllabus]");
      if(syl){ openSyllabus(syl.dataset.syllabus); return; }
      const ins = e.target.closest("[data-inscribe]");
      if(ins){ e.preventDefault(); openInscribe(); return; }
      if(e.target.closest("[data-close]")){ e.target.closest("dialog").close(); return; }
      const legal = e.target.closest("[data-open]");
      if(legal){ e.preventDefault(); openLegal(legal.dataset.open); return; }
      // Clic en el fondo del diálogo lo cierra
      if(e.target.tagName === "DIALOG") e.target.close();
    });

    // Menú móvil
    const burger = $("#burger"), menu = $("#menu");
    burger.onclick = () => { const open = burger.getAttribute("aria-expanded") !== "true"; burger.setAttribute("aria-expanded", open); menu.classList.toggle("open", open); };
    menu.addEventListener("click", (e) => { if(e.target.closest("a")){ burger.setAttribute("aria-expanded", "false"); menu.classList.remove("open"); } });

    $("#buyBtn").onclick = () => {
      if($("#buyBtn").dataset.mode === "notify"){ openInscribe(); return; }
      $("#coProgram").value = state.program;
      $("#checkout").showModal();
    };
    $("#programSelect").onchange = (e) => { state.program = e.target.value; };

    bindLeadForm();
    bindCheckout();
  }
  function openLegal(kind){
    const p = D.promo;
    $("#legalBody").innerHTML = kind === "privacy"
      ? `<p class="eyebrow">Aviso de privacidad</p><h3>Tus datos</h3><p class="muted">Usamos los datos que nos dejas (nombre, WhatsApp, correo, país, ciudad y programa de interés) para contactarte sobre esta promoción, procesar tu inscripción y darte acceso a tu programa. Para consultar, corregir o eliminar tus datos, escríbenos por WhatsApp.</p><p class="muted">Responsable: InnovaFit by ISSA.</p>`
      : `<p class="eyebrow">Términos</p><h3>Condiciones de la promoción</h3><p class="muted" style="white-space:pre-line">${esc((p && p.conditions) || "Las condiciones de la promoción se publican en la sección «Vigencia y condiciones».")}</p>`;
    $("#legal").showModal();
  }

  /* ---------- Formularios ---------- */
  function readForm(form){
    const f = new FormData(form);
    const o = Object.fromEntries(f.entries());
    const opt = form.querySelector("[name=country]").selectedOptions[0];
    o.country = String(o.country || "").replace(/-.*/, "");
    o.consent = !!form.querySelector("[name=consent]").checked;
    if(!o.countryName && opt) o.countryName = opt.dataset.name || "";
    return o;
  }
  function check(form, o, full){
    $$(".bad", form).forEach((x) => x.classList.remove("bad"));
    const bad = (name, msg) => { const el = form.querySelector(`[name=${name}]`); el && el.classList.add("bad"); el && el.focus(); return msg; };
    if(!o.name || o.name.trim().length < 5 || !o.name.trim().includes(" ")) return bad("name", "Escribe tu nombre y apellido completos.");
    if(String(o.phone || "").replace(/\D/g, "").length < 7) return bad("phone", "Revisa tu número de WhatsApp.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(o.email || "")) return bad("email", "Revisa tu correo.");
    if(full && (!o.countryName || !o.city)) return bad(o.countryName ? "city" : "countryName", "Cuéntanos tu país y ciudad.");
    if(full && !o.isTrainer) return "Cuéntanos si ya trabajas como entrenador.";
    if(!o.consent) return "Para continuar, acepta el aviso de privacidad.";
    return null;
  }
  async function post(url, body){
    const r = await fetch(url, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)});
    const data = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(data.message || "No pudimos enviar tus datos. Intenta de nuevo.");
    return data;
  }
  const remember = (o) => { try{ sessionStorage.setItem("if_contact", JSON.stringify({name:o.name, email:o.email, phone:o.phone, country:o.country})); }catch{} };

  function bindLeadForm(){
    const form = $("#leadForm"), err = $("#formErr"), btn = $("#leadBtn");
    let eventId = "lead-" + T.uuid(); // el mismo id en reintentos: el servidor y Meta no duplican
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const o = readForm(form);
      err.textContent = check(form, o, true) || "";
      if(err.textContent) return;
      btn.disabled = true;
      btn.textContent = "Enviando…";
      try{
        const progTitle = form.querySelector("[name=program]").selectedOptions[0].textContent.replace(/ · -\d+%$/, "");
        const res = await post("/api/promo/leads", {...o, programTitle: progTitle, eventId, promotion: D.promo && D.promo.id, ...T.context()});
        if(!res.duplicate) T.track("Lead", {content_name: progTitle}, res.eventId, res.eventId);
        remember(o);
        const first = o.name.trim().split(/\s+/)[0];
        $("#doneName").textContent = first;
        const wa = $("#doneWa");
        wa.dataset.custom = "1";
        wa.href = waUrl("Hola InnovaFit 👋 Soy " + o.name.trim() + ". Acabo de dejar mis datos en la landing de " + PN() + " y me interesa: " + progTitle + ".");
        form.hidden = true;
        $("#leadDone").hidden = false;
        if(window.gsap && !reduce) gsap.from("#leadDone > *", {y:24, opacity:0, stagger:.08, duration:.6, ease:"expo.out"});
        burst($("#routeInfo"));
        eventId = "lead-" + T.uuid();
      }catch(ex){
        err.textContent = ex.message;
      }finally{
        btn.disabled = false;
        btn.textContent = "Solicitar mi inscripción";
      }
    });
  }

  function bindCheckout(){
    const form = $("#coForm"), err = $("#coErr"), btn = $("#coBtn");
    $("#checkout").addEventListener("close", () => { err.textContent = ""; });
    // Si ya dejó sus datos en el formulario, no se los volvemos a pedir.
    $("#buyBtn").addEventListener("click", () => {
      try{
        const c = JSON.parse(sessionStorage.getItem("if_contact") || "null");
        const el = (n) => form.elements.namedItem(n);
        if(c){ el("name").value ||= c.name; el("email").value ||= c.email; el("phone").value ||= c.phone; if(c.country) el("country").value = c.country; }
      }catch{}
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const o = readForm(form);
      err.textContent = check(form, o, false) || "";
      if(err.textContent) return;
      btn.disabled = true;
      btn.textContent = "Preparando tu compra…";
      try{
        const progTitle = form.elements.namedItem("program").selectedOptions[0].textContent.replace(/ · -\d+%$/, "");
        const res = await post("/api/promo/checkout", {...o, promotion: D.promo && D.promo.id, ...T.context()});
        T.track("InitiateCheckout", {content_name: progTitle, content_ids: o.program ? [o.program] : undefined, value: res.value || undefined, currency: res.currency}, res.eventId, res.eventId);
        remember(o);
        try{ localStorage.setItem("if_last_order", res.id); }catch{}
        const go = res.url || waUrl("Hola InnovaFit 👋 Soy " + o.name.trim() + " y quiero comprar " + progTitle + " con la promoción " + PN() + ". Mi folio es " + res.id + ".");
        if(!res.url) T.contact("checkout-whatsapp");
        setTimeout(() => { location.href = go; }, 350); // da tiempo a que salga el evento del Pixel
      }catch(ex){
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = "Continuar al pago";
      }
    });
  }

  /* ---------- Destellos dorados al enviar ---------- */
  function burst(el){
    if(reduce || !window.gsap) return;
    const r = el.getBoundingClientRect();
    for(let i = 0; i < 26; i++){
      const s = document.createElement("i");
      s.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + 120}px;width:8px;height:8px;border-radius:2px;background:${i % 3 ? "#f2c14e" : "#fff0c2"};z-index:150;pointer-events:none`;
      document.body.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
      gsap.to(s, {x: Math.cos(a) * d, y: Math.sin(a) * d - 60, rotate: Math.random() * 540, opacity:0, duration:1.1 + Math.random() * .6, ease:"expo.out", onComplete: () => s.remove()});
    }
  }

  /* ================= Chispas doradas del hero ================= */
  function sparks(canvas){
    if(reduce) return;
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, raf = 0, visible = true, last = 0;
    const parts = [];
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (init) => {
      const spark = Math.random() < .3;
      parts.push({x: Math.random() * w, y: init ? Math.random() * h : h + 10, vx: (Math.random() - .5) * (spark ? 50 : 14), vy: -(spark ? 110 + Math.random() * 140 : 18 + Math.random() * 46),
        r: spark ? .7 + Math.random() * 1.2 : 1 + Math.random() * 2.4, life: 0, ttl: spark ? 1.2 + Math.random() : 3 + Math.random() * 4, hue: 38 + Math.random() * 14, spark, wob: Math.random() * 6.3});
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - (last || now)) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      const max = Math.min(110, Math.round(w / 12));
      while(parts.length < max) spawn(!last);
      ctx.globalCompositeOperation = "lighter";
      for(let i = parts.length - 1; i >= 0; i--){
        const p = parts[i];
        p.life += dt;
        if(p.life > p.ttl || p.y < -20){ parts.splice(i, 1); continue; }
        p.wob += dt * 2.4;
        p.x += (p.vx + Math.sin(p.wob) * 10) * dt;
        p.y += p.vy * dt;
        const k = 1 - p.life / p.ttl, a = Math.min(1, p.life * 3) * k;
        if(p.spark){
          ctx.strokeStyle = `hsla(${p.hue},100%,${68 + k * 20}%,${a})`;
          ctx.lineWidth = p.r;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .035, p.y - p.vy * .035); ctx.stroke();
        }else{
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          g.addColorStop(0, `hsla(${p.hue + 6},100%,78%,${a * .9})`);
          g.addColorStop(.45, `hsla(${p.hue},95%,52%,${a * .35})`);
          g.addColorStop(1, "hsla(40,90%,40%,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; cancelAnimationFrame(raf); raf = 0; if(visible){ last = 0; raf = requestAnimationFrame(frame); } }).observe(canvas);
    new ResizeObserver(resize).observe(canvas);
    resize();
  }

  /* ================= Texto partido para las animaciones ================= */
  function splitChars(el){
    const chars = [];
    el.querySelectorAll(".ln > span").forEach((line) => {
      const words = line.textContent.split(" ");
      line.textContent = "";
      words.forEach((w, wi) => {
        const ws = document.createElement("span");
        ws.style.cssText = "display:inline-block;white-space:nowrap";
        [...w].forEach((c) => { const s = document.createElement("span"); s.className = "ch"; s.textContent = c; ws.appendChild(s); chars.push(s); });
        line.appendChild(ws);
        if(wi < words.length - 1) line.appendChild(document.createTextNode(" "));
      });
    });
    return chars;
  }
  // Palabras dentro de una máscara (para los h2). Los <span class="gold-text"> se animan enteros.
  function splitWords(el){
    const out = [];
    const wrap = (node) => {
      const m = document.createElement("span");
      m.style.cssText = "display:inline-block;overflow:hidden;vertical-align:top;padding-block:.06em;margin-block:-.06em";
      const i = document.createElement("span");
      i.style.display = "inline-block";
      m.appendChild(i);
      node.replaceWith(m);
      i.appendChild(node);
      out.push(i);
    };
    [...el.childNodes].forEach((n) => {
      if(n.nodeType === 3){
        const parts = n.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach((p) => {
          if(!p) return;
          if(/^\s+$/.test(p)){ frag.appendChild(document.createTextNode(" ")); return; }
          const t = document.createTextNode(p);
          const holder = document.createElement("span");
          holder.appendChild(t);
          frag.appendChild(holder);
        });
        n.replaceWith(frag);
      }
    });
    // Los <span> con varias palabras se parten en una copia por palabra, así el título corta bien de línea.
    [...el.childNodes].forEach((n) => {
      if(n.nodeType !== 1 || n.children.length || !/\s/.test(n.textContent.trim())) return;
      const frag = document.createDocumentFragment();
      n.textContent.trim().split(/\s+/).forEach((w, i) => {
        if(i) frag.appendChild(document.createTextNode(" "));
        const c = n.cloneNode(false);
        if(i) c.removeAttribute("id");
        c.textContent = w;
        frag.appendChild(c);
      });
      n.replaceWith(frag);
    });
    [...el.childNodes].forEach((n) => { if(n.nodeType === 1 && n.tagName !== "BR") wrap(n); });
    return out;
  }
  function splitPain(el){
    const hot = /^(evaluar|planificar|corregir|adaptar|progresar)$/i;
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w) => `<span class="w${hot.test(w.replace(/[,.]/g, "")) ? " hl" : ""}">${esc(w)}</span>`).join(" ");
    return $$(".w", el);
  }

  /* ================= Scroll suave ================= */
  let lenis = null;
  const hdrH = () => $("#hdr").offsetHeight;
  function scrollToEl(el){
    if(!el) return;
    if(lenis) lenis.scrollTo(el, {offset: -hdrH() + 1, duration: 1.4});
    else window.scrollTo({top: el.getBoundingClientRect().top + scrollY - hdrH(), behavior: reduce ? "auto" : "smooth"});
  }
  function bindAnchors(){
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if(!a || a.dataset.open) return;
      const id = a.getAttribute("href").slice(1);
      const el = id ? document.getElementById(id) : null;
      if(!el && id !== "top") return;
      e.preventDefault();
      // Desde un diálogo (p. ej. el temario): primero se cierra, después se baja.
      const dlg = a.closest("dialog[open]");
      if(dlg){ dlg.close(); setTimeout(() => scrollToEl(el), 60); return; }
      scrollToEl(id === "top" ? document.body : el);
    });
  }

  /* ================= Coreografía de scroll ================= */
  function animate(){
    const gsap = window.gsap, ST = window.ScrollTrigger;
    // Barra de progreso, header y barra móvil funcionan siempre (aunque no haya GSAP).
    const bar = $("#progress"), hdr = $("#hdr"), mbar = $("#mbar");
    let lastY = scrollY;
    const onScroll = () => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
      if(!$("#menu").classList.contains("open")) hdr.classList.toggle("hide", y > lastY && y > 400);
      lastY = y;
      const heroEnd = $("#hero").offsetHeight * .7;
      const near = (sel) => { const r = $(sel).getBoundingClientRect(); return r.top < innerHeight * .8 && r.bottom > 0; };
      const show = y > heroEnd && !near("#promocion") && !near("#inscripcion");
      mbar.classList.toggle("show", show);
      document.body.classList.toggle("mbar-on", show);
    };
    addEventListener("scroll", onScroll, {passive:true});
    onScroll();
    document.documentElement.style.setProperty("--hdr", hdrH() + "px");
    addEventListener("resize", () => document.documentElement.style.setProperty("--hdr", hdrH() + "px"));

    if(!gsap || !ST || reduce){ countStatic(); return; }
    gsap.registerPlugin(ST);
    ST.config({ignoreMobileResize: true});

    if(window.Lenis){
      lenis = new Lenis({lerp: .09, smoothWheel: true, wheelMultiplier: 1});
      lenis.on("scroll", ST.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      document.querySelectorAll("dialog").forEach((d) => {
        new MutationObserver(() => (d.open ? lenis.stop() : lenis.start())).observe(d, {attributes: true, attributeFilter: ["open"]});
      });
    }

    /* --- Intro del hero --- */
    const chars = splitChars($("#heroTitle"));
    // La línea dorada: cada letra muestra su porción del mismo degradado, así se ve continuo.
    const goldLine = $("#heroTitle .gold");
    const paintGold = () => {
      // offsetLeft ignora los transforms de la animación (ambos miden contra .hero, que es position:relative).
      const w = goldLine.offsetWidth;
      goldLine.querySelectorAll(".ch").forEach((ch) => {
        ch.style.backgroundSize = w + "px 100%";
        ch.style.backgroundPosition = (goldLine.offsetLeft - ch.offsetLeft) + "px 0";
      });
    };
    goldLine.classList.add("split");
    paintGold();
    addEventListener("resize", paintGold);
    document.fonts && document.fonts.ready.then(paintGold);
    const intro = gsap.timeline({defaults: {ease: "expo.out"}});
    intro.from(".strip", {yPercent: -100, duration: .8})
      .from(".nav", {yPercent: -60, opacity: 0, duration: .8}, "<.1")
      .from(chars, {yPercent: 120, rotate: 10, opacity: 0, duration: 1.1, stagger: Math.min(.022, 1.3 / chars.length)}, "<.1")
      .from(".hero-eyebrow", {y: 20, opacity: 0, duration: .8}, "<.2")
      .from([".hero-sub", ".hero-qs li", ".hero-ctas .btn"], {y: 30, opacity: 0, duration: .9, stagger: .06}, "<.35")
      .from(".hv-plate", {scale: .6, opacity: 0, duration: 1.4}, .3)
      .from(".hv-img", {clipPath: "circle(0% at 50% 60%)", scale: 1.15, duration: 1.6, ease: "expo.inOut"}, .35)
      .from(".hv-badge", {scale: 0, opacity: 0, duration: .9, stagger: .12, ease: "back.out(2)"}, 1.1)
      .from(".hero-bigpct span", {yPercent: 40, opacity: 0, duration: 1.8}, .2)
      .from(".hero-ring", {scale: .4, opacity: 0, duration: 2}, 0);

    // Insignias flotando
    $$(".hv-badge").forEach((b, i) => gsap.to(b, {y: i % 2 ? 10 : -12, duration: 2.4 + i * .4, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 1.6}));

    // Salida del hero con el scroll: la copia sube y se desvanece, el porcentaje gigante crece.
    gsap.timeline({scrollTrigger: {trigger: "#hero", start: "top top", end: "bottom top", scrub: true}})
      .to(".hero-copy", {y: -140, opacity: 0, ease: "none"}, 0)
      .to(".hero-visual", {y: -60, scale: 1.08, ease: "none"}, 0)
      .to(".hero-bigpct span", {yPercent: -30, scale: 1.25, opacity: .4, ease: "none"}, 0)
      .to(".hero-ring", {scale: 1.4, opacity: 0, ease: "none"}, 0)
      .to(".hero-glow", {opacity: 0, ease: "none"}, 0);

    // Parallax con el mouse (solo con puntero fino)
    if(matchMedia("(pointer:fine)").matches){
      const qx = gsap.quickTo(".hv-img", "x", {duration: .8, ease: "power3"}), qy = gsap.quickTo(".hv-img", "y", {duration: .8, ease: "power3"});
      const bx = gsap.quickTo(".hv-badge", "x", {duration: 1, ease: "power3"});
      const px = gsap.quickTo(".hero-bigpct span", "x", {duration: 1.2, ease: "power3"});
      $("#hero").addEventListener("pointermove", (e) => {
        const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
        qx(nx * 18); qy(ny * 12); bx(nx * -26); px(nx * -40);
      });
    }

    /* --- Cinta: avanza sola, acelera e inclina con la velocidad del scroll --- */
    const track = $("#marquee");
    const phrase = [PACK, "5 formaciones", "1 solo paquete", ...((D.promo && D.promo.bannerTitle) || PN()).split("/").map((s) => s.trim()).filter(Boolean), "Certificación ISSA", "100% online"];
    track.innerHTML = Array(4).fill(phrase.map((p) => `<span>${p}</span>`).join("")).join("");
    const loop = gsap.to(track, {xPercent: -50, duration: 28, ease: "none", repeat: -1});
    let dir = 1;
    ST.create({onUpdate: (self) => {
      const v = self.getVelocity();
      dir = self.direction;
      gsap.to(loop, {timeScale: dir * (1 + Math.min(4, Math.abs(v) / 400)), duration: .3, overwrite: true});
      gsap.to(".marquee", {skewX: gsap.utils.clamp(-8, 8, v / -300), duration: .4, overwrite: true});
      clearTimeout(track._t);
      track._t = setTimeout(() => { gsap.to(loop, {timeScale: dir, duration: 1}); gsap.to(".marquee", {skewX: 0, duration: .8}); }, 120);
    }});

    /* --- Títulos de sección: palabras que suben desde una máscara --- */
    $$("section h2").forEach((h) => {
      if(h.closest(".hero") || h.id === "painTitle") return;
      const words = splitWords(h);
      gsap.from(words, {yPercent: 110, rotate: 4, duration: 1, ease: "expo.out", stagger: .05, scrollTrigger: {trigger: h, start: "top 85%"}});
    });
    $$(".eyebrow:not(.hero-eyebrow), .lead").forEach((el) => gsap.from(el, {y: 24, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: {trigger: el, start: "top 90%"}}));

    const mm = gsap.matchMedia();

    // Las secciones fijadas se crean en el orden de la página: cada una mide su inicio contando el espacio de las anteriores.
    /* --- Los 10 problemas: escenario fijado. Cada problema entra con su número gigante que se llena de oro,
           y al seguir bajando estalla hacia la cámara mientras un barrido dorado trae el siguiente. --- */
    const stage = $("#pstage"), slides = $$(".pslide", stage);
    if(stage && slides.length){
      stage.classList.add("is-live");
      const parts = slides.map((s) => ({s, n: s.querySelector(".pslide-n"), t: s.querySelectorAll(".pslide-txt > *"), need: s.querySelector(".need")}));
      // Estados explícitos (fromTo) para que el scroll pueda saltar hacia adelante o atrás sin que nada quede a medias.
      const N_IN = {yPercent: 70, scale: .3, rotate: 16, opacity: 0, filter: "blur(22px)"}, N_ON = {yPercent: 0, xPercent: 0, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)"};
      gsap.set(slides.slice(1), {autoAlpha: 0});
      parts.forEach((p) => gsap.set(p.n, {"--fill": "0%"}));
      const wipe = $(".pstage-wipe", stage), flash = $(".pstage-flash", stage);
      const tl = gsap.timeline({defaults: {ease: "power3.out"}, scrollTrigger: {
        trigger: stage, start: "top top", end: () => "+=" + innerHeight * slides.length * .85, pin: true, scrub: .7, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => {
          const i = Math.min(slides.length - 1, Math.round(self.progress * (slides.length - 1)));
          $("#pIdx").textContent = pad2(i + 1);
          $("#pBar").style.transform = "scaleX(" + Math.max(.1, (i + 1) / slides.length) + ")";
        },
      }});
      // Entrada del primero (mientras el escenario se fija)
      gsap.from(parts[0].n, {yPercent: 50, scale: .4, rotate: -10, opacity: 0, filter: "blur(18px)", duration: 1.3, ease: "expo.out", scrollTrigger: {trigger: stage, start: "top 75%"}});
      gsap.from(parts[0].t, {y: 70, opacity: 0, stagger: .1, duration: 1, ease: "expo.out", scrollTrigger: {trigger: stage, start: "top 65%"}});
      parts.forEach((p, i) => {
        tl.addLabel("s" + i);
        // Lectura: el número se llena de oro y respira
        tl.fromTo(p.n, {"--fill": "0%", scale: 1}, {"--fill": "100%", scale: 1.06, duration: 1, ease: "none", immediateRender: false});
        if(i === parts.length - 1) return;
        const q = parts[i + 1];
        const at = "x" + i;
        tl.addLabel(at);
        // Salida: el número estalla hacia la cámara, el texto sube y se borra
        tl.fromTo(p.n, {...N_ON, scale: 1.06}, {scale: 2.8, xPercent: -18, rotate: -8, opacity: 0, filter: "blur(16px)", duration: .9, ease: "power2.in", immediateRender: false}, at)
          .fromTo(p.t, {y: 0, opacity: 1}, {y: -90, opacity: 0, stagger: .05, duration: .6, ease: "power2.in", immediateRender: false}, at)
          // Barrido dorado de lado a lado + destello
          .fromTo(wipe, {clipPath: "inset(0 100% 0 0)"}, {clipPath: "inset(0 0% 0 0)", duration: .45, ease: "power2.in"}, at + "+=.35")
          .set(p.s, {autoAlpha: 0})
          .set(q.s, {autoAlpha: 1})
          .to(wipe, {clipPath: "inset(0 0 0 100%)", duration: .5, ease: "power2.out"})
          .fromTo(flash, {opacity: 0}, {opacity: 1, duration: .15, ease: "none"}, "<")
          .to(flash, {opacity: 0, duration: .5, ease: "power1.out"})
          // Entrada del siguiente: el número cae girando desde abajo, el texto sube línea por línea
          .fromTo(q.n, N_IN, {...N_ON, duration: 1, ease: "expo.out", immediateRender: false}, "<-.4")
          .fromTo(q.t, {y: 90, opacity: 0}, {y: 0, opacity: 1, stagger: .09, duration: .8, ease: "expo.out", immediateRender: false}, "<.1")
          .fromTo(q.need, {scaleX: 0}, {scaleX: 1, duration: .7, ease: "expo.out", immediateRender: false}, "<.15");
      });
      tl.addLabel("end");
    }
    /* --- Cierre del bloque 2: las palabras se encienden una por una --- */
    const words = splitPain($("#painTitle"));
    mm.add("(min-width: 981px)", () => {
      gsap.timeline({scrollTrigger: {trigger: "#painPin", start: "top top", end: "+=110%", pin: true, scrub: .6, anticipatePin: 1}})
        .to(words, {opacity: 1, stagger: .1, ease: "none"}, 0)
        .from("#painPin > :not(h2)", {y: 40, opacity: 0, stagger: .2, ease: "power3.out", duration: words.length * .1 * .4});
    });
    mm.add("(max-width: 980px)", () => {
      gsap.to(words, {opacity: 1, stagger: .1, ease: "none", scrollTrigger: {trigger: "#painTitle", start: "top 80%", end: "bottom 40%", scrub: true}});
    });

    /* --- Programas: carrusel horizontal fijado con tarjetas que giran en 3D (escritorio) --- */
    mm.add("(min-width: 981px)", () => {
      const pin = $("#programsPin"), tr = $("#programsTrack");
      const dist = () => Math.max(0, tr.scrollWidth - (innerWidth - tr.getBoundingClientRect().left) + 40);
      const tween = gsap.to(tr, {x: () => -dist(), ease: "none", scrollTrigger: {
        trigger: pin, start: "top top", end: () => "+=" + (dist() + innerHeight * .4), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (self) => {
          const n = $$(".pcard", tr).length || 5;
          $("#progBar").style.transform = "scaleX(" + Math.max(1 / n, self.progress) + ")";
          $("#progIdx").textContent = pad2(Math.min(n, 1 + Math.floor(self.progress * n * .999)));
        },
      }});
      $$(".pcard", tr).forEach((card) => {
        gsap.fromTo(card, {rotateY: -28, z: -160, opacity: .35, filter: "brightness(.6)"},
          {rotateY: 0, z: 0, opacity: 1, filter: "brightness(1)", ease: "none", scrollTrigger: {trigger: card, containerAnimation: tween, start: "left 100%", end: "left 45%", scrub: true}});
        gsap.to(card.querySelector(".pcard-img img"), {xPercent: -8, ease: "none", scrollTrigger: {trigger: card, containerAnimation: tween, start: "left right", end: "right left", scrub: true}});
      });
      gsap.from(".programs-head > *", {y: 50, opacity: 0, stagger: .08, duration: 1, ease: "expo.out", scrollTrigger: {trigger: pin, start: "top 70%"}});
    });
    mm.add("(max-width: 980px)", () => {
      gsap.from(".pcard", {y: 60, opacity: 0, rotate: 3, stagger: .1, duration: .9, ease: "expo.out", scrollTrigger: {trigger: "#programsTrack", start: "top 85%"}});
    });

    // Inclinación 3D de las tarjetas con el mouse
    if(matchMedia("(pointer:fine)").matches){
      $$(".pcard").forEach((card) => {
        const rx = gsap.quickTo(card, "rotateX", {duration: .5, ease: "power3"}), ry = gsap.quickTo(card, "rotationY", {duration: .5, ease: "power3"});
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
          card.style.setProperty("--mx", nx * 100 + "%"); card.style.setProperty("--my", ny * 100 + "%");
          rx((.5 - ny) * 8); ry((nx - .5) * 10);
        });
        card.addEventListener("pointerleave", () => { rx(0); ry(0); });
      });
    }

    /* --- Cifras que cuentan --- */
    $$(".stat").forEach((st, i) => {
      const b = st.querySelector("b");
      const to = +b.dataset.count || 0;
      gsap.from(st, {y: 50, opacity: 0, duration: .9, delay: i * .08, ease: "expo.out", scrollTrigger: {trigger: ".stats", start: "top 85%"}});
      if(!to) return;
      const o = {v: 0};
      gsap.to(o, {v: to, duration: 1.8, ease: "power3.out", scrollTrigger: {trigger: ".stats", start: "top 85%"},
        onUpdate: () => { b.textContent = (b.dataset.prefix || "") + o.v.toFixed(+b.dataset.dec || 0) + (b.dataset.suffix || ""); }});
    });

    /* --- Bloque 3: el panel dorado barre la pantalla --- */
    gsap.fromTo("#solution", {clipPath: "inset(0 100% 0 0 round 30px)"}, {clipPath: "inset(0 0% 0 0 round 30px)", ease: "none", scrollTrigger: {trigger: "#solution", start: "top 90%", end: "top 35%", scrub: true}});
    gsap.from("#solution .solution-inner > :not(h2)", {x: 60, opacity: 0, stagger: .1, duration: 1, ease: "expo.out", scrollTrigger: {trigger: "#solution", start: "top 55%"}});

    /* --- Bloque 4: qué obtienes --- */
    gsap.from(".gets > *, .gets-list li", {y: 30, opacity: 0, stagger: .06, duration: .8, ease: "expo.out", scrollTrigger: {trigger: ".gets", start: "top 85%"}});
    /* --- Respaldo: el "ISSA" gigante se llena de oro como un líquido --- */
    const big = $("#issaBig");
    big.style.setProperty("--fill", "0%");
    ST.create({trigger: ".backing", start: "top 75%", end: "center 45%", scrub: true, onUpdate: (s) => big.style.setProperty("--fill", Math.round(s.progress * 100) + "%")});
    gsap.from(".backing-big span", {scale: .8, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: {trigger: ".backing", start: "top 80%"}});
    gsap.from(".accr li", {x: 50, opacity: 0, stagger: .1, duration: .8, ease: "expo.out", scrollTrigger: {trigger: "#accrList", start: "top 90%"}});

    /* --- Bloque 5: la oferta entra desde lados opuestos; el "5×1" crece --- */
    gsap.from(".offer-inc", {x: -80, rotate: -2, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: {trigger: ".offer", start: "top 85%"}});
    gsap.from(".offer-price", {x: 80, rotate: 2, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: {trigger: ".offer", start: "top 85%"}});
    gsap.from(".offer-big", {scale: .5, opacity: 0, duration: 1.4, ease: "back.out(1.6)", scrollTrigger: {trigger: ".offer", start: "top 75%"}});
    gsap.from(".offer-price > *", {y: 24, opacity: 0, stagger: .07, duration: .7, ease: "power3.out", scrollTrigger: {trigger: ".offer-price", start: "top 80%"}});
    gsap.from(".price-off", {scale: 0, rotate: -20, duration: 1, ease: "back.out(2.4)", delay: .5, scrollTrigger: {trigger: ".offer-price", start: "top 80%"}});
    gsap.from(".conditions", {y: 30, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: {trigger: ".conditions", start: "top 92%"}});

    /* --- Bloque 6 --- */
    gsap.from(".backing .quote", {x: 40, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: {trigger: ".backing .quote", start: "top 90%"}});

    /* --- Bloque 7: llamada final --- */
    gsap.from(".final .final-tag, .final .final-btn, .final .fine, .final .btn-wa, .final-brand", {y: 40, opacity: 0, stagger: .1, duration: 1, ease: "expo.out", scrollTrigger: {trigger: ".final-tag", start: "top 90%"}});
    gsap.to(".final-btn", {scale: 1.04, duration: 1.1, yoyo: true, repeat: -1, ease: "sine.inOut", delay: 2});
    /* --- FAQ --- */
    gsap.from(".qa", {y: 30, opacity: 0, stagger: .07, duration: .8, ease: "expo.out", scrollTrigger: {trigger: "#faqList", start: "top 88%"}});
    gsap.from(".ftr-grid > *", {y: 30, opacity: 0, stagger: .1, duration: .8, ease: "power3.out", scrollTrigger: {trigger: ".ftr", start: "top 95%"}});

    /* --- Menú: resalta la sección en pantalla --- */
    [["#problemas", 0], ["#formaciones", 1], ["#promocion", 2], ["#faq", 3]].forEach(([sel, i]) => {
      const link = $$("#menu a:not(.btn)")[i];
      ST.create({trigger: sel, start: "top 50%", end: "bottom 50%", onToggle: (s) => link.classList.toggle("on", s.isActive)});
    });

    /* --- Botones magnéticos --- */
    if(matchMedia("(pointer:fine)").matches){
      $$(".magnetic").forEach((b) => {
        const x = gsap.quickTo(b, "x", {duration: .4, ease: "power3"}), y = gsap.quickTo(b, "y", {duration: .4, ease: "power3"});
        b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(); x((e.clientX - r.left - r.width / 2) * .25); y((e.clientY - r.top - r.height / 2) * .35); });
        b.addEventListener("pointerleave", () => { x(0); y(0); });
      });
    }

    // Recalcular cuando terminan de cargar imágenes y fuentes (cambian las alturas de los pines).
    ST.sort();
    addEventListener("load", () => ST.refresh());
    document.fonts && document.fonts.ready.then(() => ST.refresh());
  }

  function countStatic(){
    $$(".stat b").forEach((b) => { const to = +b.dataset.count; if(to) b.textContent = (b.dataset.prefix || "") + to + (b.dataset.suffix || ""); });
  }

  /* ================= Arranque ================= */
  async function start(){
    sparks($("#sparks"));
    bindAnchors();
    await load();
    render();
    bindUi();
    animate();
    // Si llegó con #ancla en la URL, ir ahí después de armar todo.
    if(location.hash.length > 1){ const el = document.getElementById(location.hash.slice(1)); if(el) setTimeout(() => scrollToEl(el), 300); }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
