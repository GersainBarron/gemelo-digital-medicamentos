# Plan: gemelo digital vs. hoja de ruta del Consejo Asesor (abasto de medicamentos)

Proyecto de Gersain Barron · carpeta del proyecto `bodega` (en Windows: `~\OneDrive\Escritorio\bodega`)
Creado: 25 oct 2026. Este archivo es la guía para continuar el trabajo aunque se pierda el contexto.

## Hoja de ruta oficial (resumen)
- **Metas:** 1) minimizar costos de distribución (rutas óptimas), 2) asignación eficiente según demanda real
  e inventario, 3) predicción de demanda por unidad.
- **Proyectos:** 1) solicitud de necesidades en tiempo real, 2) gestión de almacén e inventarios (central,
  regional, hospitalario), 3) logística de última milla (farmacias y pacientes).

## Estado actual (ya construido)
- **CEDIS 3D:** `web/index.html` con `js/main.js`, `sim.js`, `ops.js`, `ops-ui.js` y `cedis-link.js`.
  Modelo en Blender: `warehouse_builder.py` → `almacen_medicamentos.glb`.
- **Red estatal:** `web/mapa.html` con `js/mapa.js` y `network.js`. Pestañas: Unidades, Desabasto,
  Camionetas, Alertas, Redistribución, Trazabilidad y Pronóstico.
- **Unidad médica:** `web/unidad.html` con `js/unidad.js`, `unit3d.js` y `supply.js`. Modelo en Blender:
  `unidad/unidad_builder.py` → `unidad_medica.glb` y `unidad_layout.json`.
- **Datos:** `assets/unidades_hidalgo.json` (60 unidades CLUES y 9 rutas) y `assets/medicamentos.json`
  (60 claves CNIS con clasificación VEN y alternativas).
- **Funciones ya hechas:**
  - alertas de la unidad al CEDIS, solicitudes consolidadas, prioridad VEN y modo contingencia;
  - lotes, caducidades y trazabilidad;
  - pronóstico Holt-Winters (`js/forecast.js`) y redistribución entre unidades;
  - recetas completas, parciales y negadas (tabla y CSV) y recetas pendientes con alternativas.
- **Documentos:** documento de investigación (artefacto Docs) y `investigacion/desabasto_contingencia.xlsx`.

## Fase 1 · Optimizador de rutas con costos (Meta 1 + Proyecto 3) — HECHO (25 oct, 22:05)
Resultado: semana −20 % de costo (15 → 10 viajes, 709 km menos). Pendiente menor: poner la flota de Blender en los andenes del CEDIS 3D.
**Código:** `web/js/routing.js` (nuevo) y una pestaña "Rutas y costos" en `mapa.html`/`mapa.js`.
- **Modelo de costos con parámetros editables:**
  - $/km (combustible y mantenimiento) 9.5, $/hora de chofer 130, costo fijo por salida 350;
  - velocidad 55 km/h, descarga de 20 min por parada, jornada máxima de 10 h;
  - capacidad de la camioneta: 8,000 L útiles.
- **Volumen por pieza (L):** caja 1.0, frasco 0.6, inhalador 0.3, ampolleta 0.03, bolsa 0.6, jeringa 0.05.
  La carga de cada parada es la suma de q × volumen (envío real de hoy, o demanda × ciclo en otros días).
- **Distancias:** haversine × 1.35. Limitación documentada: con datos reales se cambia por una matriz de
  carretera (OSRM).
- **Línea base:** las 9 rutas actuales de cada día (`cal.dayPlan(idx).trips`), evaluadas con el mismo modelo.
- **Optimización:**
  - mismos días de visita, pero reagrupando las camionetas con ahorros de Clarke-Wright más 2-opt;
  - restricciones de capacidad y de jornada;
  - salida: rutas, km, horas, viajes, costo, costo por entrega y por pieza, y % de carga.
- **Comparación:** hoy y semana completa (lun a dom), actual contra optimizada, con ahorro en $ y en %.
- **Urgentes:** inserción más barata de cada solicitud urgente en una ruta en curso contra un viaje
  dedicado, respetando el límite de entrega. Muestra la recomendación y el ahorro.
- **Pantalla:**
  - interruptor "Actual / Optimizada" que dibuja las rutas en el mapa;
  - tabla de rutas y tarjetas de indicadores;
  - parámetros editables.
- **Blender:** `vehiculos/vehiculos_builder.py` con camioneta seca, camioneta refrigerada (red fría) y
  moto repartidora (para la fase 4). Se exportan a `assets/vehiculos.glb`. Se usan en el CEDIS 3D (andenes)
  y en el 3D de la unidad, sustituyendo la camioneta actual.

## Fase 2 · Inventario del CEDIS por clave y lote, con asignación óptima conectada al pronóstico (Meta 2 + Proyecto 2) — HECHO (26 oct, 07:45)
Resultado (90 días):
- Con pedido por pronóstico, el nivel de servicio del CEDIS sube de 97.5 % a 99.6 %, los días-clave sin
  existencia bajan de 16 a 1 y el inventario baja de 27.6 a 20.4 días.
- En las unidades, las claves en cero bajan de 24 a 11.

Hecho en Blender: `cedis_claves.py` (claves por ubicación y letreros) y `regional/almacen_regional_builder.py`.

Pendiente opcional: el inventario propio de los almacenes regionales en la simulación (el modelo 3D ya existe).
- **Código:** `web/js/network-sim.js`, que simula la red completa día por día (CEDIS + 60 unidades
  acopladas). El CEDIS tiene existencia por clave y lote, arribos de proveedor y salidas a las unidades.
  Los faltantes salen del inventario (las fallas de proveedor quedan como escenario).
