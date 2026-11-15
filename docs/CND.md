# CND: patio, andenes y flujo interno

> El gemelo usa una institución genérica: **Servicio Nacional de Salud (SNS)**, con su **Centro Nacional de Distribución (CND)**. Las fuentes institucionales reales se conservan en `investigacion/fuentes_institucionales.md`.

## Qué hay
- **Ventana `web/cnd.html`** (Fase 5 en `PLAN_HOJA_DE_RUTA.md`): simulación del patio, los andenes y el flujo interno del CND, el Centro Nacional de Distribución del SNS, operado por un tercero logístico.
  - **Código:** `js/yard-sim.js` (motor), `js/cnd3d.js` (escena) y `js/cnd.js` (página).
  - **Flujo:** carretera → caseta → patio → andén → carrito de descarga → cuarentena → montacargas al rack. Embarque: surtido → carril de la ruta → carga.
  - **Panel "Dónde se atrasa":** 11 etapas con semáforo y lista de atrasos ligada a la cámara 3D.
  - **Escenarios:** A (actual tipo), B (citas) y C (citas y horario ampliado), cada uno en día normal, pico ×2.5 o contingencia.
- **Resultados en día pico:** A da 2 h 59 de estancia, 22 vehículos en cola y 73 % de salidas a tiempo. C da 1 h 01, 3 vehículos y 100 %. B quita la cola pero deja a 9 de 55 proveedores sin cupo.
- **Modelos de Blender:**
  - `nacional/cnd_builder.py` (CND, 200 × 130 m, 38 andenes, 33,732 posiciones).
  - `oficinas_centrales/` (oficinas centrales del SNS, torre de 17 niveles en "Y").
  - `unidades_tipo/unidades_medicas.py` (CAF, UMF y hospital; sin integrar).
- **Documentación técnica:** `docs/MODELOS_BLENDER.md`, `README.md` y `web/README.md`.

## Datos de referencia del CND
35,000 posiciones, 38 andenes y 6 antecámaras de red fría. Recibe unos 22 millones de piezas al mes y envía unos 20 millones a unas 786 unidades. Se tomaron de un centro nacional de distribución real (fuentes en `investigacion/fuentes_institucionales.md`). Los tiempos de proceso, el horario de recepción y la mezcla de vehículos son supuestos.

## Pendiente
- Conectar las llegadas de proveedor con los arribos de `network-sim.js`.
- Medir una semana real de descarga, validación y surtido.
- Integrar los tipos de unidad al mapa de red.
- Revisar la fluidez del 3D en el iPad (el modelo pesa 5.5 MB).

## Notas técnicas
- Blender 5.2 en español: buscar nodos por `bl_idname`. Se puede correr sin interfaz con `blender.exe -b --factory-startup --python <script>`.
- El servidor local es `web/serve.py`, en el puerto 8080.
- GitHub Pages publica `web/` en cada push a `main` (https://gersainbarron.github.io/gemelo-digital-medicamentos/).
