# Recorrido de referencia y contrarreferencia (SIRECO · ISSSTE)

Investigación base para construir el segundo "recorrido" del gemelo digital (mismo patrón que `expedientes.html` / `contratos.js`).
Fecha de la investigación: 4 nov 2026.

Convención de este documento:
- **[NORMA]** = sale de una norma o documento oficial del ISSSTE / Salud.
- **[DATO]** = cifra medida y publicada (informe, estudio, nota periodística).
- **[SUPUESTO]** = valor propuesto para la simulación; no hay norma que lo fije. Ajustar con la experiencia de campo.

---

## 1. Marco normativo

| Documento | Qué aporta |
|---|---|
| Reglas para la Regionalización Operativa del Sistema Institucional de Servicios de Salud del ISSSTE (elaboradas 06/06/2025, publicadas DOF 2025; abrogan las de 9 ago 2016) | Definición oficial de SIRECO, niveles de atención, tipologías de unidad, 16 regiones, microrregionalización, telemedicina |
| Reglamento de Servicios Médicos del ISSSTE | Definición de referencia y contrarreferencia; obligaciones de la unidad que refiere (art. 116) |
| Manual / Procedimientos del Sistema Institucional de Referencia y Contrarreferencia de Pacientes (versión proyecto 2014, Dirección Médica – Subdirección de Regulación y Atención Hospitalaria) | Formato SM-1-17, Área de Referencia y Contrarreferencia en cada unidad, llenado del formato. **Confirmar versión vigente.** |
| NOM-004-SSA3-2012 Del expediente clínico | Contenido mínimo de la nota de referencia/traslado |
| Reglamento de Quejas Médicas y Solicitudes de Reembolso del ISSSTE | Salida cuando hay negativa, deficiencia o imposibilidad de atención |
| Programa Institucional ISSSTE 2025-2030 | Indicador de citas de especialidad programadas a más de 15 días |

### Definiciones oficiales
- **SIRECO [NORMA]**: procedimiento médico-administrativo entre unidades de 1º, 2º y 3º nivel para el envío – recepción – regreso de pacientes, con atención oportuna, integral y de calidad.
- **Referencia [NORMA]**: la unidad médica, por indicación de un médico, envía al paciente a otra unidad de 2º o 3º nivel.
- **Contrarreferencia [NORMA]**: una vez dada la atención especializada o los auxiliares de diagnóstico/tratamiento, la unidad de 2º o 3º nivel regresa al paciente a la unidad que lo refirió para su control y seguimiento.

---

## 2. Red y actores

### Tipologías de unidad [NORMA]
- **1er nivel**: CMCT (consultorio en centro de trabajo), CAF (consultorio de atención familiar), UMF, CMF.
- **2º nivel**: CE, CE+Q, CH (clínica hospital), HG, CMFE, CMFE+Q.
- **3er nivel**: HR / HAE (hospitales regionales de alta especialidad) y CMN "20 de Noviembre".

### Regionalización [NORMA]
- 16 regiones, cada una encabezada por un HR/HAE que concentra referencias de 1º y 2º nivel.
- 1,114 unidades médicas (Catálogo Único dic 2024); 13.96 millones de derechohabientes.
- El CMN "20 de Noviembre" no pertenece a ninguna región: recibe referencias de todo el país.
- **Microrregionalización**: una unidad puede referir fuera de su región a la unidad más cercana con capacidad resolutiva.
- Donde no hay HG en la región, el 1er nivel usa 2º nivel de otra región y telemedicina.
- Regiones **sin Hospital General** (N/A): VIII Michoacán, XI Veracruz, XII Oaxaca, XIV Morelos, XVI Guerrero → el salto CH → HR es directo.

