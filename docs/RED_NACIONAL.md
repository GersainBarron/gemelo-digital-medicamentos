# Red nacional · CND a los 32 estados

Ventana `web/nacional.html` del gemelo digital. Simula 30 días, en pasos de 1 hora, de embarques del CND (Centro Nacional de Distribución del Servicio Nacional de Salud, en el Valle de México) a los almacenes de los 32 estados.

## Archivos
- **Blender:**
  - `nacional/mapa_mexico_builder.py` lee `nacional/estados_mx.json` y genera `mapa_mexico.blend` y `mapa_mexico.glb` (copia en `web/assets`).
  - Vista previa en `renders/preview_mapa_mexico.png`.
  - Cada estado es una losa (`wh_type=state`, con `wh_cve`, `wh_region`…), en km y en EPSG:6372, con el CND en el origen.
  - `estados_mx.json` guarda cada polígono como `{ext, holes?, tri}`, con la triangulación precalculada. Baja California se corrigió el 14 nov 2026 (le faltaba `tri` y el 3D no la pintaba).
- **Datos:**
  - `investigacion/unidades_nacional.csv` y `investigacion/estados_cnd.csv`: 1,033 unidades del SNS (902 de 1er nivel, 113 de 2º, 18 de 3º), con nombre genérico por tipo y ciudad.
  - `web/assets/unidades_nacional.json` y `web/assets/estados_mx.json`.
  - Geometría: división estatal 2023 de la CONABIO, que es el Marco Geoestadístico del INEGI.
- **Web:** `js/nacional-sim.js` (simulación), `js/nacional3d.js` (mapa 3D) y `js/nacional.js` (página).
- **Publicada:** https://gersainbarron.github.io/gemelo-digital-medicamentos/nacional.html

## Modelo
- **Demanda:** 20 M de piezas al mes, repartidas según el peso de cada tipo de unidad (CAF 1, UMF 3, CMF/CE 6, CH 12, HG 25, HR 50), en tarimas de 3,000 piezas.
- **Frecuencia de embarque:** según las horas de tránsito.

  | Tránsito | Embarques |
  |---|---|
  | Hasta 3 h | Diario |
  | Hasta 12 h | 3 por semana |
  | Hasta 24 h | 2 por semana |
  | Más de 24 h | 1 por semana |

  Los días de salida se reparten para emparejar la carga.
- **Pedido:** se pide hasta cubrir (días entre embarques + tránsito + 5 días de seguridad) × el consumo de los últimos 7 días.
- **Capacidad del CND:** 360 tarimas por día, en tráileres de 24 tarimas.
- **Reparto cuando no alcanza:** proporcional, o por cobertura (iguala los días de cobertura que tendrá cada estado al llegar su siguiente embarque).

## Resultados (30 días)

| Escenario | Proporcional | Por cobertura |
|---|---|---|
| Normal | 100 % de abasto, ningún estado sin abasto | Igual |
| Falla de proveedor | 4 estados sin abasto, 91 horas-estado | 0 |
| Pico respiratorio | 7 estados sin abasto, 245 horas-estado | 0 |
| Huracán en la península | Quintana Roo y Tabasco, 54 horas-estado | Igual |
| Cierre carretero | Sólo entregas tarde | Igual |

## Pendiente
- Usar una matriz de carretera real.
- Usar consumos reales por estado.
- Llevar inventario por clave.
- Ligar la ventana con las olas de embarque de `cnd.html`.
