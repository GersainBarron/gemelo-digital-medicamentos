# Red fría · del CND a la unidad

Ventana `web/redfria.html` del gemelo digital, fase 7. Simula la temperatura cada 5 minutos durante 30 días: 1,066 equipos (la cámara del CND, la de los 32 almacenes estatales y el refrigerador de cada una de las 1,033 unidades del Servicio Nacional de Salud) y unos 4,700 viajes en tráiler refrigerado y en caja térmica.

## Archivos
- **Blender:** `nacional/redfria_builder.py` genera `redfria.blend` y `redfria.glb`. Son 5 eslabones: CND, tráiler refrigerado, almacén estatal, camioneta con cajas térmicas y farmacia de la unidad.
- **Web:**
  - `js/redfria-sim.js`: modelo térmico, monitoreo y daño.
  - `js/redfria3d.js`: escena 3D.
  - `js/redfria.js`: la página.
  - `js/redfria-worker.js`: calcula en segundo plano los escenarios de la comparación.
- **Publicada:** https://gersainbarron.github.io/gemelo-digital-medicamentos/redfria.html

## Modelo
- **Rango:** de 2 a 8 °C. Los niveles de almacenamiento siguen la NOM-036 y el Manual de Vacunación.
- **Equipos:** constante de tiempo (τ) de 30 h en cámara, 6 h en refrigerador grado médico, 3 h en doméstico y 22 h en refrigerador con forro de hielo.
- **Refrigeradores domésticos:** son el 70 % del 1er nivel en "como está". Tienen zonas frías, y 1 de cada 7 tiene el termostato desviado.
- **Clima y energía:** clima aproximado por estado, apagones y planta de emergencia, que falla 1 de cada 10 veces.
- **Viajes:**
  - Tráiler: 4 % de fallas de la unidad de frío.
  - Caja térmica: 48 h de vida fría. Con refrigerantes directo del congelador, 45 % de las cajas congela el producto.
- **Monitoreo:**
  - Manual: lecturas a las 8:00 y 16:00.
  - Registrador de 30 días: alarma a +8 °C por 10 h o a −0.5 °C por 60 min.
  - Telemetría: aviso a los 30 min arriba de 8 °C o a los 15 min bajo 0 °C.
- **Daño:**
  - Congelar 60 minutos destruye vacunas con adyuvante, insulinas y biológicos.
  - El calor se acumula en horas equivalentes a 25 °C (Q10 = 2) contra el presupuesto de cada producto.
  - Si se detecta, se da de baja; si no, el producto se aplica sin saberlo.

## Resultados (30 días en otoño)

| Plan | Pérdida al mes | Dañado sin detectar | Inversión |
|---|---|---|---|
| Como está | $22.7 M | $6.6 M | — |
| Refrigerantes acondicionados | $9.1 M | $0 | $0.3 M |
| Registrador | $22.8 M | $0 | $7.3 M |
| Refrigerador grado médico | $13.6 M | $6.6 M | $33.8 M |
| Acondicionados + registrador + grado médico | $0 | $0 | $41.4 M |

## Pendiente
- Censo real de equipos de red fría.
- Datos de estabilidad de cada registro sanitario.
- Normales climatológicas del SMN.
- Conectar descargas reales de los registradores.
