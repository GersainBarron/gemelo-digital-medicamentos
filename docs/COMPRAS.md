# Compra consolidada: del plan al contrato

Ventana `web/compras.html` del gemelo digital (archivos `web/js/compra-sim.js` y `web/js/compras.js`). Es el eslabón entre Planeación y la entrega del proveedor.

Toma la demanda 2027 por clave del plan anual de Planeación y simula la licitación hasta la firma de contratos y el primer año de entregas. Responde tres preguntas:
- cuánto del plan aprobado termina sin contrato;
- en qué claves habrá desabasto al arrancar el año;
- qué estrategia de compra lo reduce.

## Cómo funciona

- **Demanda:** viene del plan de Planeación guardado en el navegador o, si no hay, del plan de ejemplo. Son las piezas asignadas a cada unidad, con lo negociado si se avanzó la aprobación. Solo se simulan el ISSSTE y las 60 claves del gemelo.
- **Procedimiento:** como la licitación LA-12-NEF-012NEF001-T-218-2026 de Birmex.
    - Convocatoria el 16 de julio, junta de aclaraciones a los 7 días y apertura a los 20.
    - Evaluación binaria: cumple o no cumple.
    - Ofertas subsecuentes de descuento, fallo y firma en 20 días hábiles.
    - Las claves de patente y fuente única se adjudican directo y cierran a principios de agosto.
- **Precio (Ley de Adquisiciones, DOF 16 abr 2025):** no aceptable si pasa 10 % la media de la investigación de mercado o el presupuesto; no conveniente si queda 40 % abajo.
- **Abastecimiento simultáneo:** hasta 4 fuentes por clave si su precio no pasa 10 % el del primero, con reparto 40/25/20/15, 50/30/20 o 60/40.
- **Mercado (supuesto):**
    - De 0 a 9 laboratorios por clave, según qué tan común es.
    - Biológicos, red fría y las claves hospitalarias de hematología y neumología tienen más probabilidad de ser patente.
    - Cada laboratorio tiene costo, margen, capacidad y probabilidad de error documental.
    - Fabricar y entregar toma de 4 a 12 semanas tras la firma.
- **Desiertas:**
    - Segunda licitación, con fallo 75 días después.
    - O invitación a tres, en 35 días y más cara.
    - Lo que siga sin contrato lo compra la unidad de emergencia: la mitad de lo faltante, 40 % más caro.
- **Ejecución 2027:**
    - Cada ganador puede incumplir y rescindirse (6 %, el doble si ofertó 25 % abajo de la referencia).
    - Con varias fuentes, las demás cubren.
    - Con una sola, se esperan 45 días al segundo lugar o 90 a un procedimiento nuevo.
    - Las unidades arrancan con un inventario puente de 1 a 3 meses.

## Vista 3D

El diorama `assets/compra.glb` sale de Blender (`nacional/compra_builder.py`). Lo anima `web/js/compra3d.js`.
- **Recorrido:** cada clave del plan es una tarima, más alta mientras más piezas tiene. Avanza con el calendario de la simulación por cinco arcos: convocatoria y apertura, evaluación técnica, precio aceptable, fallo y firma de contratos. Al final se entrega en el CENADI.
- **Patente y fuente única:** van por su propio carril hasta la firma.
- **Las que no pasan un arco** caen a la fosa de desiertas. En la segunda vuelta salen hacia el contrato o caen a "sin contrato".
- **Color:** gris en proceso, verde agua adjudicada, azul patente, ámbar parcial o segunda vuelta, rojo desierta y rojo oscuro sin contrato. En el CENADI, verde agua si llegó a tiempo, y ámbar o rojo según los días sin medicamento.
- **Lámparas de los arcos:** se encienden al terminar su etapa. Verde agua si ninguna clave se quedó ahí, ámbar si una o dos, rojo si más.
- **Línea de tiempo:** se reproduce a 10 o 30 días por segundo, o se arrastra.
- **Selección:** al tocar una tarima, o una fila de la tabla, se ve su ficha con resultado, ofertas, proveedores, precio, primera entrega, días sin medicamento y si su proveedor incumple.

## Pantalla