### Hidalgo (dato útil para el gemelo) [NORMA]
- Región I, encabezada por HR (HAE) "Primero de Octubre" (CDMX).
- 2º nivel en Hidalgo: HG "Dra. Columba Rivera Osorio" (Pachuca), CH Huejutla, CH Ixmiquilpan, CMFE Pachuca.
- 1er nivel: 18 UMF, 10 CAF, 2 CMF, 2 CMCT.
- Microrregión: **CH Huejutla refiere a Región IX, HG Tampico**.
- En Veracruz: CH Tuxpan y CH Poza Rica refieren a HG Tampico; UMF Huayacocotla refiere al HR "Primero de Octubre".

### Actores del flujo
| Actor | Papel |
|---|---|
| Médico familiar / general (UMF/CMF) | Decide la referencia, elabora nota y SM-1-17 |
| Jefe inmediato / Director de la unidad | Vo.Bo. y firma del formato |
| Área de Referencia y Contrarreferencia (unidad emisora) | Valida, sella, verifica vigencia, tramita cita y traslado |
| Área administrativa de viáticos y pasajes | Pasajes de paciente y acompañante cuando la cita es foránea |
| Área de Referencia y Contrarreferencia (unidad receptora) | Recibe, agenda, registra |
| Médico especialista (2º/3º nivel) | Atiende, estudia, trata; elabora contrarreferencia |
| Paciente / acompañante | Acude a la cita; puede no acudir o abandonar |
| Subdelegación médica / HR concentrador | Coordinación regional |

---

## 3. Flujo normal

| # | Etapa (id) | Área | Documentos | Qué pasa | Tiempo base simulación |
|---|---|---|---|---|---|
| 1 | **CONSULTA** | UMF/CMF · médico familiar | Nota de evolución; nota de referencia (NOM-004) | El caso rebasa la capacidad resolutiva del 1er nivel | 20 min [SUPUESTO] |
| 2 | **SOLICITUD** | UMF · médico + jefe | SM-1-17 anverso (datos, diagnóstico, resumen médico, Vo.Bo., sello) | Se llena y autoriza la solicitud | mismo día, ≤ 1 día hábil [SUPUESTO] |
| 3 | **VALIDACION** | Área de Referencia (emisora) | SM-1-17, vigencia de derechos, clave de traslado | Revisa pertinencia y región destino; tramita la cita ante la receptora (art. 116 II) | 1 a 5 días hábiles [SUPUESTO] |
| 4 | **CITA** | Agenda de la receptora | Comprobante de cita | Espera de primera consulta de especialidad | ver §5 (es el cuello de botella) |
| 5 | **TRASLADO** *(solo foráneos)* | Viáticos y pasajes | Orden de pasajes | Paciente y acompañante viajan a la sede | 2 h a 1 día [SUPUESTO] |
| 6 | **ESPECIALIDAD** | CE/CH/HG · especialista | Expediente, estudios, notas | Primera consulta, estudios, tratamiento o cirugía | ver §5 |
| 7 | **CONTRARREF** | Especialista + Área de Referencia (receptora) | SM-1-17 reverso "Orden de Contrarreferencia" (plan de manejo) | Alta del motivo de envío y regreso a la unidad de origen | ≤ 1 día tras el alta [SUPUESTO] |
| 8 | **SEGUIMIENTO** | UMF · médico familiar | Contrarreferencia integrada al expediente | Control y seguimiento según el plan | 1 consulta, 7 a 30 días [SUPUESTO] |
| 9 | **CERRADO** | Archivo | — | Caso cerrado | — |

Notas:
- La contrarreferencia es **obligatoria**: todo caso debe llenar el reverso del SM-1-17 [NORMA].
- La unidad que refiere es responsable de llenar la solicitud, tramitar la cita, avisar al paciente, enviarlo y procesar su contrarreferencia [NORMA, art. 116].
- Subflujo de **3er nivel**: si el 2º nivel no resuelve, se repiten SOLICITUD → VALIDACION → CITA → TRASLADO → ESPECIALIDAD hacia HR/HAE o CMN, y la contrarreferencia regresa en cascada (3º → 2º → 1º o 3º → 1º).

