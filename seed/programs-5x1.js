// Contenido de la Certificación Internacional 5×1 tomado de los PDF oficiales que entregó InnovaFit
// (noviembre 2026). Lo carga la migración 7 de setup.js; después se edita en Admin → Certificaciones.
// Portadas en seed/covers/<cover> y temarios en seed/brochures/<brochure>.
module.exports = [
  {
    match: /\bCPT\b|personal trainer|entrenador personal/i,
    keepTitle: true,
    keepImage: true,
    brochure: "cpt.pdf",
    objective:
      "Preparar entrenadores personales capaces de evaluar, planificar, ejecutar y adaptar programas de entrenamiento físico, promoviendo la salud, el rendimiento y la adherencia al ejercicio, bajo principios éticos y profesionales.",
    profile:
      "El egresado del programa CPT será capaz de desempeñarse como Entrenador Personal Certificado, aplicando principios científicos y profesionales para mejorar la salud, el rendimiento físico y la calidad de vida de sus clientes.",
    resources: [
      "Libro de texto descargable.",
      "Libro de trabajo.",
      "Formularios del cliente: PAR-Q, antecedentes de salud, exoneración de responsabilidad del entrenamiento personal, registro de alimentación y admisión de clientes.",
      "Más de 55 conferencias en video.",
      "97 videos en la biblioteca de ejercicios: bisagra, empuje, jale, sentadilla, estocada, locomoción, core, aislamiento y activación, y velocidad, agilidad y reacción.",
      "Curso de RCP y uso de desfibrilador externo automático (DEA).",
    ],
    modules: [
      {
        title: "Módulo 1: Fundamentos de la Salud y el Comportamiento",
        topics: [
          "Capítulo 1: Salud, Acondicionamiento Físico y Entrenamiento Personal",
          "Capítulo 2: Psicología del Cambio de Comportamiento",
          "Comprender a las personas, guiarlas en su proceso de cambio y apoyarlas hacia un estilo de vida más saludable.",
          "Material: 4 audioclases, 2 videoclases, 1 guía, 2 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 2: Movimiento y Sistemas de Apoyo",
        topics: [
          "Capítulo 3: Sistemas de Movimiento",
          "Capítulo 4: Sistemas de Apoyo y Soporte",
          "Cómo se integran los sistemas de movimiento y de apoyo del cuerpo para diseñar programas seguros, eficaces y basados en principios científicos.",
          "Material: 5 audioclases, 5 videoclases, 2 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 3: Biomecánica y Principios del Movimiento",
        topics: [
          "Capítulo 5: Conceptos de Biomecánica",
          "Lenguaje anatómico del movimiento, leyes de Newton, mecánica de palancas y función muscular como generadora y controladora del movimiento.",
          "Material: 7 audioclases, 3 videoclases, 1 estudio de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 4: Sistemas Energéticos y Metabolismo",
        topics: ["Capítulo 6: Energía y Metabolismo", "Material: 7 audioclases, 3 videoclases, 1 estudio de caso y cuestionario."],
      },
      {
        title: "Módulo 5: Evaluaciones y Diseño de Programas",
        topics: [
          "Capítulo 7: Evaluaciones del Cliente",
          "Capítulo 8: Elementos del Acondicionamiento Físico",
          "Capítulo 9: Principios del Diseño de Programas",
          "Evaluar la salud, el movimiento y el rendimiento, establecer líneas base, monitorear el progreso y organizar el acondicionamiento según objetivos específicos.",
          "Material: 19 audioclases, 11 videoclases, 3 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 6: Entrenamiento de Flexibilidad y Cardiovascular",
        topics: [
          "Capítulo 10: Conceptos de Flexibilidad",
          "Capítulo 11: Conceptos de Ejercicio Cardiorrespiratorio",
          "Prescribir y progresar el ejercicio cardiorrespiratorio con zonas de frecuencia cardiaca, distintos modos de entrenamiento y factores ambientales.",
          "Material: 7 audioclases, 3 videoclases, 2 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 7: Entrenamiento de Resistencia y Técnicas de Ejercicio",
        topics: [
          "Capítulo 12: Conceptos de Entrenamiento de Fuerza",
          "Capítulo 13: Selección de Ejercicios y Técnica",
          "Enseñanza y comunicación del movimiento: estilos de aprendizaje, comunicación verbal y no verbal y estrategias de indicación para seleccionar, instruir y corregir ejercicios.",
          "Material: 9 audioclases, 2 videoclases, 2 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 8: Modelo de Entrenamiento Orientado al Propósito",
        topics: [
          "Capítulo 14: Modelo de Entrenamiento Orientado al Propósito",
          "Aplicar pautas alineadas con objetivos específicos, recopilar retroalimentación en tiempo real y ajustar la intervención de manera continua.",
          "Material: 8 audioclases, 8 videoclases, 1 estudio de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 9: Nutrición y Poblaciones Especiales",
        topics: [
          "Capítulo 15: Fundamentos de la Nutrición",
          "Capítulo 16: Suplementación",
          "Capítulo 17: Afecciones Crónicas",
          "Nutrición aplicada al acondicionamiento físico e intervención con poblaciones con condiciones crónicas, con énfasis en la individualización y la seguridad.",
          "Material: 7 audioclases, 6 videoclases, 3 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Módulo 10: Negocios, Marketing y Seguridad",
        topics: [
          "Capítulo 18: Poblaciones por Etapas de Vida",
          "Capítulo 19: Negocios y Marketing",
          "Capítulo 20: Seguridad y Situaciones de Emergencia",
          "Operar y promover un negocio de entrenamiento personal, gestionar el ciclo de vida del cliente, aplicar marketing efectivo y responder ante emergencias.",
          "Material: 3 audioclases, 4 videoclases, 3 estudios de caso y cuestionario.",
        ],
      },
      {
        title: "Curso de RCP/DEA",
        topics: ["Reanimación cardiopulmonar (RCP) y uso del desfibrilador externo automático (DEA) de forma segura y efectiva."],
      },
    ],
  },
  {
    match: /prevenci[oó]n de lesiones/i,
    title: "Especialista en Prevención de Lesiones",
    kind: "especializacion",
    cover: "especialista-prevencion-lesiones.jpg",
    brochure: "especialista-prevencion-lesiones.pdf",
    order: 101,
    summary: "Cadera + columna lumbar: 2 micro-cursos especializados en 5 módulos prácticos: Understanding the Hip Complex + Understanding the Lumbar Spine.",
    highlights: ["5 módulos prácticos", "2 micro-cursos", "Cadera + columna lumbar"],
    objective:
      "Evalúa: identifica riesgos y disfunciones. Adapta: diseña entrenamientos seguros y efectivos. Entrena: aplica criterio para mejores resultados.",
    profile: "Aprende a tomar mejores decisiones: evalúa, adapta y entrena con confianza.",
    resources: ["Micro-curso Understanding the Hip Complex.", "Micro-curso Understanding the Lumbar Spine."],
    modules: [
      {
        title: "Anatomía aplicada y biomecánica lumbo-pélvica",
        topics: [
          "Anatomía funcional: estructuras clave de la columna lumbar (discos, vértebras) y articulación de la cadera",
          "El complejo lumbo-pélvico-cadera (LPHC): cómo interactúan la movilidad de la cadera y la estabilidad lumbar",
          "Patrones biomecánicos comunes: el ritmo lumbopélvico y su impacto en la sentadilla y el peso muerto",
        ],
      },
      {
        title: "Evaluación funcional y detección de molestias",
        topics: [
          "Evaluación de la movilidad de cadera: flexión y extensión, rotación interna y externa, restricciones relevantes para el entrenamiento",
          "Postura y control motor: posición pélvica, inclinación anterior y posterior, control de la pelvis en patrones básicos",
          "Red flags: señales de alerta y cuándo modificar el entrenamiento o derivar a un profesional sanitario",
        ],
      },
      {
        title: "Movilidad, liberación y activación",
        topics: [
          "Estrategias de movilidad: flexores de cadera, rotadores y glúteos, aplicadas a las necesidades individuales",
          "Liberación miofascial: uso de herramientas como complemento del entrenamiento y consideraciones de seguridad",
          "Activación y control lumbo-pélvico: core, transverso abdominal y musculatura estabilizadora, multífidos, glúteo mayor y medio, integración en patrones funcionales",
        ],
      },
      {
        title: "Selección y modificación de ejercicios",
        topics: [
          "Sentadilla: goblet squat, sentadilla al cajón, modificación de profundidad, carga y rango de movimiento",
          "Bisagra de cadera y peso muerto: variantes, peso muerto convencional vs. rumano, ajuste de rango, carga y demanda técnica",
          "Adaptación del entrenamiento: modificar un ejercicio sin perder el objetivo del estímulo, progresiones y regresiones",
          "Gestión del entrenamiento ante molestias: cuándo modificar, reducir carga o rango, o detener y derivar",
        ],
      },
      {
        title: "Casos prácticos y diseño de rutinas",
        topics: [
          "Análisis de casos: cliente con rigidez de cadera, con historial de molestias lumbares o con limitaciones de movilidad",
          "Diseño de sesión: selección y orden de ejercicios, volumen, intensidad, progresiones y regresiones",
          "Protocolo de preparación: calentamiento específico de unos 10 minutos (movilidad + activación + preparación del patrón)",
          "Aplicación final: adaptación de una rutina tradicional de piernas/glúteos y justificación de cada modificación",
        ],
      },
    ],
  },
  {
    match: /\bHIIT\b|interval training/i,
    title: "Especialista en High Intensity Interval Training (HIIT)",
    kind: "especializacion",
    cover: "especialista-hiit.jpg",
    brochure: "especialista-hiit.pdf",
    order: 102,
    summary: "Entrenamiento interválico para maximizar resultados en menos tiempo: de los intervalos aeróbicos al HIIT.",
    highlights: ["10 módulos", "De los intervalos aeróbicos al HIIT", "Programa de 4 semanas"],
    objective:
      "Diseña entrenamientos eficientes según el objetivo, adapta protocolos a diferentes niveles y clientes, y optimiza intensidad, recuperación y volumen.",
    profile: "Convierte el interval training en una herramienta de entrenamiento eficiente, efectiva y aplicable para cualquier cliente.",
    audience: ["Entrenadores y profesionales del fitness."],
    modules: [
      {
        title: "Módulo 1: Fundamentos del Interval Training",
        topics: [
          "Principios del entrenamiento interválico: trabajo y recuperación, intensidad y volumen, densidad del entrenamiento",
          "¿Qué es el interval training? Concepto, evolución del método y aplicaciones en el fitness y el rendimiento",
          "Interval training vs. HIIT: diferencias, ventajas, limitaciones y cuándo aplicar cada uno",
          "Beneficios: mayor gasto energético, mejor acondicionamiento, optimización del tiempo",
        ],
      },
      {
        title: "Módulo 2: Fisiología del Entrenamiento Interválico",
        topics: [
          "Sistemas energéticos: ATP-PCr, glucólisis anaeróbica, metabolismo oxidativo",
          "Respuesta cardiovascular y respiratoria: frecuencia cardiaca, consumo de oxígeno (VO₂), ventilación",
          "Fatiga, recuperación y adaptaciones: EPOC, adaptaciones agudas y crónicas",
          "Variables fisiológicas clave: umbrales de intensidad, lactato, FCM y zonas de entrenamiento",
        ],
      },
      {
        title: "Módulo 3: Variables del Entrenamiento Interválico",
        topics: [
          "Intensidad: % FC, RPE, velocidad, potencia",
          "Duración del trabajo y de la recuperación: intervalos cortos, medios y largos; recuperación activa o pasiva",
          "Número de intervalos, volumen total y progresión según nivel y objetivo",
          "Aplicación según el objetivo: composición corporal, acondicionamiento, rendimiento",
        ],
      },
      {
        title: "Módulo 4: Protocolos de Interval Training",
        topics: [
          "Intervalos aeróbicos extensivos e intensivos",
          "HIIT, microintervalos y Tabata (20:10)",
          "Fartlek y circuitos interválicos",
          "Complejos con implementos: mancuernas, kettlebells, barra",
        ],
      },
      {
        title: "Módulo 5: Diseño de Sesiones",
        topics: [
          "Selección del objetivo y de ejercicios funcionales y multiarticulares",
          "Estructura de la sesión: calentamiento, bloque principal, vuelta a la calma",
          "Determinación de variables: intensidad, tiempo de trabajo y de recuperación, número de rondas",
          "Ejemplo de sesión aplicado a diferentes objetivos",
        ],
      },
      {
        title: "Módulo 6: Fuerza y Resistencia Muscular",
        topics: [
          "Intervalos con resistencia: cargas, peso corporal e implementos",
          "Fuerza-resistencia y ejercicios multiarticulares: sentadillas, desplantes, empujes, jalones",
          "Carga y repeticiones: selección según el objetivo, tiempo bajo tensión, control de la técnica",
          "Técnica bajo fatiga: prevención de compensaciones y ejecución segura",
        ],
      },
      {
        title: "Módulo 7: Adaptación a Diferentes Clientes",
        topics: [
          "Principiantes, intermedios y avanzados",
          "Objetivos específicos: composición corporal, acondicionamiento, rendimiento deportivo, salud",
          "Poblaciones especiales: adultos mayores, personas con limitaciones, reincorporación al ejercicio",
          "Regresiones y progresiones",
        ],
      },
      {
        title: "Módulo 8: Control de Intensidad",
        topics: [
          "Frecuencia cardiaca: zonas y cálculo de zonas objetivo",
          "RPE (percepción de esfuerzo) y talk test",
          "Velocidad y potencia como indicadores de intensidad",
          "Percepción de fatiga y ajuste en tiempo real",
        ],
      },
      {
        title: "Módulo 9: Seguridad y Recuperación",
        topics: [
          "Evaluación previa: historial de salud y lesiones, factores de riesgo",
          "Calentamiento efectivo y ejecución segura",
          "Recuperación activa y pasiva, sueño, nutrición e hidratación",
          "Señales de alerta, sobreentrenamiento y derivación a un profesional sanitario",
        ],
      },
      {
        title: "Módulo 10: Programación Aplicada",
        topics: [
          "Estructura de un programa: microciclos, mesociclos y distribución semanal",
          "Progresión de intensidad, protocolos y volumen",
          "Ejemplo de programa de 4 semanas",
          "Evaluación, ajustes e integración con la fuerza y la periodización a largo plazo",
        ],
      },
    ],
  },
  {
    match: /speed.*agility|agility.*strength/i,
    title: "Especialista en Speed, Agility & Strength Training",
    kind: "especializacion",
    cover: "especialista-speed-agility-strength.jpg",
    brochure: "especialista-speed-agility-strength.pdf",
    order: 103,
    summary: "Ciencia, estrategia y rendimiento: domina las capacidades clave que impulsan el rendimiento deportivo y lleva a tus atletas al siguiente nivel.",
    highlights: ["8 módulos", "Certificación internacional ISSA", "Material 100% digital"],
    objective: "Domina las capacidades clave que impulsan el rendimiento deportivo y lleva a tus atletas al siguiente nivel.",
    profile: "Forma atletas más fuertes, rápidos y resistentes. Transforma el entrenamiento, transforma resultados.",
    resources: [
      "Certificación internacional ISSA, reconocida en todo el mundo.",
      "Aprendizaje flexible: estudia a tu ritmo con material 100% digital.",
      "Contenido actualizado y basado en la ciencia más reciente del rendimiento.",
      "Aplicación práctica inmediata con tus atletas.",
    ],
    modules: [
      {
        title: "Módulo 1: Fundamentos del rendimiento",
        topics: ["Ciencia del ejercicio aplicada al rendimiento", "Anatomía y biomecánica deportiva", "Principios de fuerza, potencia y resistencia", "Adaptaciones al entrenamiento"],
      },
      {
        title: "Módulo 2: Desarrollo de la fuerza",
        topics: ["Métodos de entrenamiento de fuerza", "Selección y ejecución de ejercicios", "Desarrollo de fuerza máxima y funcional", "Progresión de cargas y volumen"],
      },
      {
        title: "Módulo 3: Potencia y explosividad",
        topics: ["Desarrollo de la producción de fuerza", "Entrenamiento explosivo", "Ejercicios de potencia", "Transferencia de fuerza al rendimiento deportivo"],
      },
      {
        title: "Módulo 4: Speed, agility & quickness",
        topics: ["Desarrollo de la velocidad", "Aceleración y desaceleración", "Cambios de dirección y agilidad", "Reactividad, coordinación y rapidez"],
      },
      {
        title: "Módulo 5: Acondicionamiento y resistencia",
        topics: ["Sistemas energéticos aplicados al deporte", "Desarrollo de resistencia", "Acondicionamiento de alta intensidad", "Recuperación y manejo de la fatiga"],
      },
      {
        title: "Módulo 6: Programación deportiva",
        topics: ["Evaluación y seguimiento del atleta", "Diseño de programas personalizados", "Periodización del entrenamiento", "Preparación según objetivos y disciplina deportiva"],
      },
      {
        title: "Módulo 7: Prevención y recuperación",
        topics: ["Prevención de lesiones", "Movimiento funcional", "Manejo del sobreentrenamiento", "Estrategias de recuperación"],
      },
      {
        title: "Módulo 8: Aplicación al rendimiento",
        topics: ["Integración de fuerza, velocidad y acondicionamiento", "Diseño de sesiones completas", "Adaptación según nivel y deporte", "Evaluación y seguimiento del rendimiento"],
      },
    ],
  },
];