- **Escenarios y palancas:** mes de la convocatoria, fuentes por clave, ofertas de descuento, errores en la documentación técnica, qué hacer con las desiertas e inventario puente.
- **Indicadores:**
    - claves adjudicadas en el fallo;
    - piezas con contrato;
    - vitales sin cubrir;
    - margen antes del 1 de enero;
    - claves con riesgo de desabasto (30 días o más sin medicamento);
    - precio contra referencia y compras de emergencia;
    - claves con una sola fuente.
- **Del plan al contrato:** cuántas piezas pasan cada filtro (oferta, solvencia técnica, precio, fallo, segunda vuelta).
- **Calendario del procedimiento:** contra el 1 de enero y el fin del inventario puente.
- **Desiertas y proveedores:** por qué quedan desiertas, y los proveedores con su concentración (HHI). Los laboratorios son simulados.
- **Tabla por clave:** ofertas, resultado, reparto entre fuentes, precio contra referencia, primera entrega y días sin medicamento. Se descarga en CSV.
- **Comparación de estrategias:** mismo plan, mismo mercado y mismos números aleatorios.

## Resultados (corrida 1, plan de ejemplo)

| Estrategia | Fallo | Margen al 1 ene | Adjudicadas en el fallo | Sin contrato | Claves con riesgo | Días-clave sin medicamento |
|---|---|---|---|---|---|---|
| Como 2027-2028 | 29 sep 2026 | 66 días | 44 de 54 (81 %) | 5 | 7 | 1,665 |
| Como 2025-2026 | 24 ene 2027 | 49 días tarde | 36 de 54 | 6 | 43 | 4,601 |
| Una sola fuente por clave | 29 sep 2026 | 66 días | 44 de 54 | 5 | 10 | 1,905 |
| Anticipada y precalificada | 16 jul 2026 | 141 días | 45 de 54 | 3 | 5 | 1,051 |

- **El calendario pesa más que el precio.** Con el calendario de 2025-2026, 43 claves pasan 30 días o más sin medicamento, aunque al final se contrata casi lo mismo.
- **Una sola fuente por clave** no abarata nada en este modelo y suma 3 claves en riesgo, por las rescisiones sin respaldo.
- **Convocar en mayo con revisión previa de la documentación** recorta las claves en riesgo de 7 a 5 y las compras de emergencia de $82 M a $5 M.
- **Las desiertas se explican sobre todo por** falta de ofertas (no hay quien fabrique o registre la presentación) y por precio no aceptable.

## Referencias reales para calibrar

- **2027-2028** ([convocatoria](https://consultorsalud.com.mx/compra-medicamentos-2027-2028-birmex/), [resultado](https://codigof.mx/salud-adjudica-85-de-claves-en-compra-consolidada-de-medicamentos-para-2027-2028/), [Expansión](https://politica.expansion.mx/mexico/2026/10/04/compra-medicamentos-2027-2028-birmex)):
    - Licitación de genéricos, oncológicos y antiinfecciosos: 626 de 766 claves adjudicadas (82 %), unos 3,200 millones de piezas y unos $84 mil M.
    - 102 empresas; 375 claves a un solo proveedor y 251 a dos o más.
    - Fallo el 25 de septiembre de 2026, 11 días tarde.
    - Patente y fuente única: 322 claves.
    - Contratos del 1 de enero de 2027 al 31 de diciembre de 2028.
    - Segunda licitación para las desiertas antes de terminar 2026.
- **2025-2026** ([Expansión](https://politica.expansion.mx/mexico/2025/01/15/compra-consolidada-adjudica-39-de-los-medicamentos-temen-desabasto)):
    - Se adjudicó 39 % de las partidas (73 % de las piezas, según la autoridad).
    - 1,044 partidas quedaron desiertas, sobre todo por errores de documentación, y 1,318 sin oferta.
    - El fallo salió el 13 de enero de 2025, con entregas desde febrero y marzo.
- **Ley de Adquisiciones** ([Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-publicada-nueva-ley-adquisiciones-arrendamientos-servicios-sector-publico)): publicada el 16 de abril de 2025; define el precio no aceptable y el no conveniente.

## Pendiente

- **Datos reales:** padrón de proveedores con registro sanitario y capacidad por clave, precios de referencia de la investigación de mercado, y resultados de fallo por clave.
- **Contrato abierto:** mínimos y máximos, y órdenes de suministro mensuales ligadas a la ventana de Contratos.
- **Material de curación y segundo año del contrato (2028).**
