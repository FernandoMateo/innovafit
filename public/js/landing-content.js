// Textos de la landing. Estos son los valores de fábrica: lo que se edita en Admin → Web
// se guarda en settings.landing y pisa solo los campos cambiados.
(function(){
  "use strict";

  const DEFAULTS = {
    hero: {
      label: "Formación para entrenadores personales",
      title1: "Campus",
      title2: "InnovaFit",
      sub: "Estudiá, validá lo que sabés y certificate. Cursos gratis y certificaciones con examen real, desde tu celular y a tu ritmo.",
      cta: "Crear cuenta gratis",
      alt: "Tomar el reto",
      scroll: "Deslizá y recorré el campus",
    },
    // Los cinco planos del recorrido con el iPad (después de la portada).
    story: {
      items: [
        {title: "Registrate en 30 segundos", text: "Nombre, correo y WhatsApp. Entrás y empezás tu primer curso gratis en ese mismo momento."},
        {title: "Cursos gratis y certificaciones", text: "Arrancá con Fundamentos de Biomecánica sin pagar nada y seguí con la certificación que te lleve a tu próximo cliente."},
        {title: "Aprendé a tu ritmo", text: "Clases en video, audios para el gym, lecturas en PDF y un estudio de caso real. Todo desde el celular."},
        {title: "Validá lo que sabés", text: "Un examen de 20 preguntas con corrección automática. Aprobás con 80% y tenés 3 oportunidades."},
        {title: "Tu certificado, al instante", text: "Con tu nombre, tu calificación y un folio que cualquiera verifica en línea. Sin trámites ni esperas."},
      ],
    },
    steps: {
      title: "Cómo funciona",
      sub: "Del registro al certificado en cinco pasos, a tu ritmo y sin trámites.",
      items: [
        {when: "Día 1", title: "Registro", text: "Creás tu cuenta gratis en 30 segundos."},
        {when: "Semana 1", title: "Clases", text: "Videos, audios y lecturas a tu ritmo."},
        {when: "Semana 2", title: "Estudio de caso", text: "Aplicás la teoría a un cliente real."},
        {when: "Semana 2", title: "Examen final", text: "20 preguntas, mínimo 80%, 3 oportunidades."},
        {when: "Al aprobar", title: "Certificado", text: "Se emite solo, con folio verificable."},
      ],
    },
    catalog: {
      title: "Elegí tu camino",
      sub: "Arrancá gratis y seguí con la certificación que te lleve a tu próximo cliente.",
      centerLabel: "programas en el campus",
      tags: "Biomecánica, Entrenador personal, Nutrición, Fuerza y acondicionamiento, Culturismo, Instrucción grupal, Ejercicio correctivo, Adulto mayor, Negocio fitness",
      freeBadge: "Gratis",
      freeNote: "15 lecciones · certificado al aprobar",
      freeButton: "Inscribirme gratis",
      askButton: "Consultar",
    },
    cert: {
      title: "Tu certificado, con tu nombre",
      text: "Así se ve el certificado que recibís al aprobar: tu nombre, el curso, tu calificación y un folio que cualquiera puede verificar en línea.",
      inputLabel: "Escribí tu nombre",
    },
    faq: {
      title: "Preguntas frecuentes",
      items: [
        {q: "¿El curso gratis es gratis de verdad?", a: "Sí. Te registrás, entrás y hacés todo el curso de Fundamentos de Biomecánica, el examen incluido. Si aprobás, el certificado también es gratis."},
        {q: "¿Cómo se aprueba el examen?", a: "Son 20 preguntas sobre todo el curso. Con 80% o más (16 correctas) quedás acreditado y el certificado se emite en el momento, sin trámites."},
        {q: "¿Y si no llego al 80?", a: "Repasás las lecciones y volvés a rendir. Tenés 3 oportunidades; si las usás todas, el equipo de InnovaFit te ayuda y te habilita nuevas."},
        {q: "¿Qué dice el certificado?", a: "Tu nombre completo, el título exacto del curso, la calificación, la fecha y un folio único. Lo descargás en PDF o imagen."},
        {q: "¿Cómo sabe alguien que es real?", a: "Cualquier persona entra a la página de verificación, escribe el folio y ve tus datos. Un cliente o un gimnasio lo comprueba en segundos."},
        {q: "¿Qué es el reto de 25 preguntas?", a: "Una evaluación de nivel abierta a cualquiera. Si aprobás, se te habilita el curso gratis al instante; si no, te mostramos en qué bloques reforzar."},
        {q: "¿Las certificaciones pagas también son online?", a: "Sí, con práctica. Escribinos por WhatsApp y un asesor te pasa precios, fechas y formas de pago."},
      ],
    },
    cta: {
      title: "Tu próximo nivel",
      highlight: "empieza hoy",
      text: "Creá tu cuenta gratis y empezá Fundamentos de Biomecánica ahora mismo.",
      button: "Crear cuenta gratis",
      alt: "Hablar por WhatsApp",
    },
    footer: {
      about: "InnovaFit · Formación y certificación para entrenadores personales.",
      contact: "Asesores por WhatsApp: +52 322 320 8254",
    },
  };

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  // Mezcla lo guardado sobre los valores de fábrica (campo por campo; las listas se reemplazan enteras).
  function merge(base, over){
    if(!isObj(over)) return base;
    const out = {};
    for(const k of Object.keys(base)){
      const b = base[k], o = over[k];
      if(o === undefined || o === null) out[k] = b;
      else if(Array.isArray(b)) out[k] = Array.isArray(o) && o.length ? o.map((x, i) => (isObj(b[i] || b[0]) ? merge(b[i] || b[0], x) : x)) : b;
      else if(isObj(b)) out[k] = merge(b, o);
      else out[k] = typeof o === "string" && o.trim() === "" ? b : o;
    }
    return out;
  }

  window.LandingContent = {DEFAULTS, merge, clone: () => JSON.parse(JSON.stringify(DEFAULTS))};
})();