- **Método de pedido seleccionable:** mínimos y máximos o pronóstico (`suggestedOrder` de `forecast.js`).
- **Asignación cuando no alcanza:** reparto que iguala días de cobertura ponderados por VEN y tipo de
  unidad (prioridad a hospitales y claves vitales). Muestra el surtido por unidad y la cobertura resultante.
- **Pantalla:**
  - en el CEDIS 3D, panel "Inventario CEDIS": existencias por clave, días de cobertura de la red, lotes y
    próximos arribos;
  - en el mapa, pestaña "Asignación".
- **Almacenes regionales (opcional):** un nivel entre el CEDIS y las unidades (por ejemplo Tula, Tulancingo
  y Huejutla) con su propio inventario.
- **Blender:**
  - **CEDIS:** racks con ocupación por clave (color según días de cobertura) en el modelo
    existente, con propiedades `wh_*` por ubicación para ligarlas al inventario.
  - **Almacén regional:** `almacen_regional_builder.py`, una versión pequeña del CEDIS para los
    almacenes regionales.

## Fase 3 · Pedido automático antes del desabasto, con flujo de aprobación (Proyecto 1) — HECHO (26 oct, 08:30)
Resultado (30 días, red):
- las alertas por clave agotada bajan de 334 a 38;
- las recetas completas suben de 99.1 % a 99.9 %;
- en contingencia, las recetas completas suben de 96.4 % a 97.9 %.

En Blender se hizo `build_jefatura()`; el marcador 3D va en `unit3d.js`. El esquema está en
`web/docs/pedido-extraordinario.schema.json`.
- **Punto de reorden dinámico:** si la existencia proyectada (existencia − pronóstico hasta la próxima
  entrega) queda por debajo de la de seguridad, se genera un "pedido extraordinario" antes de llegar a cero.
- **Flujo con tiempos medidos y bitácora:**
  1. propuesto (unidad);
  2. validado por el jefe de farmacia (plazo de 2 h);
  3. autorizado por el CEDIS (4 h);
  4. programado en ruta;
  5. entregado.
- **Roles simulados:** farmacia de la unidad, jefe de farmacia y CEDIS.
- **Pantalla:** en la unidad, pestaña "Pedidos"; en el CEDIS, "Bandeja de autorización". Indicadores:
  tiempo de ciclo, pedidos a tiempo y desabastos evitados.
- **Contrato de datos:** esquema JSON documentado (tipo FHIR SupplyRequest) para conectarse con sistemas reales.
- **Blender:** módulo de farmacia con terminal o tableta del jefe de farmacia en `unidad_builder.py`, más un
  indicador visual en el 3D cuando hay un pedido por aprobar.

## Fase 4 · Última milla al paciente (Proyecto 3) — HECHO (26 oct, 09:10)
Resultado (HGZMF 1, 30 días):
- 501 entregas, de las que 324 fueron a domicilio;
- 364 visitas a farmacia evitadas;
- unas 529 horas de pacientes ahorradas;
- unos $47 por entrega a domicilio.

Se agregaron las recetas resurtibles de crónicos, porque con el pedido automático casi no quedan pendientes.
En Blender se hizo `recoleccion/punto_recoleccion_builder.py`; la moto se anima en `unit3d.js`.
- **Opciones de entrega para recetas pendientes:** recoger en la unidad, punto de recolección (farmacia o
  módulo cercano) o entrega a domicilio.
- **Rutas de reparto desde la unidad:** moto o camioneta, con el optimizador de la fase 1. Aviso al paciente
  y comprobante de entrega (QR o firma).
- **Pantalla:** en la unidad, pestaña "Entregas a pacientes" con mapa local e indicadores: entregadas a
  tiempo, costo por entrega y días de espera evitados.
- **Blender:** punto de recolección o módulo `punto_recoleccion_builder.py`; la moto repartidora de la
  fase 1 se anima en el 3D de la unidad, saliendo del andén.

## Cierre de cada fase
- Probar en el navegador (PC 1366 px e iPad 820/1180 px) y revisar errores de consola.
- Actualizar `web/README.md`, el documento de investigación y, si aplica, el Excel.
- Copiar los cambios a la carpeta del proyecto y subirlos al repositorio.

## Notas técnicas para continuar
- **Copias del código:** el repositorio es la fuente; la carpeta `bodega` del equipo de trabajo es la copia
  que se sirve con `web/serve.py`.
- **Servidor local:** `web/serve.py` en el puerto 8080, que se arranca desde Blender si está caído. En el
  iPad: `http://192.168.x.x:8080`.
- **Escenario:** `?esc=normal|contingencia`, que también se guarda en localStorage (`js/scenario-ui.js`).
- **Simulación determinista:** `js/supply.js` (`UnitSupply`), donde el día 0 es el lunes 26 oct 2026.
  `makeCalendar` reutiliza `Ops.buildDay`.
- **Blender:** 5.2 en español. Buscar los nodos por `bl_idname`. Exportar glTF en una llamada aparte
  después de `read_homefile` (si no, falla el contexto).
- **Navegador de prueba:** si el panel está oculto, `requestAnimationFrame` no corre. Para probar, usar
  `window.__unidad.refresh(true)` y `window.__mapa.renderAll(true)`.

---
© 2026 Gersain Barron · Licencia MIT