---

## 4. Flujos anómalos (desvíos)

| id | Desvío | Disparador | De → a | Evidencia | Prob. simulación |
|---|---|---|---|---|---|
| **RECHAZO** | Referencia rechazada / no pertinente | Formato incompleto, sin vigencia, no corresponde a la región, no pertinente | VALIDACION → CONSULTA (corrige y reenvía) | [SUPUESTO] | 5–10 % |
| **DIFERIDA** | Cita diferida (> 15 días) | Saturación de agenda | CITA (se queda) | 96.4 % de citas de especialidad del ISSSTE a > 15 días en 2026 [DATO] | ver §5 |
| **AGENDA_CERRADA** | Agenda cerrada por cierre de año | Oct–dic sin programación; fechas pasan al año siguiente | CITA (bloqueo estacional) | Xalapa, dic 2025 [DATO] | oct–dic: +60–90 días |
| **INASISTENCIA** | Paciente no acude / abandona | Distancia, costo, mejora o decide no operarse | CITA o ESPECIALIDAD → CONSULTA (reprograma) o PERDIDO | IMSS: 14.1 % abandonó tratamiento; 10 % sin registro de que pidió consulta [DATO] | 10–15 % |
| **URGENCIA** | Vía urgencias | Deterioro agudo en cualquier etapa | cualquiera → URGENCIAS (triage) → ESPECIALIDAD/hospitalización | Triage IMSS: rojo inmediato, naranja 10 min, amarillo 30–60 min, verde 120 min, azul 180–240 min [DATO, IMSS] | 2–5 % |
| **FUERA_REGION** | Referencia a otra región | Microrregionalización o región sin HG | VALIDACION → CITA en otra región (+ TRASLADO largo) | [NORMA] | según unidad (p. ej. Huejutla → Tampico) |
| **TELEMEDICINA** | Valoración a distancia | Unidad lejana con enlace | VALIDACION → TELECONSULTA → CONTRARREF o ESPECIALIDAD presencial | 859 unidades con telemedicina en mayo 2026 [DATO] | 10–20 % en rurales [SUPUESTO] |
| **TERCER_NIVEL** | Escalamiento a 3er nivel | Rebasa capacidad del 2º | ESPECIALIDAD → SOLICITUD (subflujo 3º) | [NORMA] | 5–10 % [SUPUESTO] |
| **ESTUDIO_DIFERIDO** | Estudio diagnóstico diferido | Falta de equipo/insumo/agenda | ESPECIALIDAD (se queda) | Puebla: hasta un año para estudios [DATO] | 15–25 % de casos con estudio [SUPUESTO] |
| **SIN_CONTRARREF** | Contrarreferencia no emitida o incompleta | El paciente queda "atrapado" en 2º nivel o regresa sin plan | ESPECIALIDAD → (nunca) CONTRARREF | Estudio IMSS Palau: ningún expediente cumplió los 16 puntos de calidad [DATO] | 20–40 % [SUPUESTO] |
| **QUEJA** | Queja médica / reembolso | Negativa, deficiencia o imposibilidad de atención | cualquiera → QUEJA (Comisión de Quejas Médicas) | [NORMA] | 1 % [SUPUESTO] |
| **DEFUNCION** | Defunción antes de resolver | — | cualquiera → CERRADO (desenlace) | IMSS cirugía general: 1 % no resuelto (deceso) [DATO] | ~1 % |

---

## 5. Tiempos para la simulación

