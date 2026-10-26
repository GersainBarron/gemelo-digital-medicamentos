# Visor 3D · CEDIS Medicamentos

Visor web del gemelo digital del almacén, con simulación animada, indicadores (KPIs),
inspección de objetos y capas. Funciona en PC y en iPad (Safari).

## Cómo abrirlo

1. Doble clic en **`serve.bat`** (usa Python; si no lo tienes, usa el Python que trae Blender).
2. En la PC abre la dirección `http://localhost:8080`.
3. En el iPad (misma red Wi-Fi) abre en Safari la dirección `http://192.168.x.x:8080`
   que aparece en la ventana del servidor.
   - Si Windows pregunta por el Firewall, permite el acceso en **redes privadas**.
   - Para usarlo como app: Safari → Compartir → **Agregar a pantalla de inicio**.

> No funciona abriendo `index.html` con doble clic: los navegadores bloquean la carga
> del modelo desde archivos locales. Siempre usa el servidor.

## Uso

| Acción | iPad | PC |
|---|---|---|
| Girar | 1 dedo | clic izquierdo |
| Zoom | pellizcar | rueda |
| Desplazar | 2 dedos | clic derecho |
| Inspeccionar | tocar un objeto | clic |
| Pausa / reproducir | botón ▶ | barra espaciadora |
| Cámaras | barra inferior | teclas 1–8 |

- **Capas**: techo, muros, exterior, rutas, zonas, ocupación de ubicaciones, nodos, etiquetas, sombras.
- **Indicadores**: flujo del turno, ocupación por pasillo, temperatura del cuarto frío, andenes,
  equipos con batería, alertas y bitácora. Toca un equipo de la lista para ubicarlo.
- **Inspector**: al tocar un equipo puedes **Seguir** su recorrido.

### Paneles de medicamentos (pestañas del panel Indicadores)

| Pestaña | Contenido |
|---|---|
| Almacén | flujo del turno, ocupación, inventario (cobertura, caducidad, exactitud), cuarto frío, andenes |
| Entradas | KPIs de recepción (cumplimiento de proveedor, tiempo de descarga, rechazos, cadena de frío) y arribos de hoy |
| Salidas | KPIs de surtido y entrega (nivel de servicio, OTIF, claves negadas) y las 9 rutas del día con sus paradas |
| Unidades | 60 unidades IMSS e ISSSTE de Hidalgo: mapa, filtros por institución y ruta, búsqueda y estado de entrega |
| Urgencias | solicitudes N1 vital / N2 urgente / N3 prioritario, con límite de entrega; botón para simular una |

Toca una unidad o una urgencia para ver su ficha (CLUES, ruta, frecuencia, tiempo de traslado).
Los datos operativos son simulados; las unidades vienen del catálogo CLUES (agosto 2026).

Archivos: `js/ops.js` (simulación logística y metas en `TARGETS`), `js/ops-ui.js` (paneles),
`assets/unidades_hidalgo.json` (unidades, rutas, contorno del estado y ubicación del CEDIS).

### Vista de la unidad médica (`unidad.html`)

Botón **Unidad médica** en la barra superior (o **Abrir vista de la unidad** en la ficha de una unidad).
Elige cualquiera de las 60 unidades y verás:

- Indicadores: recetas atendidas y surtidas completas, piezas a pacientes, cirugías, claves con abasto,
  claves en cero, cobertura y entradas del CEDIS.
- Gráfica de entradas y salidas de los últimos 30 días y movimientos de hoy en vivo: recetas en farmacia,
  consumo de quirófano y entregas del CEDIS (con claves surtidas y faltantes).
- 60 medicamentos del Compendio Nacional (CNIS) en tabla o en gráficas; toca uno para ver su existencia,
  entradas y salidas por día y su kárdex.

**Unidad en 3D** (arriba de la página): hospital tipo modelado en Blender (`bodega/unidad/unidad_builder.py`).
Cada paciente es una receta de la simulación: sale del consultorio, espera en la sala, pasa a una de las
3 ventanillas y sale con su bolsa. Cada enfermera es un vale de quirófano (verde) o de urgencias (azul) que va
a la ventanilla de vales y regresa con los medicamentos. Toca a cualquier persona, sala, cubículo o a la
camioneta del CEDIS para ver qué medicamentos lleva. Usa 1× para verlos caminar en tiempo real.
En las UMF solo se muestran las áreas de primer nivel.

Archivos: `js/supply.js` (simulación de abasto por unidad), `js/unidad.js`, `js/unit3d.js`, `css/unidad.css`,
`assets/unidad_medica.glb` + `assets/unidad_layout.json` (modelo y rutas),
`assets/medicamentos.json` (catálogo de claves).

