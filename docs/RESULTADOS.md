# Resultados por fase

Todos los números salen de la simulación: los datos son simulados, pero el método es reproducible. Se calcularon
el lunes 26 de octubre de 2026 (día 0) en escenario normal, salvo que se indique otra cosa.

## Fase 1 · Optimizador de rutas con costos (Meta 1)

Se usan los mismos días de visita y las mismas cargas. Las rutas actuales se reparten en las camionetas necesarias
y luego se reagrupan con ahorros de Clarke-Wright más 2-opt.

| Semana | Actual | Optimizada | Cambio |
|---|---|---|---|
| Viajes | 15 | 10 | −5 |
| Costo | $50,103 | $39,939 | −20 % |
| Kilómetros | — | — | −709 km |

Además, cada urgente se compara entre insertarlo en una ruta del día y mandarlo en viaje dedicado.

**Dónde verlo:** mapa → *Rutas y costos*.

## Fase 2 · Inventario del CEDIS y asignación (Meta 2, Proyecto 2)

Comparación de 90 días entre los dos métodos de pedido del CEDIS:

| | Mínimos y máximos | Pronóstico |
|---|---|---|
| Nivel de servicio del CEDIS | 97.5 % | 99.6 % |
| Días-clave sin existencia | 16 | 1 |
| Días-clave en reparto | 185 | 60 |
| Claves con algún faltante | 17 | 11 |
| Inventario promedio | 27.6 días | 20.4 días (−26 %) |
| Pedidos al proveedor | 150 | 567 (más frecuentes y más chicos) |

En las unidades, las claves en cero bajan de 24 a 11 con pedido por pronóstico.

Para la asignación cuando no alcanza, se toma como ejemplo amoxicilina en suspensión con el 50 % de lo pedido.
El reparto proporcional deja 6 unidades con menos de 7 días de cobertura; igualando la cobertura quedan 0.

**Dónde verlo:** mapa → *Inventario y asignación*, y CEDIS 3D → *Inventario*.

## Fase 3 · Pedido automático antes del desabasto (Proyecto 1)

Resultados de 30 días para las 60 unidades, contra la misma red sin pedido automático (`?ped=0`):

| | Sin | Con |
|---|---|---|
| Alertas por clave agotada | 334 | 38 (−89 %) |
| Recetas surtidas completas | 99.09 % | 99.86 % |
| Recetas completas en contingencia | 96.44 % | 97.88 % |

En 30 días hubo 986 pedidos extraordinarios. El 85 % se validó en 2 h o menos y el 82 % se autorizó en 4 h o
menos.

**Dónde verlo:** unidad → *Pedidos*, y CEDIS 3D → *Autorización*.

## Fase 4 · Última milla al paciente (Proyecto 3)

Resultados de 30 días en HGZMF 1 Pachuca:

| | Valor |
|---|---|
| Entregas | 501 (324 a domicilio, 136 en casillero, 40 en punto aliado y 1 en ventanilla) |
| Entregadas en 24 h o menos desde el aviso | 79 % |
| Costo por entrega a domicilio | ~$47 (50 salidas de moto, 1,631 km) |
| Visitas a farmacia evitadas | 364 |
| Km de traslado de pacientes evitados | 3,643 |
| Horas de pacientes ahorradas | ~529 |

**Dónde verlo:** unidad → *Entregas a pacientes*.

## Cómo reproducir

Abre las vistas con los parámetros de la URL (`esc`, `pol`, `ped`, `u`, `t`) descritos en el
[README](../README.md). Los indicadores se recalculan en el navegador. Como la simulación es determinista, los
números se repiten mientras no cambie el código ni los datos.

---
© 2026 Gersain Barron · Licencia MIT