### Evidencia
- **Indicador ISSSTE [DATO]**: % de citas de especialidad con programación > 15 días: **58.3 % (2024) → 78 % (2025) → 96.4 % (2026)**; meta sexenal 43.5 % (Programa Institucional 2025-2030; Anexo del Segundo Informe).
- También existe el indicador "% de cirugías con programación > 21 días en unidades con quirófano" [NORMA, Programa Institucional].
- **Prensa [DATO]**: Xalapa (dic 2025) cita de especialidad entre 3 y 6 meses; Puebla (2026) al menos 3 meses para especialista y hasta 1 año para estudios.
- **Circuito completo 1º→2º→1º (IMSS, cirugía general) [DATO]**: 84.8 % resuelto, mediana **72 días** (RIC 50–112); 66 % resuelto a 3 meses, 90 % a 6 meses. Es IMSS, no ISSSTE: usar como referencia de forma, no de magnitud.
- Primer nivel: meta antigua del ISSSTE de bajar la cita en UMF de un mes a 4 días [DATO, antiguo].

### Propuesta de distribuciones [SUPUESTO calibrado con lo anterior]
| Etapa | Distribución sugerida | Mediana | P90 | Semáforo (verde / amarillo / naranja / rojo) |
|---|---|---|---|---|
| CONSULTA | fija | 20 min | — | — |
| SOLICITUD | uniforme 0–1 día hábil | 0.5 d | 1 d | ≤1 / 2 / 3 / >3 días |
| VALIDACION | lognormal | 2 d háb. | 5 d háb. | ≤3 / ≤5 / ≤10 / >10 días |
| CITA (2º nivel) | lognormal; 96 % > 15 días | 60 d | 150 d | ≤15 / ≤30 / ≤90 / >90 días |
| CITA (3er nivel) | lognormal | 75 d | 180 d | igual que arriba |
| TRASLADO local / foráneo | fija | 2 h / 1 d | — | — |
| ESPECIALIDAD (consulta + estudios) | lognormal | 21 d | 90 d | ≤30 / ≤60 / ≤120 / >120 días |
| CIRUGÍA electiva (si aplica) | lognormal | 30 d | 120 d | ≤21 / ≤45 / ≤90 / >90 días |
| CONTRARREF (emisión) | 0–1 día tras alta | 0.5 d | 3 d | ≤1 / ≤3 / ≤7 / >7 días |
| SEGUIMIENTO | uniforme 7–30 d | 15 d | 28 d | — |
| **Circuito completo** | resultado | ~90 d | ~200 d | ≤45 / ≤90 / ≤180 / >180 días |

Ajustes estacionales:
- Oct–dic: agenda cerrada → +60 a 90 días a CITA para solicitudes nuevas.
- Rural / foráneo: +1 día de traslado por tramo y +5 a 10 % de inasistencia.

---

## 6. Indicadores para la página

1. % de citas de especialidad a > 15 días (indicador oficial ISSSTE).
2. Tiempo de circuito completo (emisión de referencia → contrarreferencia), mediana y P90.
3. % de referencias con contrarreferencia emitida.
4. % de inasistencia / abandono.
5. % de referencias rechazadas por pertinencia.
6. Referencias fuera de región y por telemedicina.
7. Casos en espera por etapa y por unidad receptora (cuello de botella).
8. Escalamientos a 3er nivel y al CMN "20 de Noviembre".

---

## 7. Cómo mapearlo al código (mismo patrón que contratos)

- Catálogo `ETAPAS` con `{ n, area, docs, sla }`: CONSULTA, SOLICITUD, VALIDACION, CITA, TRASLADO, ESPECIALIDAD, CONTRARREF, SEGUIMIENTO, CERRADO.
- Desvíos: RECHAZO, INASISTENCIA, URGENCIA, TELEMEDICINA, TERCER_NIVEL, ESTUDIO_DIFERIDO, SIN_CONTRARREF, QUEJA, DEFUNCION.
- Ficha = una referencia (no un paciente); color = unidad emisora o especialidad; anillo = semáforo de espera.
- Documentos por etapa: nota de referencia (NOM-004), SM-1-17 anverso, comprobante de cita, orden de pasajes, notas de especialidad, SM-1-17 reverso.
- **Lección del recorrido de contratos**: calcular cada etapa con ventanas que no se tapen entre sí (en contratos, la cuarentena tapaba la ventana de factura y la OS brincaba a Pago). Aquí, por ejemplo, TRASLADO no debe solaparse con CITA ni ESPECIALIDAD.