### Alertas de la unidad al CEDIS

Cuando una clave llega a cero en una unidad, la unidad envía una solicitud urgente (`SOL-…`):
N1 vital (epinefrina, atropina, oxitocina, glucosa 50 %, cloruro de potasio), N2 urgente (otras claves de
quirófano/urgencias y tratamientos crónicos) o N3 prioritaria (resto). Si el CEDIS no tiene la clave se
surte por transferencia de otra unidad.

- En la unidad: aviso emergente, chip de alertas abiertas, pestaña **Alertas al CEDIS** con su estado
  (enviada → en preparación → en camino → recibida) y la camioneta urgente llega en el 3D.
- En el CEDIS: la misma solicitud aparece en **Urgencias** (etiqueta "Clave agotada en la unidad") y la
  unidad se marca en la lista de **Unidades**.
- Ambas páginas calculan lo mismo con `js/supply.js`; `js/cedis-link.js` es el punto donde se conectaría
  el sistema real de farmacia (>>> API).

### Red estatal (`mapa.html`)

Mapa de Hidalgo con las 60 unidades en semáforo (verde, amarillo, rojo), las camionetas del CEDIS en ruta
y los reabastos urgentes. Pestañas:

- **Unidades / Camionetas / Alertas**: estado en tiempo real; toca una unidad o camioneta para ver su ficha.
- **Redistribución**: transferencias sugeridas entre unidades (cubrir faltantes y evitar caducidades),
  con flechas en el mapa y botón de aprobación (simulado).
- **Trazabilidad**: busca un lote (`LT5165-2000`), una receta o vale de hoy (`RX-…`, `QX-…`, `UR-…`) o un
  medicamento y ve el recorrido proveedor → CEDIS → unidades → pacientes y la existencia actual.
- **Pronóstico**: demanda estatal de las próximas 2 semanas por clave, precisión del modelo y unidades en riesgo.

### Lotes y caducidades

Cada envío del CEDIS lleva lote y caducidad; las unidades surten primero lo que caduca antes (PEPS) y retiran
lo caducado como merma. La ficha de cada medicamento muestra sus lotes y el kárdex indica el lote de cada
movimiento. `js/supply.js` → `lotFor()`.

### Pronóstico de demanda

`js/forecast.js`: Holt-Winters con estacionalidad semanal y tendencia amortiguada, elegido por validación
(entrena 23 días, prueba 7). La simulación incluye temporada de enfermedades respiratorias (ambroxol,
salbutamol, amoxicilina, etc.). En la ficha del medicamento: pronóstico a 4 semanas con rango probable,
precisión, fecha en que se agotaría y pedido sugerido contra el de mínimos y máximos. Es el punto donde
se conectaría un modelo de IA entrenado con datos reales.

### Desabasto de varias claves a la vez

- **Diagnóstico** (pestaña Desabasto del mapa): matriz clave × unidad y clasificación de cada clave en
  *local* (pocas unidades, el CEDIS sí tiene → transferir o urgente), *de red* (el CEDIS no tiene o muchas
  unidades en cero → escalar a compras y repartir con prioridad) o *riesgo*. Estado general de la red:
  normal, local, de red o contingencia. Toca una clave para colorear el mapa por esa clave.
- **Prioridad clínica**: cada clave tiene clasificación VEN (Vital, Esencial, No esencial) en
  `assets/medicamentos.json`. Las solicitudes se ordenan por puntuación: criticidad + pacientes afectados +
  hospital + días abierta − alternativa disponible (`reqScore` en `js/supply.js`), en la unidad, el mapa y el
  panel de Urgencias del CEDIS.
- **Modo contingencia** (botón en la pestaña Desabasto): el CEDIS se queda sin 6 claves y con existencia
  parcial de 4, y hay brote respiratorio. Se guarda en el navegador y aplica a las tres vistas; un aviso
  permite volver a operación normal.
- **Solicitud consolidada**: si una unidad ya tiene una solicitud del día que no ha salido del CEDIS, las
  nuevas claves agotadas se agregan a ella (un solo envío). Si el CEDIS no tiene la clave, la solicitud queda
  *pendiente en CEDIS* hasta que se reabastece.
- **Reparto proporcional**: cuando el CEDIS tiene existencia parcial, los hospitales y las claves vitales
  reciben mayor proporción. En contingencia, las recetas de claves en desabasto se surten para 7 días.
