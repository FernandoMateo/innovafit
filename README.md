# InnovaFit · Plataforma

Landing del Reto del Entrenador, evaluación de nivel, campus de alumnos y panel de administración.
Node (Express) + PocketBase.

| Ruta | Qué es |
|---|---|
| `/` | Landing para entrenadores personales |
| `/evaluacion` | Evaluación de 25 preguntas (aprueba con 80/100) |
| `/campus` | Campus del alumno: cursos, lecciones y progreso |
| `/admin` | Panel: resumen con gráficos, evaluaciones (leads), alumnos, cursos, certificados y catálogo de certificaciones |
| `/verificar` | Verificación pública de un certificado por su folio |

## Cómo funciona

- Las respuestas correctas viven solo en el servidor (`data/questions.json`). El navegador recibe las preguntas sin respuestas y el servidor corrige.
- Cada evaluación queda guardada con nombre, correo, WhatsApp y puntaje. Desde **Admin → Evaluaciones** se filtran aprobados y no aprobados, se marca el estado (nuevo, contactado, inscripto, descartado), se agregan notas y se exporta a CSV.
- **Si aprueba**: se crea su cuenta ya verificada, se le habilita el curso marcado como *Regalo al aprobar* y queda con la sesión iniciada: el botón "Entrar al campus" lo lleva directo. También ve su usuario y contraseña. Si ya tenía cuenta, el curso se suma a la misma.
- **Certificados**: al completar todas las lecciones de un curso con "Emitir al completar", el servidor verifica el progreso y emite el certificado con folio correlativo (`IF-AAAA-0001`). El admin también puede emitirlos a mano desde **Certificados**, con vista previa en vivo. Se descargan en PDF o PNG y cualquiera puede verificarlos en `/verificar`.
- **Panel del alumno**: edita sus datos, foto y contraseña; ve y descarga sus certificados; consulta las certificaciones del catálogo con un mensaje de WhatsApp armado con sus datos.
- Cada acción guardada muestra una confirmación en el centro de la pantalla.
- **Si no aprueba**: ve su mapa por bloque y la invitación a la Certificación Doble por WhatsApp.
- El admin crea cursos, sube lecciones (video, audio, PDF, imagen, link de YouTube/Vimeo o lectura), las reordena y edita. También crea alumnos y elige qué cursos ve cada uno.

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

## Despliegue automático

1. `npm run autosync` vigila la carpeta y sube cada cambio a GitHub (commit + push) a los 4 segundos de dejar de editar.
2. En el VPS, `innovafit-deploy.timer` revisa GitHub cada minuto. Si hay commits nuevos en `main` ejecuta `deploy/autodeploy.sh`: actualiza el código, instala dependencias, aplica el esquema (`setup.js`) y reinicia el sitio.

En el servidor el proyecto vive en `/opt/innovafit/app`. Comandos útiles:

```bash
systemctl status innovafit                 # estado del sitio
journalctl -u innovafit -f                 # logs del sitio
journalctl -u innovafit-deploy -n 50       # últimos despliegues
```

`.env`, `data/questions.json` (respuestas de la evaluación) y `pocketbase/pb_data/` no están en GitHub: viven solo en el servidor.

## Producción

- Publicá solo el puerto del sitio. PocketBase queda en `127.0.0.1` y el navegador entra por `/pb`.
- El binario de `pocketbase/` es para Windows. En un servidor Linux, bajá el de Linux desde https://github.com/pocketbase/pocketbase/releases (versión 0.40.x) y dejalo en `pocketbase/pocketbase`.
- Hacé copias de seguridad de `pocketbase/pb_data/`: ahí están la base de datos y los archivos subidos.
- El dashboard propio de PocketBase (`http://127.0.0.1:8090/_/`) sirve para tareas avanzadas con el superusuario.

## Notas

- Los archivos de las lecciones no son públicos en ningún listado, pero quien tenga el link directo de un archivo puede abrirlo.
- Para editar las preguntas o el puntaje de corte, modificá `data/questions.json` y reiniciá.