---

## 8. Huecos por confirmar

- Versión vigente del manual de procedimientos SIRECO y del formato SM-1-17.
- Plazos internos reales del Área de Referencia (validación, trámite de cita).
- Vigencia de la referencia en el ISSSTE (no se encontró el dato oficial).
- Proporciones reales de rechazo, inasistencia y contrarreferencia no emitida en las unidades de Hidalgo.
- Reglas actuales de pasajes y acompañante.

---

## 9. Fuentes

- Reglas para la Regionalización Operativa del ISSSTE (DOF 2025): https://dof.gob.mx/2025/ISSSTE/Reglas-Regionalizacion-Operativa-del-ISSSTE.pdf
- Reglamento de Servicios Médicos del ISSSTE: http://www.ordenjuridico.gob.mx/Federal/Combo/R-169.pdf
- Reglamento de Servicios Médicos del ISSSTE (versión normateca SEP 2026): https://normatecainterna.sep.gob.mx/storage/recursos/2026/02/iOPAxiWGuf-reglamento_servicios_medicos_issste.pdf
- Manual SIRECO ISSSTE (proyecto 2014): https://es.scribd.com/document/604255941/3-Manual-Sireco-10-03-14-1-Proyecto
- Formato SM-1-17 (ejemplo): https://www.studocu.com/es-mx/document/colegio-partenon/computer-science-sl/sm-17-limpio-fdsakfmkasmfosamfmqewofjopswemfklxmvklxv/100265101
- Indicador citas > 15 días, ISSSTE (Su Médico, oct 2026): https://www.sumedico.com/opinion/2026/10/8/segundo-informe-la-salud-sigue-siendo-variable-de-ajuste-53692.html
- Indicadores del Programa Institucional ISSSTE (CONEVAL 2023): https://WWW.CONEVAL.ORG.MX/coordinacion/IMPPS/Documents/Fichas_PND_2023/Institucional_Issste_Ficha_2023.pdf
- Esperas Xalapa (Golpe Político, dic 2025): https://golpepolitico.com/2025/12/01/pacientes-del-issste-podrian-esperar-entre-tres-y-seis-meses-para-una-consulta-de-especialidad/
- Esperas Puebla (La Jornada de Oriente, 2026): https://www.lajornadadeoriente.com.mx/puebla/en-el-issste-se-registran-esperas-de-por-lo-menos-tres-meses-para-consultas-con-especialistas-y-de-un-ano-para-estudios/
- Circuito completo IMSS (Rev Med IMSS 2019): https://www.redalyc.org/journal/4577/457762231005/457762231005.pdf
- Calidad de contrarreferencia (tesis IMSS Palau): https://ru.dgb.unam.mx/bitstream/20.500.14330/TES01000671945/3/0671945_A1.pdf
- Triage IMSS (tiempos por color): https://ciencialatina.org/index.php/cienciala/article/view/22273
- Telemedicina ISSSTE 2026: https://consultorsalud.com.mx/?p=315454
- Pasajes (convenio ISSSTE Coahuila): https://vanguardia.com.mx/coahuila/saltillo/pagara-issste-coahuila-4-mdp-al-grupo-senda-por-traslado-de-derechohabientes-CTVG3215241
- Reglamento de Quejas Médicas y Reembolso ISSSTE: https://vlex.com.mx/vid/reglamento-quejas-medicas-solicitudes-1042929297
- NOM-004-SSA3-2012: https://www.dof.gob.mx/nota_detalle.php?codigo=5272787&fecha=15/10/2012

---

## 10. Reglas de negocio del usuario (experiencia de campo, 4 nov 2026)

> Estas reglas vienen del usuario y **tienen prioridad** sobre los [SUPUESTO] de las secciones 3 a 5.