- **Recetas pendientes**: lo que no se pudo surtir queda registrado; al llegar el medicamento se surte en
  orden de antigüedad y se avisa al paciente (pestaña Recetas pendientes). Se cancelan a los 10 días.
  Se muestran las **alternativas del catálogo** con existencia; la decisión de sustituir es del médico.

### Rutas y costos (mapa → pestaña "Rutas y costos")

`js/routing.js`. Modelo de costos con parámetros editables ($/km, $/hora de chofer, costo fijo por salida,
velocidad, descarga por parada, jornada máxima y capacidad en litros; volumen por pieza con embalaje).
Compara las rutas actuales (repartidas en las camionetas necesarias) contra rutas optimizadas con los
mismos días de visita: ahorros de Clarke-Wright + 2-opt con capacidad y jornada. Muestra hoy y la semana,
dibuja las rutas optimizadas en el mapa y recomienda insertar urgentes en una ruta o enviar viaje dedicado.
Distancias en línea recta × 1.35 (sustituir por matriz de carretera con datos reales).

Vehículos en Blender: `bodega/vehiculos/vehiculos_builder.py` → `assets/vehiculos.glb` (camioneta seca,
refrigerada y moto de reparto). En el 3D de la unidad llega la camioneta refrigerada cuando la entrega trae
claves de red fría.

### Inventario del CEDIS y asignación (fase 2)

`js/network-sim.js` simula el almacén central día por día, acoplado a las 60 unidades:
- **Existencias:** por clave y lote, con arribos del proveedor (de 10 a 21 días, con retrasos y entregas
  parciales), merma por caducidad y salida PEPS.
- **Faltantes:** ya no son una lista fija. Cuando la existencia no alcanza hasta el próximo arribo, el CEDIS
  reparte, y eso es lo que ven las unidades (`setCedisModel` en `supply.js`). La contingencia sigue siendo
  un guion de falla de proveedor.
- **Método de pedido** (en el mapa, pestaña **Inventario y asignación**; se guarda en el navegador y viaja
  en la URL con `?pol=`):
  - *mínimos y máximos* con la demanda planeada;
  - *pronóstico*: Holt-Winters con la demanda observada más un colchón por retrasos.
  - En 90 días, el pronóstico sube el nivel de servicio de 97.5 % a 99.6 %, con 26 % menos inventario.
- **Asignación cuando no alcanza:** iguala los días de cobertura ponderados por tipo de unidad y VEN, en
  lugar de repartir en proporción a lo pedido. Muestra la cobertura mínima y las unidades con menos de
  3 y 7 días.
- **CEDIS 3D:**
  - pestaña **Inventario** con existencias, cobertura, tránsito, próximo arribo y lotes con su ubicación;
  - capa **Cobertura por clave**, que colorea cada ubicación según la clave guardada;
  - al tocar un rack se ven sus claves.

Blender:
- `bodega/cedis_claves.py` asigna una clave a cada una de las 1,506 ubicaciones (propiedades `wh_clave`,
  `wh_ven`, `wh_grupo`), pone un letrero por grupo terapéutico en los racks y genera
  `assets/slot_claves.json`.
- `bodega/regional/almacen_regional_builder.py` construye un almacén regional tipo de 36 × 22 m, con
  144 posiciones de tarima, picking, cuarto frío, controlados y 3 andenes. Genera
  `assets/almacen_regional.glb` para el nivel regional opcional.

### Pedido automático antes del desabasto (fase 3)

Cada mañana, cada unidad proyecta la existencia de cada clave hasta su próxima entrega ordinaria, con el
consumo observado (promedio móvil). Si queda por debajo de la existencia de seguridad, el sistema propone un
**pedido extraordinario** (`PEX-…`) antes de llegar a cero (`proposeOrder` en `js/supply.js`).

Flujo con tiempos medidos:
1. **propuesto:** el sistema lo genera hacia las 07:00;
2. **validado:** la jefatura de farmacia, con plazo de 2 h;
3. **autorizado:** la mesa de control del CEDIS, con plazo de 4 h;
4. **programado en ruta:** sale en la ruta siguiente, o en viaje propio si la clave se agota en menos de
   1.5 días;
5. **entregado.**

Dónde se ve:
- **Unidad**, pestaña **Pedidos**: cada pedido con su línea de tiempo, los pasos fuera de plazo y sus claves,
  y estos indicadores:
  - tiempo de ciclo;
  - porcentaje validado y autorizado en plazo;
  - porcentaje entregado antes de agotarse;
  - alertas y piezas negadas, comparadas con la misma unidad sin pedido automático.
