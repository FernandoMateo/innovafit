# InnovaFit · Plataforma

Landing del Reto del Entrenador, evaluación de nivel, campus de alumnos y panel de administración.
Node (Express) + PocketBase.

En producción: https://campusinnovafit.tech

| Ruta | Qué es |
|---|---|
| `/` | Landing para entrenadores personales |
| `/promo/<slug>` | Landing propia de cada promoción (la dirección se edita en Admin → Promociones) |
| `/black-friday` | Landing de la promoción destacada (Black Friday), conectada a Meta Ads. `/buen-fin` sigue funcionando para anuncios viejos |
| `/black-friday-gracias` (o `/buen-fin-gracias`) | Página de regreso de la pasarela: confirma el pago y dispara `Purchase` |
| `/evaluacion` | Evaluación de 25 preguntas (aprueba con 80/100) |
| `/campus` | Campus del alumno: registro obligatorio, cursos, comprobación, examen de acreditación y certificados |
| `/admin` | Panel: resumen, evaluaciones (leads), alumnos, seguimiento de acreditación, cursos con editor de preguntas, certificados, catálogo de certificaciones y ajustes |
| `/verificar` | Verificación pública de un certificado por su folio |

## Cómo funciona

- Las respuestas correctas viven solo en el servidor (`data/questions.json`). El navegador recibe las preguntas sin respuestas y el servidor corrige.
- Cada evaluación queda guardada con nombre, correo, WhatsApp y puntaje. Desde **Admin → Evaluaciones** se filtran aprobados y no aprobados, se marca el estado (nuevo, contactado, inscripto, descartado), se agregan notas y se exporta a CSV.
- **Si aprueba**: se crea su cuenta ya verificada, se le habilita el curso marcado como *Regalo al aprobar* y queda con la sesión iniciada: el botón "Entrar al campus" lo lleva directo. También ve su usuario y contraseña. Si ya tenía cuenta, el curso se suma a la misma.
- **Registro obligatorio**: sin sesión, el campus muestra los cursos con "Inscripción libre" y un formulario de registro (nombre completo, correo, país, teléfono, contraseña y autorización de datos). Nadie ve contenido sin registrarse. Cada inscripción queda en `enrollments`.
- **Secuencia de acreditación**: lecciones → estudio de caso → comprobación de conocimientos (lección tipo *Comprobación*: corrección inmediata con explicación) → examen de acreditación (lección tipo *Examen final*: se habilita al completar el resto, 3 oportunidades, aprueba con 80%). Al aprobar, el alumno queda ACREDITADO con fecha y calificación, y el certificado se emite solo. Las preguntas y respuestas viven en `assessments` (solo admin) y se corrigen en el servidor.
- **Seguimiento** (admin): inscriptos, curso, avance, calificaciones, intentos usados, estado, fecha de acreditación y folio. Desde ahí se habilita "+1 oportunidad" y se exporta a CSV.
- **Ajustes** (admin): campaña comercial (Black Friday) con logo opcional, y sello de acreditación del certificado.
- La carga inicial de preguntas sale de `data/assessments-seed.json` (fuera del repo, como `questions.json`). Las portadas de cursos y certificaciones están en `seed/covers/`.
- **Certificados**: si el curso no tiene examen, al completar todas las lecciones de un curso con "Emitir al completar", el servidor verifica el progreso y emite el certificado con folio correlativo (`IF-AAAA-0001`). El admin también puede emitirlos a mano desde **Certificados**, con vista previa en vivo. Se descargan en PDF o PNG y cualquiera puede verificarlos en `/verificar`.
- **Panel del alumno**: edita sus datos, foto y contraseña; ve y descarga sus certificados; consulta las certificaciones del catálogo con un mensaje de WhatsApp armado con sus datos.
- Cada acción guardada muestra una confirmación en el centro de la pantalla.
- **Si no aprueba**: ve su mapa por bloque y la invitación a la Certificación Doble por WhatsApp.
- El admin crea cursos, sube lecciones (video, audio, PDF, imagen, link de YouTube/Vimeo o lectura), las reordena y edita. También crea alumnos y elige qué cursos ve cada uno.