### 10.1 Plazo de 15 días
- Por norma la referencia tiene **15 días para resolverse**.
- En la práctica se rebasa: hay casos que **tardan meses**.
- El tablero usa los 15 días como plazo principal del semáforo de la referencia:
  - verde ≤ 10 días · amarillo 11–15 · naranja 16–30 · rojo 31–90 · **crónico > 90 días** (se lista aparte).
- **Confirmado por el usuario**: los 15 días cuentan **desde que se crea la referencia hasta que el paciente es atendido** en la unidad a la que fue enviado. La contrarreferencia queda fuera de este plazo (se mide aparte).
- **Paso clave: ACEPTACIÓN por la unidad receptora.** La unidad a la que se envía debe aceptar la referencia; sin aceptación no hay cita. Es una etapa propia del flujo:
  - `ACEPTACION` (Área de Referencia de la unidad receptora): acepta, rechaza o devuelve.
  - Si **rechaza o devuelve** → regresa a la unidad emisora y suma una **vuelta** (ver 10.3).
  - Si la receptora **no responde**, la referencia se queda en limbo y consume los 15 días: es una de las causas de que se queme.
- Flujo normal actualizado: CONSULTA → SOLICITUD → VALIDACION (emisora) → **ACEPTACION (receptora)** → CITA → TRASLADO → **ATENDIDA** ⟵ aquí termina el reloj de 15 días → ESPECIALIDAD → CONTRARREF → SEGUIMIENTO → CERRADO.
- Indicadores derivados: tiempo de aceptación, % aceptadas a la primera, % rechazadas por la receptora y su motivo, referencias sin respuesta de la receptora.

### 10.2 El problema central: estatus de cierre que no se puede rastrear
Hoy no se distingue por qué terminó una referencia. Casos reales:
1. **Atendida y no cerrada**: el paciente sí fue atendido, pero nadie emitió ni registró la contrarreferencia.
2. **El paciente no acudió**: la cita pasó sin registro de asistencia.
3. **Se quemó**: la referencia venció sin usarse (plazo agotado).
4. **Cierre natural**: atendida y contrarreferida correctamente.

El gemelo debe separar estos estados de forma explícita:

| Estado final | Cómo se determina en la simulación | Evidencia que deja |
|---|---|---|
| `CERRADA_NATURAL` | Hay contrarreferencia registrada | SM-1-17 reverso |
| `ATENDIDA_SIN_CIERRE` | Hay atención en receptora, sin contrarreferencia tras N días | Nota de especialidad, sin reverso |
| `NO_ACUDIO` | Fecha de cita pasada sin registro de atención | Comprobante de cita sin nota |
| `QUEMADA` | Venció el plazo sin cita o sin uso | Solo la solicitud |
| `SIN_RASTRO` | No hay ningún evento posterior que permita clasificarla | Nada; caso "huérfano" |

`SIN_RASTRO` es el estado que hoy domina en la realidad: el tablero debe mostrar cuántas referencias caen ahí, porque es la medida del problema de trazabilidad.

### 10.3 Referencias que "dan vueltas"
- Algunas referencias rebotan varias veces antes de entrar al flujo normal (rechazo, corrección, reenvío a otra unidad, cambio de región, reprogramación).
- Cada ficha lleva un **contador de vueltas** y su **ruta** (lista de unidades y etapas por las que pasó).
- El tablero señala las que llevan ≥ 2 vueltas y las muestra con su recorrido completo.

### 10.4 Qué debe informar el tablero (requisito del usuario)
1. Referencias abiertas por antigüedad: ≤ 15 d, 16–30, 31–90, > 90 días (**crónicas**), con lista de las crónicas.
2. Desglose de estados finales: cierre natural, atendida sin cierre, no acudió, quemada, sin rastro.
3. Referencias con vueltas (≥ 2) y su ruta.
4. % resueltas dentro de los 15 días de norma.
5. Por unidad emisora y receptora: dónde se acumulan las atendidas sin cierre y las sin rastro.
