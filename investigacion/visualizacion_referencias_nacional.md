# Cómo representar referencias de 1,200 unidades (diagrama + mapa de flujos + saturación)

Investigación previa a programar · 4 nov 2026.
Base actual: `web/referencias.html` (Hidalgo, 32 emisoras, ~1,100 referencias, una ficha = una referencia).

---

## 1. El problema de escala

- Con 1,033 unidades ISSSTE (ya están en `assets/estados_issste.json`, con coordenadas `xy`, estado, región y HR) y la misma tasa que Hidalgo (5.5 referencias por día hábil para 32 emisoras), el país generaría **~175 referencias por día hábil** → **~55,000 al año** y **10,000 a 20,000 abiertas** al mismo tiempo.
- El diagrama actual muestra 28 fichas por etapa. Con 10,000 abiertas, "Cita y traslado" tendría miles: no caben y el "+N" deja de informar.
- La literatura lo llama el límite de la **visualización unitaria** (una marca por registro): solo sirve si cada marca se distingue; con muchos registros hay que pasar a **agregación, muestreo o resumen** (Park et al., ATOM).
- Shneiderman lo plantea igual para datos grandes: el mantra "**visión general primero, zoom y filtro, detalle bajo demanda**" sigue vigente, pero el zoom y el filtro deben apoyarse en **marcadores agregados que representen cientos o miles de marcadores atómicos**.

**Conclusión 1:** no hay que meter más círculos, sino cambiar qué representa un círculo según el nivel de zoom.

---

## 2. Referentes revisados

### 2.1 Minería de procesos (Disco / Celonis) → para el diagrama de etapas
- El mapa de proceso de Disco muestra **frecuencia** (grosor y número en flechas y actividades) y una vista de **desempeño** (tiempo en cada paso); los filtros quitan rutas poco frecuentes para ver el flujo principal.
- Con filtros se aíslan los casos más largos y se vuelve al mapa para ver **cuellos de botella y retrabajos (loopbacks)** — exactamente las "vueltas".
- La **animación** pasa el registro real por el mapa para comunicar cuellos de botella a no expertos (es lo que ya hace el recorrido).
- Lección: el diagrama escala porque **los nodos y flechas muestran conteos y tiempos agregados**, no una marca por caso; la animación es de partículas sobre las flechas.

### 2.2 Mapas de flujo origen-destino (flowmap.gl / Teralytics) → para el mapa
- El mapa de flujos dibuja el volumen entre pares de lugares como líneas de grosor variable; es la representación más directa, pero se satura con muchos pares.
- Solución de flowmap.gl: **agrupar lugares cercanos según el nivel de zoom**; el agrupamiento se adapta para que no se dibujen demasiados flujos y ninguno sea demasiado corto, y al acercarse los grupos se abren.
- Codifica el volumen dos veces (grosor y color) y usa mezcla de color para que el mapa base siga legible con miles de flechas; al acercarse aparecen los flujos más grandes de esa vista.
- Encuesta EuroVis 2021 (Tennekes y Chen): los mapas de flujo funcionan con pocos datos; con muchos, la oclusión se vuelve el problema y la solución común es **agrupar nodos y aristas**, o usar **vistas múltiples coordinadas**.
- Alternativas para muchos-a-muchos: **matriz OD** (filas origen, columnas destino; pierde la geografía), **OD maps** y **edge bundling** (agrupar líneas en haces).

### 2.3 Salud
- Etiopía (PLOS Digital Health 2023): red de 21 unidades en 3 niveles; visualizaron el flujo de referencia 1º → 2º → 3º con **diagramas Sankey**.
- Tableros comerciales de referencias (Definitive HC, McKinsey RMI): líneas origen → destino coloreadas por dentro/fuera de red, y **tiempos de espera entre encuentros** para ubicar barreras de acceso.

