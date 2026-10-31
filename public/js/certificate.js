// Certificado InnovaFit: arma el DOM (1200×849), lo muestra escalado y lo descarga como PNG o PDF.
(function(){
  "use strict";

  const W = 1200, H = 849;
  const DIRECTOR_NAME = "Oscar Pizzano";
  const DIRECTOR_ROLE = "Director de Certificaciones · InnovaFit";
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  // Sello de acreditación: el que se sube en Admin → Ajustes, o el de fábrica.
  let sealUrl = "/assets/cert/seal-default.svg";
  function setSeal(url){ if(url) sealUrl = url; }

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function dateShort(iso){
    if(!iso) return "";
    const [y, m, d] = iso.split("-");
    return d + "/" + m + "/" + y;
  }
  function dateLong(iso){
    if(!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return d + " de " + MESES[m - 1] + " de " + y;
  }

  function nameSize(name){
    const n = (name || "").length;
    if(n <= 14) return 64;
    if(n <= 20) return 56;
    if(n <= 26) return 47;
    if(n <= 34) return 39;
    return 31;
  }

  // El nombre va como imagen con degradado (html2canvas no sabe pintar texto con degradado).
  async function nameImage(text){
    const NW = 900, NH = 92, scale = 3;
    const size = nameSize(text);
    try{ await document.fonts.load("800 " + size + "px Mont"); }catch{}
    const c = document.createElement("canvas");
    c.width = NW * scale; c.height = NH * scale;
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 " + size + 'px "Mont", Arial, sans-serif';
    const g = ctx.createLinearGradient(0, 0, NW, 0);
    g.addColorStop(0, "#ff5a00"); g.addColorStop(.45, "#ff8a00"); g.addColorStop(.8, "#ffc933"); g.addColorStop(1, "#ffd866");
    ctx.fillStyle = g;
    ctx.fillText(text || "", NW / 2, NH / 2 + 2, NW - 10);
    return c.toDataURL("image/png");
  }

  function build(d){
    const el = document.createElement("div");
    el.className = "ifc-cert";
    const verify = location.origin + "/verificar?folio=" + encodeURIComponent(d.folio || "");
    const accredited = d.score > 0;
    const desc = accredited
      ? `Por haber acreditado el examen final del curso con una calificación de <b>${esc(d.score)}/100</b>, demostrando los conocimientos y el compromiso que exigen los estándares de calidad de InnovaFit.`
      : "Por haber completado satisfactoriamente todos los requisitos del programa, demostrando compromiso, dedicación y los más altos estándares de calidad de InnovaFit.";
    el.innerHTML = `
      <div class="ifc-lines"></div>
      <div class="ifc-ring r1"></div><div class="ifc-ring r2"></div><div class="ifc-ring r3"></div>
      <div class="ifc-frame"></div>
      <div class="ifc-corner tl"></div><div class="ifc-corner tr"></div><div class="ifc-corner bl"></div><div class="ifc-corner br"></div>
      <div class="ifc-inner">
        <div>
          <img class="ifc-logo" src="/assets/cert/logo-white.png" alt="InnovaFit">
          <div class="ifc-t1">CERTIFICADO</div>
          <div class="ifc-t2">${accredited ? "DE ACREDITACIÓN" : "DE FINALIZACIÓN"}</div>
          <div class="ifc-rule"></div>
        </div>
        <div>
          <div class="ifc-kicker">Se otorga con orgullo el presente reconocimiento a</div>
          <img class="ifc-name" alt="${esc(d.studentName)}">
          <div class="ifc-name-rule"></div>
          <div class="ifc-course-k">${accredited ? "Curso acreditado" : "Programa"}</div>
          <div class="ifc-course">${esc(d.title || "Certificación InnovaFit")}${d.hours ? `<span class="ifc-pill">${esc(d.hours)}</span>` : ""}</div>
          <p class="ifc-desc">${desc}</p>
        </div>
        <div class="ifc-foot">
          <div class="ifc-col"><div class="ifc-val">${esc(dateShort(d.issueDate))}</div><div class="ifc-frule"></div><div class="ifc-label">Fecha de emisión</div></div>
          ${d.docId ? `<div class="ifc-col"><div class="ifc-val">${esc(d.docId)}</div><div class="ifc-frule"></div><div class="ifc-label">Identificación</div></div>` : ""}
          <div class="ifc-col seal"><img class="ifc-seal-img" src="${esc(sealUrl)}" alt="Sello de acreditación InnovaFit"></div>
          <div class="ifc-col sign">
            <img class="ifc-sign" src="/assets/cert/signature-white.png" alt="Firma">
            <div class="ifc-frule"></div>
            <div class="ifc-val">${DIRECTOR_NAME}</div>
            <div class="ifc-label" style="margin-top:2px">${DIRECTOR_ROLE}</div>
          </div>
        </div>
      </div>
      <div class="ifc-folio">N° DE CERTIFICADO: <b>${esc(d.folio || "—")}</b><br>Verificá en ${esc(verify.replace(/^https?:\/\//, ""))}</div>`;
    const img = el.querySelector(".ifc-name");
    const ready = nameImage(d.studentName || "Nombre del Alumno").then((src) => new Promise((res) => { img.onload = res; img.onerror = res; img.src = src; }));
    return {el, ready};
  }

  // Vista previa que se adapta al ancho del contenedor.
  function mount(container, data){
    container.innerHTML = "";
    const fit = document.createElement("div");
    fit.className = "ifc-fit";
    const {el, ready} = build(data);
    fit.appendChild(el);
    container.appendChild(fit);
    const resize = () => { el.style.transform = "scale(" + (fit.clientWidth / W) + ")"; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(fit);
    return {el: fit, ready, destroy: () => ro.disconnect()};
  }

  function loadScript(src){
    return new Promise((res, rej) => {
      if(document.querySelector('script[src="' + src + '"]')) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }

  async function download(data, format){
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    if(format === "pdf") await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;width:" + W + "px;height:" + H + "px;";
    const {el, ready} = build(data);
    host.appendChild(el);
    document.body.appendChild(host);
    try{
      await ready;
      await Promise.all([...el.querySelectorAll("img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })));
      await document.fonts.ready;
      const canvas = await html2canvas(el, {scale:2, backgroundColor:"#0b0b0d", logging:false, width:W, height:H});
      const base = "certificado-innovafit-" + (data.folio || "borrador");
      if(format === "pdf"){
        const pdf = new jspdf.jsPDF({orientation:"landscape", unit:"px", format:[W, H], hotfixes:["px_scaling"]});
        pdf.addImage(canvas.toDataURL("image/jpeg", .95), "JPEG", 0, 0, W, H);
        pdf.save(base + ".pdf");
      }else{
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = base + ".png";
        document.body.appendChild(a); a.click(); a.remove();
      }
    }finally{
      host.remove();
    }
  }

  window.Cert = {build, mount, download, dateLong, dateShort, setSeal};
})();