- **Unidad**, botón para descargar los pedidos en JSON.
- **Unidad 3D:** la jefatura de farmacia con su terminal. Un marcador sobre el escritorio indica si hay un
  pedido por validar (rojo) o por autorizar (ámbar).
- **CEDIS 3D**, pestaña **Autorización**: bandeja de las 60 unidades, ordenada por lo que se agota primero.

Resultado en 30 días para la red:
- las alertas por clave agotada bajan de 334 a 38;
- las recetas completas suben de 99.1 % a 99.9 %;
- en contingencia, las recetas completas suben de 96.4 % a 97.9 %.

Para comparar sin pedido automático se usa `?ped=0`.

Contrato de datos: `docs/pedido-extraordinario.schema.json` (JSON Schema con la estructura de FHIR
SupplyRequest, más CLUES, clave CNIS y VEN, y la bitácora del flujo) para conectarse con sistemas reales.

Blender: `bodega/unidad/unidad_builder.py` → `build_jefatura()` agrega el escritorio de la jefatura, la
terminal, la tableta en atril y el tablero de pedidos en el muro. `unidad_layout.json` incluye la clave
`jefatura`.

### Última milla al paciente (fase 4)

`js/lastmile.js`. La sección **Entregas a pacientes** de la unidad atiende dos tipos de receta:
- **Pendientes surtidas:** el medicamento llegó después de la consulta.
- **Resurtibles de crónicos inscritos:** cerca del 22 % de las recetas que solo traen claves crónicas. Estos
  pacientes no hacen fila.

Vías de entrega:
- ventanilla;
- **casillero 24 h** en la plaza de acceso;
- **punto aliado** (farmacia o módulo comunitario);
- **domicilio en moto**, con 2 salidas al día (10:00 y 15:30) y rutas optimizadas con ahorros de
  Clarke-Wright más 2-opt. Las condiciones son capacidad de 18 paradas, jornada de 4 h, $3.2 por km,
  $95 por hora de repartidor y $60 por salida.

Reglas: los controlados solo se entregan en ventanilla y la red fría no va a casillero.

Comprobante: código QR con folio, CLUES, paciente y claves (`vendor/qrcode.esm.js`, qrcode-generator, MIT).
Para domicilio se agrega la firma del paciente.

Indicadores, en vista Hoy o 30 días:
- entregas por vía;
- porcentaje entregado en 24 h o menos;
- costo por entrega a domicilio;
- visitas a farmacia evitadas;
- km y horas de pacientes ahorrados;
- días de espera evitados en recetas pendientes.

La sección también tiene un mapa local con las rutas y la moto en movimiento.

En el 3D de la unidad, las resurtibles inscritas ya no hacen fila. La moto sale del andén en cada salida y
regresa, y al tocarla se ven sus entregas. El casillero de la plaza muestra sus compartimentos ocupados.

En HGZMF 1, en 30 días: 501 entregas (324 a domicilio), 364 visitas evitadas, unas 529 horas de pacientes
ahorradas y un costo de unos $47 por entrega a domicilio.

Blender: `bodega/recoleccion/punto_recoleccion_builder.py` genera un casillero de 24 compartimentos con
pantalla, lector QR y letrero (`assets/punto_recoleccion.glb`). La moto es `Moto_Reparto` de
`vehiculos.glb`. `unidad_layout.json` incluye `locker`.

## Estructura

```
web/
  index.html          interfaz
  css/styles.css      estilos
  js/main.js          escena 3D, cámaras, capas, selección
  js/sim.js           simulación y KPIs  (SIM_CONFIG: rutas, velocidades, tareas)
  js/ui.js            panel de indicadores, inspector, traducciones
  assets/             almacen_medicamentos.glb + warehouse_layout.json
  vendor/             three.js r169 (local, no requiere internet)
  serve.py / serve.bat  servidor local
```

## Actualizar el modelo

Después de cambiar algo en Blender, vuelve a correr `warehouse_builder.py` y copia
`almacen_medicamentos.glb` y `warehouse_layout.json` a `web/assets/`.

## Conectar datos reales

Los datos son simulados. En `js/sim.js` los puntos marcados con `>>> API` son donde se
sustituyen por tu backend (REST o WebSocket): estado del turno, ocupación de ubicaciones
(eventos del WMS) y temperatura del cuarto frío.

## Rendimiento

El visor agrupa la geometría estática en `InstancedMesh` (de ~6,600 primitivas a unos
cientos de llamadas de dibujo), limita la resolución en pantallas táctiles y solo
redibuja cuando hay cambios si la simulación está en pausa. Las sombras vienen apagadas;
actívalas en Capas si el equipo lo permite.

---
© 2026 Gersain Barron · Licencia MIT