## Landing de promociones e Inscripciones

- **Admin → Promociones**: nombre, título de la barra, fechas de inicio y cierre, estado, programas incluidos con **% de descuento por programa** (nunca uno global), precio final opcional, acreditación por programa, condiciones, URL del checkout, video demo (una lección del campus o YouTube/Vimeo), mentorías y preguntas frecuentes. Todo se edita sin tocar código. "Programada" se activa sola al llegar el inicio y pasa a "Finalizada" al cierre.
- La landing sigue 8 bloques: portada (pregunta al entrenador) → los 10 problemas → la solución → Certificación Internacional 5×1 (una tarjeta por formación con "Ver temario") → la promoción (precio regular, especial y % del paquete) → por qué InnovaFit → llamada final con la solicitud de inscripción → preguntas frecuentes. Si la promoción no tiene 5 programas, los textos ("cinco", "5×1") se ajustan solos a la cantidad.
- **Paquete**: en la promoción se cargan el nombre del paquete y sus precios regular y especial; el % se calcula solo. Sin precios, la landing muestra "Consúltalo con un asesor".
- Las formaciones del 5×1 son CPT, Especialista en Prevención de Lesiones, Especialista en HIIT y Especialista en Speed, Agility & Strength Training (la quinta, por confirmar). Sus temarios salen de los PDF oficiales de InnovaFit (`seed/programs-5x1.js`, portadas en `seed/covers/` y PDF en `seed/brochures/`) y se cargaron una sola vez; desde ahí se editan en el admin.
- Los programas de la promoción son los de **Admin → Certificaciones** (temario, objetivo, competencias, PDF e imagen). Se pueden dejar sin publicar en el campus y aun así aparecer en la landing.
- **Admin → Inscripciones**: cada envío del formulario o del botón de compra queda en `promo_leads` con sus UTM, consentimiento y estado (nuevo, contactado, en checkout, pagado, descartado). Filtros por promoción, taller, estado y fechas; exporta a CSV o Excel respetando los filtros. Los asesores también la ven.
- **Pagado** solo lo pone el servidor: el webhook de la pasarela o el botón "Confirmar pago validado" del equipo (la base rechaza marcarlo a mano). Recién ahí se envía `Purchase` a Meta.
- Vista previa para el equipo: `/promo/<slug>?preview=1` (con la sesión del admin abierta en el mismo navegador).
- **Campus → Promociones**: pestaña con todas las promociones activas y próximas; cada tarjeta abre la landing de esa promoción (con `utm_source=campus`). La home del campus muestra las dos primeras.

### Medición (Meta)

| Evento | Cuándo | Dedupe |
|---|---|---|
| `PageView` | al cargar | — |
| `ViewContent` | "Ver temario", pestaña de un temario o play del video | una vez por programa por visita |
| `Lead` | formulario guardado (no se repite en reenvíos ni doble clic) | `eventID` = el del servidor (CAPI) |
| `InitiateCheckout` | "Continuar al pago" | `ic-<folio>` en Pixel y CAPI |
| `Purchase` | **solo** con el pago confirmado | `pur-<folio>` en Pixel (página de gracias, una vez) y CAPI |
| `Contact` | clic en cualquier botón de WhatsApp | máx. uno cada 3 s |

UTM: se guardan los 5 (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) más `fbclid` → `fbc`, por 30 días (gana el último anuncio). Parámetros sugeridos para los anuncios:
`utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}`

### Pasarela de pago

1. En la promoción cargá la **URL del checkout**. La landing le agrega `?ref=<folio>&client_reference_id=<folio>&prefilled_email=…`.
2. Configurá la URL de regreso de la pasarela: `https://campusinnovafit.tech/black-friday-gracias?ref=<folio>`.
3. Configurá el webhook de pago: `POST https://campusinnovafit.tech/api/promo/payment` con cuerpo JSON `{"ref":"<folio>","status":"paid","amount":123.45,"currency":"USD","orderId":"…"}` y la cabecera `x-signature: sha256=<HMAC-SHA256 del cuerpo con PAYMENT_WEBHOOK_SECRET>` (o `x-webhook-token: <PAYMENT_WEBHOOK_SECRET>` si la pasarela no firma). Si la pasarela manda otro formato, se adapta en `lib/promo-routes.js` (ruta `/api/promo/payment`).
4. Sin URL de checkout, "Comprar" deja la inscripción en "En checkout" y abre WhatsApp con el folio.

