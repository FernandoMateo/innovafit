// Medición de la landing de promociones: UTM persistentes, Meta Pixel y eventos sin duplicados.
// Cada evento importante lleva un eventID que el servidor reenvía igual por Conversions API:
// Meta ve el mismo evento por las dos vías y lo cuenta una sola vez.
(function(){
  "use strict";
  const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const KEY = "if_promo_attr";
  const TTL = 30 * 864e5; // 30 días
  const store = {
    get(k){ try{ return JSON.parse(localStorage.getItem(k) || "null"); }catch{ return null; } },
    set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} },
  };

  // Último clic con UTM gana (si el visitante vuelve desde otro anuncio, se actualiza la atribución).
  function capture(){
    const p = new URLSearchParams(location.search);
    const prev = store.get(KEY);
    const fresh = UTM.some((k) => p.get(k));
    const fbclid = p.get("fbclid");
    const now = Date.now();
    let attr = prev && now - prev.ts < TTL ? prev : {utm:{}, ts: now, landingUrl: location.href, referrer: document.referrer};
    if(fresh){
      attr = {utm:{}, ts: now, landingUrl: location.href, referrer: document.referrer, fbc: attr.fbc};
      UTM.forEach((k) => { attr.utm[k] = (p.get(k) || "").slice(0, 200); });
    }
    if(fbclid) attr.fbc = "fb.1." + now + "." + fbclid;
    store.set(KEY, attr);
    return attr;
  }
  const attr = capture();

  const cookie = (n) => (document.cookie.match("(?:^|; )" + n + "=([^;]*)") || [])[1] || "";

  function context(){
    return {
      utm: attr.utm || {},
      landingUrl: attr.landingUrl || location.href,
      referrer: attr.referrer || "",
      fbp: decodeURIComponent(cookie("_fbp")),
      fbc: decodeURIComponent(cookie("_fbc")) || attr.fbc || "",
    };
  }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  let ready = false;
  function initPixel(id){
    if(ready || !id || !/^\d{6,20}$/.test(id)) return;
    ready = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    fbq("init", id);
    fbq("track", "PageView");
    pending.forEach((a) => fbq.apply(null, a));
    pending.length = 0;
  }

  // Eventos que se piden antes de que cargue el Pixel quedan en cola.
  const pending = [];
  const fired = new Set();
  // once: clave para no repetir el mismo evento en esta visita (ViewContent por programa, Lead por envío…).
  function track(name, params, eventId, once){
    if(once){ if(fired.has(once)) return false; fired.add(once); }
    const args = ["track", name, params || {}];
    if(eventId) args.push({eventID: eventId});
    if(window.fbq && ready) fbq.apply(null, args);
    else pending.push(args);
    return true;
  }

  // Contact (WhatsApp): uno cada 3 s como máximo, para que un doble toque no cuente doble.
  let lastContact = 0;
  function contact(where){
    const t = Date.now();
    if(t - lastContact < 3000) return;
    lastContact = t;
    track("Contact", {content_name: where || "whatsapp"}, "ct-" + uuid());
  }

  window.PromoTrack = {initPixel, track, contact, context, uuid};
})();
