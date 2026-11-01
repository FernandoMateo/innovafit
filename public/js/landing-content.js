// Textos de la landing. Estos son los valores de fábrica: lo que se edita en Admin → Web
// se guarda en settings.landing y pisa solo los campos cambiados.
(function(){
  "use strict";

  const DEFAULTS = {
    hero: {
      label: "Campus InnovaFit",
      title1: "Aprendé.",
      title2: "Rendí.",
      title3: "Certificate.",
      sub: "El campus digital para entrenadores personales: cursos gratis y certificaciones, un examen que valida lo que sabés y tu certificado al instante cuando aprobás con 80%.",
      cta: "Crear cuenta gratis",
      alt: "Tomar el reto",
      panel: "Tu certificado sale solo, con folio verificable, en el momento en que aprobás.",
    },
    stats: [
      {fig: "+10", label: "cursos y certificaciones en el campus"},
      {fig: "80%", label: "para acreditar el examen final"},
      {fig: "24/7", label: "para estudiar a tu ritmo, desde el celular"},
    ],
    steps: {
      title: "Cómo funciona",
      sub: "Cinco pasos, del registro al certificado.",
      items: [
        {title: "Registrate", text: "Nombre, correo y WhatsApp. En 30 segundos."},
        {title: "Estudiá", text: "Videos, audios y lecturas a tu ritmo."},
        {title: "Resolvé el caso", text: "Aplicá la teoría a un cliente real."},
        {title: "Rendí el examen", text: "20 preguntas, mínimo 80%, 3 oportunidades."},
        {title: "Certificate", text: "Descargá tu certificado con folio al instante."},
      ],
    },
    resources: {
      title: "Todo lo que hay adentro",
      sub: "Recursos pensados para entrenadores que trabajan: cortos, claros y aplicables mañana mismo.",
      items: [
        {title: "Clases en video", text: "Planos de movimiento, palancas y leyes del movimiento explicadas por especialistas."},
        {title: "Audios para el gym", text: "Repasá los conceptos clave mientras entrenás o vas en camino."},
        {title: "Lecturas en PDF", text: "El material base para consultar cuando lo necesites, siempre a mano."},
        {title: "Estudio de caso", text: "La sentadilla de Sarah: observás, corregís y explicás como con un cliente."},
        {title: "Examen y certificado", text: "Corrección automática, tu calificación y un folio que cualquiera verifica."},
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