## Instalación

Requiere Node 20.12 o superior.

```bash
npm install
npm run setup   # crea .env, el superusuario, las colecciones, el admin y carga el curso de Biomecánica
npm start       # arranca PocketBase y el sitio en http://localhost:3100
```

`npm run setup` se puede repetir sin romper nada. El usuario de `/admin` y su contraseña están en `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

La carga inicial busca los videos, audios y PDF del curso en la carpeta de `SEED_MEDIA_DIR` (por defecto, la carpeta padre).

## Configuración (`.env`)

| Variable | Uso |
|---|---|
| `PORT` | Puerto del sitio (3100) |
| `PB_URL` | Dirección interna de PocketBase |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | Superusuario de PocketBase (lo usa solo el servidor) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario del panel `/admin` |
| `WA_NUMBER` | WhatsApp de ventas (código de país + número, sin `+`) |
| `EXTERNAL_PB=1` | Si PocketBase corre como servicio aparte, `npm start` no lo lanza |
| `META_PIXEL_ID` | ID del Pixel de Meta de la landing `/black-friday` |
| `META_CAPI_TOKEN` | Token de acceso de la Conversions API (Events Manager → Configuración) |
| `META_TEST_EVENT_CODE` | Opcional: código de prueba de Events Manager (quitarlo en producción) |
| `KOMMO_SUBDOMAIN` / `KOMMO_TOKEN` | Kommo (amoCRM): subdominio (`innovafit` de innovafit.kommo.com) y token de larga duración de una integración privada |
| `KOMMO_PIPELINE_ID` / `KOMMO_STATUS_ID` | Opcionales: embudo y etapa donde entran los leads |
| `CRM_WEBHOOK_URL` | Alternativa a Kommo: recibe cada lead en JSON (Zapier, Make, otro CRM) |
| `PAYMENT_WEBHOOK_SECRET` | Secreto del webhook de pago (sin él, `/api/promo/payment` queda desactivado) |

## Despliegue automático

1. `npm run autosync` vigila la carpeta y sube cada cambio a GitHub (commit + push) a los 4 segundos de dejar de editar.
2. En el VPS, `innovafit-deploy.timer` revisa GitHub cada minuto. Si hay commits nuevos en `main` ejecuta `deploy/autodeploy.sh`: actualiza el código, instala dependencias, aplica el esquema (`setup.js`) y reinicia el sitio.

En el servidor el proyecto vive en `/opt/innovafit/app`. Comandos útiles:

```bash
systemctl status innovafit                 # estado del sitio
journalctl -u innovafit -f                 # logs del sitio
journalctl -u innovafit-deploy -n 50       # últimos despliegues
```

`.env`, `data/questions.json` y `data/assessments-seed.json` (respuestas de las evaluaciones) y `pocketbase/pb_data/` no están en GitHub: viven solo en el servidor.

## Producción

- Publicá solo el puerto del sitio. PocketBase queda en `127.0.0.1` y el navegador entra por `/pb`.
- El binario de `pocketbase/` es para Windows. En un servidor Linux, bajá el de Linux desde https://github.com/pocketbase/pocketbase/releases (versión 0.40.x) y dejalo en `pocketbase/pocketbase`.
- Hacé copias de seguridad de `pocketbase/pb_data/`: ahí están la base de datos y los archivos subidos.
- El dashboard propio de PocketBase (`http://127.0.0.1:8090/_/`) sirve para tareas avanzadas con el superusuario.

## Notas

- Los archivos de las lecciones no son públicos en ningún listado, pero quien tenga el link directo de un archivo puede abrirlo.
- Para editar las preguntas o el puntaje de corte, modificá `data/questions.json` y reiniciá.