### 2.4 Saturación: teoría de colas
- NHS (Fong et al.): las colas aparecen cuando no cuadran demanda y capacidad; la **Ley de Little** aplica a la lista de espera "como las leyes de Newton a una piedra lanzada".
- Demanda = referencias por semana; capacidad = salidas de la lista por semana (cuando no se vacía).
- NHS Improvement: una lista que **crece** indica desbalance; si es estable, hay equilibrio.
- Las inasistencias deben sumarse a la demanda efectiva al calcular capacidad (Izady, Southampton).

---

## 3. Propuesta de diseño

### Nivel 0 · Visión general nacional
**A. Mapa de flujos** (nuevo, usando `estados_issste.json`):
- **Nodos** = unidades receptoras agrupadas jerárquicamente. En lugar del agrupamiento por píxeles de flowmap.gl, usar la jerarquía real: **región (16 HR) → estado → unidad**.
- **Círculo del nodo**: tamaño = pendientes (lista de espera); color = **índice de saturación** (abajo).
- **Flechas** emisora → receptora agregadas al nivel de zoom: grosor = referencias por semana; color = % fuera del plazo de 15 días (o días promedio).
- Flechas especiales: **fuera de región** (microrregión, punteadas) y **escalamiento a 3er nivel / CMN 20 de Noviembre**.
- Animación de partículas sobre las flechas: **1 partícula = N referencias** (N se ajusta al zoom), como el replay de Disco.
- Filtro "mostrar solo el 20 % de flujos más grandes" (simplificación de Disco) para no saturar.

**B. Diagrama de etapas agregado** (evolución del actual):
- Cada nodo muestra **número grande + barra de antigüedad** por semáforo (≤10, 11-15, 16-30, 31-90, >90 días) en vez de fichas.
- **Flechas con grosor = flujo por día** y etiqueta de tiempo mediano (vista de desempeño).
- Puntos animados: **1 punto = N referencias**, con leyenda visible "• = 25 referencias".

### Nivel 1 · Zoom y filtro (región o estado)
- Al tocar una región en el mapa: se abren sus estados y unidades; los flujos se recalculan a nivel unidad.
- El diagrama de etapas se filtra a esa región; N baja (1 punto = 5).
- Matriz OD región × región como vista complementaria para ver de un vistazo quién manda a quién.

### Nivel 2 · Detalle bajo demanda (una unidad)
- Al tocar una unidad: **vuelve la vista actual**, una ficha = una referencia, con su panel, ruta y pasos "no registrado".
- Panel de la unidad: embudo de sus referencias, lista de crónicas y de las que dan vueltas.

### Índice de saturación por unidad receptora (ventana de 4 semanas)
| Medida | Cálculo |
|---|---|
| Demanda λ | referencias aceptadas por semana (+ reprogramaciones por inasistencia) |
| Capacidad μ | pacientes atendidos (primera consulta) por semana |
| Utilización ρ | λ / μ — mayor que 1 = la lista crece |
| Lista de espera L | referencias aceptadas aún sin atender |
| Espera estimada W | L / μ (Ley de Little), en días; comparar contra 15 |
| Tendencia | cambio de L en 4 semanas |
| Sin respuesta | referencias en limbo en esa receptora |

Semáforo de saturación: verde W ≤ 15 d y ρ < 0.9 · amarillo W ≤ 30 · naranja W ≤ 90 o ρ ≥ 1 · rojo W > 90 o L creciendo 4 semanas seguidas.

---

## 4. Implicaciones técnicas

- **Motor**: ~55,000 referencias × ~10 tramos ≈ 550,000 tramos; cabe en memoria, pero no se puede recorrer todo cada cuadro. Hay que **precalcular un cubo diario** (día × unidad × etapa → conteos, flujos OD, atenciones) en un **Web Worker** (el proyecto ya usa workers: `torre-worker.js`, `plan-worker.js`).
- **Render**: para ~1,000 nodos y algunos miles de flujos agregados basta **Canvas 2D** (o el Three.js que ya está en `vendor/`). flowmap.gl requiere deck.gl; se puede replicar la idea con la jerarquía región → estado → unidad sin la dependencia.
- **Datos**: reutilizar `estados_issste.json` (1,033 unidades con `xy`, estado, región, HR) y las reglas de regionalización y microrregionalización 2025.
- **Calibración**: tasa de referencia por unidad proporcional a su población usuaria (anexo de regionalización 2025).

