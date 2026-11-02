// InnovaSale: descuentos por tiempo limitado que se configuran en Admin → Ajustes → Campaña.
// Lo usan la landing y el campus: estado de la oferta, precio con descuento, cuenta regresiva y fuego.
(function(){
  "use strict";

  const pbDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);

  // Oferta vigente según los ajustes, o null. Necesita la campaña activa, un modo y una fecha de fin futura.
  function state(s){
    if(!s || !s.campaignOn || !s.saleMode || s.saleMode === "off") return null;
    const ends = pbDate(s.saleEnds);
    if(!ends || isNaN(ends) || ends <= new Date()) return null;
    return {
      mode: s.saleMode,
      pct: Math.max(0, Math.min(90, +s.salePercent || 0)),
      slots: +s.saleSlots || 0,
      currency: (s.saleCurrency || "USD").trim(),
      text: s.saleText || "",
      ends,
    };
  }

  // Cupos de la oferta de una certificación: total (propio o general) y cuántos quedan.
  function slotsOf(st, p){
    const total = +p.saleSlots || (st && st.slots) || 0;
    return {total, left: total ? Math.max(0, total - (+p.slotsTaken || 0)) : 0};
  }

  // Descuento de una certificación: null si no tiene o si ya se agotaron sus cupos (vuelve al precio regular).
  function forProgram(st, p){
    if(!st || !p) return null;
    const pct = st.mode === "general" ? st.pct : Math.max(0, Math.min(90, +p.salePercent || 0));
    if(!pct) return null;
    const {total, left} = slotsOf(st, p);
    if(total && !left) return null;
    const price = +p.price || 0;
    return {
      pct,
      price,
      salePrice: price ? Math.round(price * (100 - pct)) / 100 : 0,
      slots: left,
    };
  }

  // En oferta pero sin cupos: para avisar "cupos agotados".
  const soldOut = (st, p) => {
    if(!st || !p) return false;
    const pct = st.mode === "general" ? st.pct : +p.salePercent || 0;
    const {total, left} = slotsOf(st, p);
    return !!pct && !!total && !left;
  };

  const money = (n, cur) => "$" + (+n || 0).toLocaleString("es-MX", {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2}) + (cur ? " " + cur : "");

  // Reloj D/H/M/S dentro de el. Llama onEnd una vez al llegar a cero. Devuelve una función para detenerlo.
  function countdown(el, ends, onEnd){
    const units = [["d", "días"], ["h", "horas"], ["m", "min"], ["s", "seg"]];
    el.classList.add("sale-clock");
    el.setAttribute("role", "timer");
    el.innerHTML = units.map(([k, label]) => `<span class="u" data-u="${k}"><b>00</b><small>${label}</small></span>`).join("");
    const cells = Object.fromEntries(units.map(([k]) => [k, el.querySelector(`[data-u="${k}"] b`)]));
    let id = 0;
    const tick = () => {
      const left = Math.max(0, ends - Date.now());
      const t = Math.floor(left / 1000);
      const v = {d: Math.floor(t / 86400), h: Math.floor(t / 3600) % 24, m: Math.floor(t / 60) % 60, s: t % 60};
      for(const k in v){
        const txt = String(v[k]).padStart(2, "0");
        if(cells[k].textContent !== txt){
          cells[k].textContent = txt;
          cells[k].classList.remove("flip");
          void cells[k].offsetWidth;
          cells[k].classList.add("flip");
        }
      }
      el.setAttribute("aria-label", `Termina en ${v.d} días, ${v.h} horas y ${v.m} minutos`);
      if(!left){ clearInterval(id); if(onEnd) onEnd(); }
    };
    tick();
    id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }

  // Brasas y chispas que suben desde abajo. Se pausa fuera de pantalla y respeta "reducir movimiento".
  function fire(canvas){
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, raf = 0, visible = false, last = 0;
    const parts = [];
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const max = () => Math.min(140, Math.round(w / 9));
    const spawn = () => {
      const spark = Math.random() < .35;
      parts.push({
        x: Math.random() * w, y: h + 10,
        vx: (Math.random() - .5) * (spark ? 60 : 18), vy: -(spark ? 140 + Math.random() * 160 : 40 + Math.random() * 70),
        r: spark ? .8 + Math.random() * 1.4 : 1.6 + Math.random() * 3.2,
        life: 0, ttl: spark ? 1 + Math.random() * 1.2 : 2.2 + Math.random() * 2.6,
        hue: 18 + Math.random() * 30, spark, wob: Math.random() * 6.28,
      });
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - (last || now)) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      while(parts.length < max()) spawn();
      ctx.globalCompositeOperation = "lighter";
      for(let i = parts.length - 1; i >= 0; i--){
        const p = parts[i];
        p.life += dt;
        if(p.life > p.ttl || p.y < -20){ parts.splice(i, 1); continue; }
        p.wob += dt * 3;
        p.x += (p.vx + Math.sin(p.wob) * 14) * dt;
        p.y += p.vy * dt;
        const k = 1 - p.life / p.ttl;
        const a = Math.min(1, p.life * 4) * k;
        if(p.spark){
          ctx.strokeStyle = `hsla(${p.hue + 15},100%,${60 + k * 25}%,${a})`;
          ctx.lineWidth = p.r;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03);
          ctx.stroke();
        }else{
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
          g.addColorStop(0, `hsla(${p.hue + 20},100%,70%,${a})`);
          g.addColorStop(.4, `hsla(${p.hue},100%,50%,${a * .5})`);
          g.addColorStop(1, "hsla(10,100%,40%,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 4, 0, 6.283);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };
    const start = () => { if(!raf && visible){ last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => { stop(); io.disconnect(); ro.disconnect(); };
  }

  const api = {state, forProgram, slotsOf, soldOut, money, countdown, fire, pbDate};
  // El servidor usa las mismas reglas para fijar el precio de cada inscripción.
  if(typeof window !== "undefined") window.Sale = api;
  if(typeof module !== "undefined") module.exports = api;
})();
