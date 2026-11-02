// Manual interno del equipo InnovaFit. Se carga una sola vez en la colección "manuals";
// después se edita desde Admin → Manual (lo ven administradores y asesores, nunca los alumnos).
module.exports = [
  {
    section: "Primeros pasos",
    title: "Cómo funciona la plataforma",
    summary: "Qué es cada parte del sitio, quién la usa y cómo se conectan.",
    body: `<h3>Las cuatro partes del sitio</h3>
<table>
<tr><th>Dirección</th><th>Para quién</th><th>Para qué sirve</th></tr>
<tr><td>campusinnovafit.tech</td><td>Público</td><td>La web: cursos gratis, certificaciones ISSA, InnovaSale y la evaluación de 25 preguntas.</td></tr>
<tr><td>/evaluacion</td><td>Público</td><td>El reto de nivel. Quien aprueba recibe acceso al curso de regalo.</td></tr>
<tr><td>/campus</td><td>Alumnos</td><td>Cursos, exámenes, certificados, certificaciones ISSA, inscripciones y soporte.</td></tr>
<tr><td>/admin</td><td>Equipo</td><td>El panel: ventas, finanzas, soporte, alumnos, cursos, certificados y ajustes.</td></tr>
</table>
<h3>Qué vende InnovaFit</h3>
<p>Las certificaciones internacionales las <b>emite y aprueba ISSA</b> (International Sports Sciences Association). InnovaFit las <b>comercializa</b>: acompaña al alumno en la inscripción, cierra la venta, valida el pago y gestiona el acceso a la plataforma de ISSA.</p>
<p>Los cursos del campus (por ejemplo, Fundamentos de Biomecánica) sí son de InnovaFit y emiten el certificado InnovaFit con folio verificable.</p>
<h3>El recorrido de un alumno</h3>
<ol>
<li>Se registra en el campus (o aprueba la evaluación y recibe su acceso).</li>
<li>Completa su perfil: sin eso el campus queda bloqueado.</li>
<li>Hace el curso gratuito, rinde el examen y obtiene su certificado InnovaFit.</li>
<li>En <b>Certificaciones</b> mira el programa ISSA que le interesa y se inscribe.</li>
<li>Un asesor lo contacta por WhatsApp y cierra la venta.</li>
<li>El alumno sube el comprobante en <b>Mis inscripciones</b>, con el correo donde quiere recibir el acceso.</li>
<li>El equipo valida el pago y envía el acceso de ISSA a ese correo.</li>
</ol>`,
  },
  {
    section: "Primeros pasos",
    title: "Roles y accesos del equipo",
    summary: "Diferencias entre administrador y asesor, y cómo dar de alta a alguien del equipo.",
    body: `<h3>Roles</h3>
<table>
<tr><th>Rol</th><th>Qué ve en /admin</th></tr>
<tr><td><b>Administrador</b></td><td>Todo el panel: Resumen, Ventas, Finanzas, Soporte, Evaluaciones, Alumnos, Seguimiento, Cursos, Certificados, Certificaciones, Web, Ajustes y Manual.</td></tr>
<tr><td><b>Asesor del equipo</b></td><td>Ventas (inscripciones y comprobantes), Soporte (tickets) y Manual. No ve Finanzas ni puede cambiar cursos, precios o ajustes.</td></tr>
<tr><td><b>Alumno</b></td><td>No entra a /admin. Usa solo el campus.</td></tr>
</table>
<h3>Dar de alta a un asesor</h3>
<ol>
<li>Admin → <b>Alumnos</b> → <b>+ Nuevo alumno</b>.</li>
<li>Completá nombre, correo y WhatsApp. El nombre es el que ven los alumnos cuando el asesor responde un ticket.</li>
<li>En <b>Rol</b> elegí <b>Asesor del equipo</b>.</li>
<li>Guardá y enviale el acceso con el botón de WhatsApp o copiando el mensaje.</li>
</ol>
<p>Cada persona del equipo usa <b>su propio usuario</b>: así queda registrado quién validó cada pago y quién respondió cada consulta.</p>
<h3>Buenas prácticas de seguridad</h3>
<ul>
<li>Nunca compartas tu contraseña ni la de otro miembro del equipo.</li>
<li>Si alguien deja el equipo, cambiale el rol a Alumno o eliminá su usuario.</li>
<li>Los comprobantes de pago son privados: solo los ven el alumno y el equipo. No los reenvíes por otros medios.</li>
</ul>`,
  },
  {
    section: "Campus del alumno",
    title: "Registro, perfil obligatorio y tutorial",
    summary: "Lo que vive el alumno la primera vez que entra.",
    body: `<h3>Registro</h3>
<p>En /campus el alumno elige un curso gratuito, deja nombre, correo, WhatsApp y una contraseña, y entra al instante. Si ya tiene cuenta usa “Ya tengo cuenta”.</p>
<h3>Perfil obligatorio</h3>
<p>Hasta completar el perfil, todas las pestañas aparecen con candado. Le pedimos:</p>
<ul><li>Nombre y apellido (así sale en sus certificados).</li><li>Código de país y WhatsApp.</li><li>Identificación (CURP / DNI).</li></ul>
<p>Al guardar, el campus se desbloquea y arranca un tutorial corto que explica cada pestaña: Mis cursos, Mis certificados, Certificaciones, Mis inscripciones, Soporte y Mi perfil.</p>
<h3>¿Olvidó su contraseña?</h3>
<p>Un administrador entra en Alumnos → Editar → <b>Generar</b> contraseña nueva → Guardar, y se la envía por WhatsApp con el botón del mensaje de acceso.</p>`,
  },
  {
    section: "Campus del alumno",
    title: "Cursos, examen de acreditación y certificados",
    summary: "Cómo avanza el alumno en un curso y cómo obtiene su certificado InnovaFit.",
    body: `<h3>Mis cursos</h3>
<p>Cada curso tiene lecciones de video, audio, PDF o lectura. El avance se guarda solo al marcar cada lección como completa (los videos y audios se marcan al terminar).</p>
<h3>Comprobación y examen</h3>
<ul>
<li><b>Comprobación de conocimientos:</b> práctica con corrección inmediata y explicación de cada respuesta.</li>
<li><b>Examen de acreditación:</b> se habilita al completar todas las lecciones. Se aprueba con 80% o más y tiene oportunidades limitadas (por defecto 3).</li>
</ul>
<p>Si un alumno usa todas sus oportunidades, el administrador le da una más desde <b>Seguimiento → +1 oportunidad</b>.</p>
<h3>Certificados</h3>
<p>Al aprobar, el certificado se emite solo con folio correlativo (IF-2026-0001…). El alumno lo descarga en PDF o imagen desde <b>Mis certificados</b>. Cualquiera puede verificarlo en /verificar con el folio.</p>
<p>Si el nombre salió mal: el alumno lo corrige en Mi perfil y el administrador vuelve a emitirlo manualmente desde Certificados.</p>`,
  },
  {
    section: "Campus del alumno",
    title: "Certificaciones ISSA e inscripción",
    summary: "La ficha interactiva del programa y el formulario de inscripción.",
    body: `<h3>La ficha del programa</h3>
<p>En la pestaña <b>Certificaciones</b>, cada programa abre una ficha con:</p>
<ul>
<li>Precio (y precio InnovaSale con cuenta regresiva si hay oferta), destacados y temario en PDF.</li>
<li><b>El programa:</b> qué va a lograr.</li>
<li><b>A quién va dirigido.</b></li>
<li><b>Módulo a módulo:</b> una línea de tiempo interactiva; el alumno abre cada módulo y ve sus temas. Un contador muestra cuántos exploró.</li>
<li>Recursos, perfil de egreso y los 4 pasos de la compra.</li>
</ul>
<h3>Formulario de inscripción</h3>
<p>Dos pasos: datos de contacto (nombre, correo, WhatsApp, ciudad, identificación) y perfil (experiencia, forma de pago preferida, horario para contactarlo y un mensaje). El alumno no paga nada en este momento.</p>
<p>Al enviarlo:</p>
<ul>
<li>Se crea la inscripción con un folio (IN-XXXXXX) y el precio del momento.</li>
<li>Si hay InnovaSale con cupos, <b>se descuenta un cupo</b>. Cuando se agotan, esa certificación vuelve a su precio regular.</li>
<li>Aparece en Admin → <b>Ventas</b> como <b>Nueva</b>.</li>
</ul>
<p>Un alumno no puede tener dos inscripciones activas en la misma certificación.</p>`,
  },
  {
    section: "Campus del alumno",
    title: "Mis inscripciones y comprobantes",
    summary: "Lo que ve el alumno después de inscribirse y cómo sube el comprobante.",
    body: `<p>Cada inscripción muestra un recorrido de 4 pasos: <b>Inscripción → Asesor → Comprobante → Acceso</b>, con un mensaje claro según el estado.</p>
<h3>Subir el comprobante</h3>
<ol>
<li>Botón <b>Subir comprobante de pago</b>.</li>
<li>Foto o PDF del pago (hasta 10 MB).</li>
<li><b>Correo donde quiere recibir el acceso</b> a la certificación (puede ser distinto del de su cuenta).</li>
<li>Monto pagado y una referencia opcional (banco, folio de la operación).</li>
</ol>
<p>La inscripción pasa a <b>Comprobante por validar</b>. Si el equipo lo rechaza, el alumno ve el motivo y puede subir otro.</p>
<p>Mientras no esté en revisión, el alumno puede cancelar su inscripción (si había tomado un cupo de oferta, se libera).</p>`,
  },
  {
    section: "Ventas",
    title: "Flujo de venta paso a paso",
    summary: "De la inscripción al acceso de ISSA: qué hace el asesor en cada estado.",
    body: `<table>
<tr><th>Estado</th><th>Qué significa</th><th>Qué hace el asesor</th></tr>
<tr><td><b>Nueva</b></td><td>El alumno envió el formulario.</td><td>Abrirla, asignársela y escribirle por WhatsApp en el horario que eligió. Luego <b>Marcar en contacto</b>.</td></tr>
<tr><td><b>En contacto</b></td><td>Ya hablaron.</td><td>Resolver dudas, confirmar precio y forma de pago, enviar los datos de pago.</td></tr>
<tr><td><b>Comprobante por validar</b></td><td>El alumno subió el comprobante.</td><td>Revisarlo y <b>Validar pago</b> o <b>Rechazar comprobante</b>.</td></tr>
<tr><td><b>Pagada · falta acceso</b></td><td>Pago validado.</td><td>Gestionar el acceso con ISSA al correo indicado y <b>Marcar acceso enviado</b>.</td></tr>
<tr><td><b>Acceso enviado</b></td><td>Venta cerrada.</td><td>Nada más. El alumno lo ve en su panel.</td></tr>
<tr><td><b>Comprobante rechazado</b></td><td>No se pudo validar.</td><td>Hablar con el alumno; puede subir otro.</td></tr>
<tr><td><b>Cancelada</b></td><td>No sigue.</td><td>—</td></tr>
</table>
<h3>Consejos</h3>
<ul>
<li>Contactá las inscripciones nuevas el mismo día. En Finanzas aparecen marcadas las que llevan más de 48 h sin contacto.</li>
<li>Usá “Solo las mías” para ver tus inscripciones asignadas.</li>
<li>Dejá en <b>Notas internas</b> lo acordado (forma de pago, fecha prometida). El alumno no las ve en su panel.</li>
<li>El menú muestra un número rojo en Ventas con las nuevas y los comprobantes por validar.</li>
</ul>`,
  },
  {
    section: "Ventas",
    title: "Cómo validar un pago",
    summary: "Checklist antes de marcar una venta como pagada.",
    body: `<ol>
<li>Abrí la inscripción desde Ventas (filtro <b>Por validar</b>).</li>
<li>Mirá el comprobante: fecha, monto, titular y cuenta destino de InnovaFit.</li>
<li>Confirmá que el monto coincide con el precio de la inscripción (el precio de InnovaSale queda guardado al momento de inscribirse).</li>
<li>Si todo coincide, <b>Validar pago</b> y escribí el monto cobrado: ese número es el que suma en Finanzas.</li>
<li>Si algo no coincide, <b>Rechazar comprobante</b> con un motivo claro (“el monto no coincide con lo acordado”, “la imagen no se lee”). El alumno lo ve y puede subir otro.</li>
</ol>
<p>Si el alumno pagó pero no subió el comprobante (por ejemplo, lo mandó por WhatsApp), usá <b>Registrar pago sin comprobante</b>.</p>
<p>Al validar queda registrado quién lo validó y cuándo.</p>`,
  },
  {
    section: "Ventas",
    title: "Enviar el acceso y cerrar la venta",
    summary: "Último paso: el alumno recibe su acceso de ISSA.",
    body: `<ol>
<li>Filtrá Ventas por <b>Falta acceso</b>.</li>
<li>Usá el <b>Correo para el acceso</b> que indicó el alumno (está en el bloque del comprobante).</li>
<li>Gestioná el alta en la plataforma de ISSA con ese correo.</li>
<li>Volvé a la inscripción y tocá <b>Marcar acceso enviado</b>.</li>
</ol>
<p>El alumno ve en Mis inscripciones “Tu acceso está en camino a tu correo” con la fecha, y una sugerencia de revisar spam. Si no le llega, abrirá un ticket en Soporte.</p>`,
  },
  {
    section: "Ventas",
    title: "Cancelaciones, cupos y comprobantes rechazados",
    summary: "Casos especiales del proceso de venta.",
    body: `<h3>Cancelar</h3>
<p>El equipo puede cancelar cualquier inscripción que no tenga el acceso enviado. El alumno solo puede cancelar mientras no está en revisión. Si la inscripción había usado un <b>cupo de InnovaSale</b>, al cancelarla el cupo vuelve a estar disponible.</p>
<h3>Cupos de la oferta</h3>
<p>En Ajustes → Campaña → InnovaSale, la tabla muestra <b>Cupos</b> (total) y <b>Ocupados</b>. Cada inscripción con descuento suma un ocupado. Para lanzar una oferta nueva, poné “Ocupados” en 0.</p>
<h3>Comprobante rechazado</h3>
<p>El alumno ve el motivo y el botón “Subir otro comprobante”. Cuando lo sube, vuelve a <b>Por validar</b>.</p>`,
  },
  {
    section: "Soporte",
    title: "Cómo atender un ticket",
    summary: "Responder consultas de los alumnos desde Soporte.",
    body: `<p>El alumno escribe desde la pestaña <b>Soporte</b> del campus: elige un tema, un asunto y el detalle, y puede adjuntar una captura o un PDF. Cada consulta es un <b>ticket</b> con toda la conversación.</p>
<h3>Atender</h3>
<ol>
<li>Admin → <b>Soporte</b> → filtro <b>Pendientes</b>. El punto naranja marca mensajes sin atender.</li>
<li>Abrí el ticket, asignátelo y respondé. Tu respuesta sale firmada con <b>tu nombre</b> y la etiqueta “Equipo InnovaFit”.</li>
<li>El alumno ve un punto en la pestaña Soporte hasta que lee la respuesta.</li>
<li>Cuando se resuelva, <b>Cerrar consulta</b>. Si el alumno vuelve a escribir, se reabre sola.</li>
</ol>
<h3>Tiempos sugeridos</h3>
<ul><li>Primera respuesta: el mismo día hábil.</li><li>Pagos y accesos: prioridad alta.</li></ul>
<p>La conversación se actualiza sola cada 15 segundos mientras está abierta.</p>`,
  },
  {
    section: "Soporte",
    title: "Respuestas frecuentes",
    summary: "Plantillas para las consultas más comunes.",
    body: `<h3>“Olvidé mi contraseña”</h3>
<p>Un administrador genera una nueva en Alumnos → Editar → Generar → Guardar y la envía. Respuesta: “¡Hola! Te generamos una contraseña nueva y te la enviamos por WhatsApp. Cuando entres, podés cambiarla en Mi perfil.”</p>
<h3>“No puedo ver un video”</h3>
<p>Pedir navegador y dispositivo, sugerir Chrome actualizado y probar con otra conexión. Si sigue, revisar la lección en Cursos.</p>
<h3>“Usé todas mis oportunidades del examen”</h3>
<p>Revisar en Seguimiento el historial. Si corresponde, <b>+1 oportunidad</b> y responder: “¡Te habilitamos una oportunidad más! Te recomendamos repasar las lecciones antes de rendir.”</p>
<h3>“Mi certificado tiene mal el nombre”</h3>
<p>Pedir que corrija el nombre en Mi perfil y emitir el certificado de nuevo desde Certificados.</p>
<h3>“No me llegó el acceso de ISSA”</h3>
<p>Buscar su inscripción en Ventas, confirmar el <b>correo para el acceso</b> y pedir que revise spam. Si el correo estaba mal, corregirlo con ISSA y avisarle.</p>`,
  },
  {
    section: "Panel de administración",
    title: "Resumen, Evaluaciones y Seguimiento",
    summary: "Indicadores del día, leads de la evaluación y avance de cada alumno.",
    body: `<h3>Resumen</h3>
<p>Evaluaciones por día, tasa de aprobación, distribución de puntajes, alumnos, acreditados y certificados.</p>
<h3>Evaluaciones</h3>
<p>Cada persona que hizo el reto de 25 preguntas. Sirve como lista de leads: se puede filtrar, exportar a CSV, marcar el estado (nuevo, contactado, inscripto, descartado) y generar el acceso al campus.</p>
<h3>Seguimiento</h3>
<p>Una fila por alumno y curso: avance, comprobación, examen, intentos, estado y certificado. Desde acá se da <b>+1 oportunidad</b> y se ve el historial de intentos.</p>`,
  },
  {
    section: "Panel de administración",
    title: "Cursos, certificados y certificaciones",
    summary: "Cargar contenido, emitir certificados y editar la ficha de cada certificación ISSA.",
    body: `<h3>Cursos</h3>
<p>Cada curso tiene portada, descripción y lecciones (video, audio, PDF, imagen, video externo o lectura), más comprobación y examen. “Inscripción libre” lo muestra en el registro del campus.</p>
<h3>Certificados</h3>
<p>Lista de certificados emitidos. <b>Emitir certificado</b> crea uno manual con el folio siguiente. El sello del pie se cambia en Ajustes.</p>
<h3>Certificaciones (ficha ISSA)</h3>
<p>Al editar una certificación hay dos columnas:</p>
<ul>
<li><b>Datos y precio:</b> nombre, tipo, precio, precio anterior tachado, nota del precio (“o $10,230 MXN a 6 meses sin intereses”), imagen y visibilidad.</li>
<li><b>Ficha del programa:</b> destacados, “El programa”, a quién va dirigido, recursos, perfil de egreso y el temario en PDF. Cada línea es un elemento.</li>
</ul>
<p>Abajo, el editor de <b>Módulos</b>: título y temas (uno por línea), con flechas para ordenar. Es lo que el alumno abre uno por uno en la línea de tiempo.</p>
<p>La moneda de todos los precios se define en Ajustes (por defecto USD, como en innovafit.mx).</p>`,
  },
  {
    section: "Panel de administración",
    title: "Finanzas",
    summary: "Cómo leer los indicadores comerciales.",
    body: `<p>Solo para administradores. Elegí el período (7, 30, 90 días, 12 meses o todo).</p>
<table>
<tr><th>Indicador</th><th>Cómo se calcula</th></tr>
<tr><td>Ingresos</td><td>Suma de los montos cobrados en pagos validados del período.</td></tr>
<tr><td>Ventas</td><td>Inscripciones pagadas o con acceso enviado.</td></tr>
<tr><td>Ticket promedio</td><td>Ingresos ÷ ventas.</td></tr>
<tr><td>Conversión</td><td>De las inscripciones del período, cuántas pagaron.</td></tr>
<tr><td>Prospectos activos</td><td>Inscripciones nuevas, en contacto o con comprobante rechazado.</td></tr>
<tr><td>Por validar</td><td>Comprobantes esperando revisión.</td></tr>
</table>
<p>Gráficos: ingresos por día/semana/mes, certificación más vendida (y la más pedida), embudo de venta, ventas por asesor, forma de pago preferida, países y cupos de InnovaSale. Abajo, los prospectos para seguir con su botón de WhatsApp. <b>Exportar ventas CSV</b> descarga el detalle.</p>`,
  },
  {
    section: "Panel de administración",
    title: "Web, campaña e InnovaSale",
    summary: "Textos de la landing, campaña comercial y descuentos por tiempo limitado.",
    body: `<h3>Web</h3>
<p>Todos los textos de la landing, las imágenes del recorrido y las preguntas frecuentes. “Guardar y publicar” los cambia al instante.</p>
<h3>Campaña e InnovaSale</h3>
<ol>
<li>Ajustes → Campaña → tildá <b>Campaña activa</b>.</li>
<li>En InnovaSale elegí “Un mismo %” o “Un % por certificación”.</li>
<li>Duración: 24 h, 48 h, 72 h, 7 días o fecha exacta.</li>
<li>Cupos por certificación (o uno general) y precios en la tabla.</li>
<li>Guardar campaña.</li>
</ol>
<p>La web y el campus muestran fuego, cuenta regresiva y precios con descuento. Al terminar el tiempo vuelve todo a la normalidad sola.</p>`,
  },
  {
    section: "Panel de administración",
    title: "Este manual",
    summary: "Cómo editarlo y descargarlo.",
    body: `<p>El manual lo ven solo administradores y asesores; los alumnos no tienen acceso.</p>
<ul>
<li><b>Descargar manual completo (PDF):</b> abre una versión para imprimir con portada e índice. En el diálogo elegí <b>Guardar como PDF</b>.</li>
<li><b>Descargar este capítulo:</b> lo mismo, solo el capítulo abierto.</li>
<li>Los administradores pueden crear, editar, ordenar y eliminar capítulos. El contenido acepta texto simple (una línea vacía entre párrafos) o HTML.</li>
</ul>`,
  },
];