---

## 5. Fases sugeridas

1. Motor nacional + cubo diario en worker + pruebas de rendimiento.
2. Diagrama de etapas agregado (puntos = N referencias, barras de antigüedad, flechas por flujo y tiempo).
3. Mapa de flujos con jerarquía región → estado → unidad e índice de saturación.
4. Enlace entre vistas: tocar en el mapa filtra el diagrama; tocar una unidad abre la vista detallada actual.

---

## Fuentes

- Shneiderman, The Eyes Have It (1996): https://webspace.science.uu.nl/~telea001/uploads/VACourse/Shneiderman96.pdf
- Shneiderman, Extreme visualization (2008): https://www.cs.umd.edu/~ben//papers/Shneiderman2008Extreme.pdf
- Park et al., ATOM: unit visualizations: https://crystal.uta.edu/~park/files/atom/atom.pdf
- Fluxicon Disco, map view: https://www.fluxicon.com/book/read/mapview/
- Disco en bpmNEXT (filtros, desempeño, animación): https://column2.com/2013/03/bpmnext-fluxicon-peopleserv-signavio-itp-commerce/
- Teralytics, Visualizing mobility data: the scalability challenge: https://medium.com/teralytics/visualizing-mobility-data-the-scalability-challenge-2575fe819702
- Boyandin, flowmap.gl (FOSDEM 2026): https://archive.fosdem.org/2026/schedule/event/DC9M73-sqlrooms-flowmap/
- Tennekes y Chen, Design Space of OD Data Visualization (EuroVis 2021): https://diglib.eg.org/bitstream/handle/10.1111/cgf14310/v40i3pp323-334.pdf
- Yang et al., Many-to-Many Geographically-Embedded Flow Visualisation: https://arxiv.org/pdf/1908.02052
- Kassie y Tegenaw, patient flow Ethiopia (PLOS Digital Health 2023): https://ideas.repec.org/a/plo/pdig00/0000376.html
- Definitive HC, referral patterns: https://www.definitivehc.com/blog/interpreting-medical-claims-data-with-visual-analytics
- McKinsey, Referral Mapping Insights: https://www.mckinsey.com/industries/healthcare/how-we-help-clients/healthcare-analytics/overview/referral-mapping-insights
- Fong et al., Understanding Waiting List Pressures (NHS): https://medrxiv.org/content/10.1101/2022.08.23.22279117v1.full.pdf
- NHS Improvement, Capacity and Demand: https://www.england.nhs.uk/improvement-hub/wp-content/uploads/sites/44/2017/11/Capacity-and-Demand-Expert-on-Call.pdf
- Izady, Appointment capacity planning in specialty clinics: https://eprints.soton.ac.uk/373484/1/paper-Final.pdf

---

## 6. Implementado (4 nov 2026)

`referencias.html?red=nacional` (selector «Hidalgo · detalle | Nacional · agregado»):

| Fase | Archivos | Qué hace |
|---|---|---|
| 1 | `js/referencias.js` (red), `js/referencias-cubo.js`, `js/referencias-worker.js` | Motor para cualquier red (902 emisoras → 131 receptoras), cubo diario (etapas × antigüedad, saturación por Ley de Little, flujos OD) en un worker |
| 2 | `js/referencias-agregado.js`, `js/referencias-diagrama.js` | Diagrama agregado: 1 punto = N, barras de antigüedad, flechas por pasos/día, partículas, filtros región/estado, receptoras más saturadas |
| 3 | `js/referencias-mapa.js` | Mapa de flujos en canvas: país → estados; región/estado → unidades; círculo = lista de espera, color = saturación; fuera de región punteado, escalamientos en morado |
| 4 | (mismos) | Tocar un estado filtra todo; tocar una unidad cambia el diagrama a una ficha por referencia de esa unidad y abre cada ficha |

Pruebas: `node tests/referencias.test.mjs` y `node tests/referencias-nacional.test.mjs` (el cubo se compara contra el motor en 5 días × 3 filtros).
