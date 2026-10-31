// Textos de la landing. Estos son los valores de fábrica: lo que se edita en Admin → Web
// se guarda en settings.landing y pisa solo los campos cambiados.
(function(){
  "use strict";

  const DEFAULTS = {
    hero: {
      title: "El campus que te certifica",
      sub: "Cursos para entrenadores personales con un examen de verdad: aprobás con 80% y tu certificado InnovaFit sale al instante.",
      cta: "Crear cuenta gratis",
      alt: "O medite con el reto de 25 preguntas",
    },
    exam: {
      q: "Un salto vertical se realiza principalmente en el plano…",
      a: "Frontal", b: "Sagital", c: "Transversal", correct: "B",
      ok: "Correcta. Así son las 20 del examen: 16 bien y estás acreditado.",
      no: "Era sagital: se mueve hacia adelante y arriba. El curso te lo explica en 10 minutos.",
    },
    intro: {
      text: "Clases en video [1], un caso real [2], un examen que no regala nada [3] y un certificado que cualquiera puede verificar.",
    },
    stages: [
      {title: "Registrate en 30 segundos", text: "Nombre, correo y WhatsApp. Elegís tu curso gratis y entrás al campus en el momento, sin esperar a nadie."},
      {title: "Estudiá a tu ritmo", text: "Videos, audios, lecturas y un estudio de caso real. El campus guarda tu avance y te muestra qué te falta."},
      {title: "Rendí y pasá el 80", text: "Veinte preguntas sobre todo el curso. Con 16 correctas quedás acreditado; si no, tenés 3 oportunidades."},
      {title: "Tu certificado, al instante", text: "Con tu nombre, el curso, tu calificación y un folio verificable. Lo descargás en PDF en el momento."},
    ],
    cut: {
      fail: "El examen final tiene 20 preguntas y el corte es 80. Si no llegás, repasás y volvés: tenés 3 oportunidades. ¿Querés medirte ya?",
      pass: "Pasaste el corte: quedás acreditado y tu certificado se emite solo, con tu calificación y un folio verificable. ¿Querés medirte ya?",
      link: "Tomá el reto de 25 preguntas",
    },
    band: {
      caption: "Salto largo, Eadweard Muybridge, 1887. La biomecánica empezó así: mirando el movimiento cuadro por cuadro.",
      side: "Hoy lo estudiás desde el celular.",
    },
    catalog: {
      title: "Lo que hay adentro",
      lead: "Un curso gratis para arrancar hoy, y el camino completo cuando quieras ir por más. Todo con examen y certificado InnovaFit.",
      freeNote: "15 lecciones · certificado al aprobar",
      freeButton: "Inscribirme gratis",
      groupFree: "Gratis",
      groupCert: "Certificaciones",
      groupEsp: "Especializaciones",
      groupPaq: "Paquetes",
    },
    board: {
      title: "Simple por dentro",
      tiles: [
        {title: "Video, audio y lectura", text: "Cada lección en el formato que mejor se aprende: miralo, escuchalo en el gym o leelo con calma."},
        {title: "Tu avance, guardado", text: "Retomás donde lo dejaste, en cualquier dispositivo."},
        {title: "Corrección explicada", text: "La comprobación te dice qué fallaste y por qué."},
        {title: "Folio verificable", text: "Cualquiera lo comprueba en línea."},
        {title: "3 oportunidades", text: "Y apoyo del equipo si las usás."},
        {title: "Consultas por WhatsApp", text: "Un mensaje armado con tus datos, directo a un asesor."},
        {title: "Estudio de caso real", text: "Teoría que se aplica a un cliente."},
        {title: "Tu perfil, tu nombre", text: "Así sale en tu certificado."},
      ],
    },
    plans: {
      title: "Elegí tu camino",
      items: [
        {name: "Curso gratis", fig: "$0", unit: "para siempre", text: "Fundamentos de Biomecánica completo: 15 lecciones, estudio de caso, comprobación y examen de acreditación. Si aprobás, tu certificado también es gratis.", btn: "Crear cuenta gratis", link: "/campus"},
        {name: "Certificación doble", fig: "2", unit: "avales", text: "Certificación de Entrenador Personal con aval nacional e internacional. Si aprobaste el curso gratis, ya tenés el primer módulo hecho. En noviembre, precios especiales de Buen Fin.", btn: "Consultar por WhatsApp", link: ""},
        {name: "Especialización", fig: "4", unit: "especialidades", text: "Culturismo, Instrucción Grupal, Ejercicio Correctivo y Envejecimiento Funcional. Para sumar un nicho a tu certificación y cobrar como especialista.", btn: "Consultar por WhatsApp", link: ""},
      ],
    },
    faq: {
      title: "Preguntas, sin vueltas",
      caption: "Borelli, De motu animalium, 1734: el primer libro que explicó el cuerpo como palancas.",
      items: [
        {q: "¿El curso gratis es gratis de verdad?", a: "Sí. Te registrás, entrás y hacés todo el curso de Fundamentos de Biomecánica, el examen incluido. Si aprobás, el certificado también es gratis."},
        {q: "¿Cómo se aprueba el examen?", a: "Son 20 preguntas sobre todo el curso. Con 80% o más (16 correctas) quedás acreditado y el certificado se emite en el momento, sin trámites."},
        {q: "¿Y si no llego al 80?", a: "Repasás las lecciones y volvés a rendir. Tenés 3 oportunidades; si las usás todas, el equipo de InnovaFit te ayuda y te habilita nuevas."},
        {q: "¿Qué dice el certificado?", a: "Tu nombre completo, el título exacto del curso, la calificación, la fecha y un folio único. Lo descargás en PDF o imagen."},
        {q: "¿Cómo sabe alguien que es real?", a: "Cualquier persona entra a la página de verificación, escribe el folio y ve tus datos. Un cliente o un gimnasio lo comprueba en segundos."},
        {q: "¿Qué es el reto de 25 preguntas?", a: "Una evaluación de nivel abierta a cualquiera. Si aprobás, se te habilita el curso gratis al instante; si no, te mostramos en qué bloques reforzar."},
        {q: "¿Las certificaciones pagas también son online?", a: "Sí, con práctica. Escribinos por WhatsApp desde el campus y un asesor te pasa precios, fechas y formas de pago."},
      ],
    },
    cta: {
      word: "Empezá",
      text: "Creá tu cuenta gratis y empezá Fundamentos de Biomecánica ahora mismo.",
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
