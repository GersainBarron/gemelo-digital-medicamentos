# Torre de control del abasto

Vista `web/torre.html`. Archivos: `web/js/torre-engine.js` (motor), `web/js/torre-worker.js` (corre el motor en segundo plano), `web/js/torre.js` (pantalla) y `web/css/torre.css`.

Es la vista del "jefe de jefes". Corre **todos los gemelos del proyecto** con un mismo escenario y los resume en una sola cadena de diez eslabones. Con solo ver los indicadores se sabe:

- **de qué área** es el problema;
- **a quién llamar** y con qué urgencia;
- **qué nombres concretos** (analista, administrador delegacional, director de unidad, administrador de contrato, almacenista, responsable de red fría) están detrás.

## Principios (de la investigación)

| Principio | Cómo se aplica | Fuente |
|---|---|---|
| Una torre de control es personas, procesos, datos, organización y tecnología, no un tablero | Cada indicador tiene dueño, meta escrita y procedimiento de escalamiento | Gartner (vía SupplyChain247) |
| Gestión por excepción | La portada solo muestra lo que está fuera de meta; lo verde no pide atención | DSG.ai, Umbrex |
| Alertas priorizadas por impacto, con dueño y plazo | "A quién llamar hoy" ordena por nivel y por brecha × peso | Umbrex |
| Pocos indicadores de nivel 1 y árbol hasta la causa raíz | Estrella del norte (4) → eslabón → indicador → nombres | SCOR (Umbrex, ASCM) |
| Semáforo contra una referencia | Meta y nivel crítico por indicador, cada uno con su fuente | ASCM SCORmark |
| Un solo responsable por indicador | La "A" de la matriz RACI | BSC Designer |
| Atribuir la falla al eslabón correcto | Un desabasto local es culpa local solo si la cadena de arriba cumplió | Umbrex, SCOR |
| Datos de transacciones, no encuestas | Recetas, entregas, conteos y temperaturas | CONEVAL (ficha E018) |

## Escenarios

Un solo botón cambia el escenario de **toda** la cadena. Cada gemelo corre su versión del escenario.

| Escenario | Nacional | Red fría | Compra | Piloto Hidalgo (CEDIS, contratos) | CENADI (patio) | Marbetes |
|---|---|---|---|---|---|---|
| Operación normal | normal | otoño | 2027-2028 | normal | A · día normal | disciplina media |
| Un proveedor falla | falla de proveedor | otoño | una sola fuente por clave | contingencia | A · contingencia | media |
| Temporada de huracanes | huracán | huracán | 2027-2028 | normal | A · día normal | media |
| Compra tardía (como 2025) | falla de proveedor | otoño | 2025-2026 | contingencia | A · pico | baja |

El plan anual sale de la **bitácora de Planeación** de ese navegador (`planeacion.bitacora.v1`) y los controles de integridad de `planeacion.integridad.v1`. Si el plan está en el día 0 de la aprobación, la torre lo avanza al día hábil 15 para tener algo que vigilar, y lo dice.

## La cadena: 10 eslabones, 36 indicadores

| # | Eslabón | Dueño (A) | Alcance | Indicadores |
|---|---|---|---|---|
| 1 | Planeación | Subdirección de Planeación de Insumos | Nacional · plan 2027 | partidas vencidas en bandeja (meta ≤ 2 %), avance contra lo programado (≥ 100 %), holgura del calendario (≥ 5 días), pedido arriba de la propuesta (≤ 10 %), WAPE (≤ 20 %) |
| 2 | Compra consolidada | Subdirección de Adquisiciones | Nacional · licitación 2027 | piezas con contrato (≥ 99 %), vitales sin contrato completo (0), claves con 30 días o más sin medicamento (0), días entre la firma y el 1 de enero (≥ 30) |
| 3 | Proveedores y contratos | Administración de contratos; pago: Finanzas | Piloto Hidalgo · 90 días | OTIF (≥ 93 %), piezas a tiempo (≥ 95 %), rechazos (≤ 2 %), facturas pagadas a tiempo (≥ 95 %), contratos en naranja o rojo (0) |
| 4 | CENADI | Gerencia del CENADI | Un día tipo | estancia del proveedor (≤ 120 min), tráileres con más de 3 h (≤ 5 %), embarques que salen a tiempo (≥ 95 %), del andén al rack (≤ 120 min) |
| 5 | Distribución nacional | Coordinación de Distribución del CENADI | 32 estados · 30 días | llegadas a tiempo (≥ 95 %), lo pedido que se embarcó (≥ 98 %), estados que llegaron a cero (0), demanda estatal atendida (≥ 97 %) |
| 6 | Almacén estatal | Jefe(a) del almacén delegacional | Piloto Hidalgo · 90 días y el año de marbetes | surtido completo a unidades (≥ 95 %), exactitud de inventario (≥ 95 %), diferencia del inventario anual (≤ 0.72 %), almacenistas con patrón de faltantes (0) |
| 7 | Distribución estatal | Jefatura de Distribución delegacional | Piloto Hidalgo · 30 días | urgencias fuera de plazo (≤ 5 %), sobrecosto de rutas contra las optimizadas (≤ 10 %) |
| 8 | Unidad y farmacia | Director(a) de la unidad y Jefatura de farmacia | Piloto Hidalgo · 60 unidades | **recetas surtidas completas (≥ 97 %)**, PEX autorizados en plazo (≥ 90 %), piezas caducadas (informativo) |
| 9 | Red fría (transversal) | Coordinación de Red Fría | Nacional · 30 días | tiempo en 2 a 8 °C (≥ 99 %), excursiones detectadas (≥ 90 %), producto dañado sin detectar ($0) |
| 10 | Integridad (transversal) | Área central y Órgano Interno de Control | Nacional · pedidos del plan | pedidos maliciosos que pasaron (≤ 0.5 % del costo del plan), alertas falsas (≤ 50) |

Cada indicador trae en pantalla qué mide, su fórmula, de dónde sale la meta, a quién se le reclama, de qué depende y los nombres concretos detrás.

**Estrella del norte** (lo que ve primero el jefe):

- recetas surtidas completas en el piloto (meta 97 %, MIR E018 del ISSSTE);
- abasto de los almacenes estatales (97 %, cifra del ISSSTE de abril de 2026);
- piezas del plan con contrato (99 %, compra consolidada 2025-2026);
- dinero expuesto sin control (pedidos maliciosos que pasaron más producto de red fría dañado sin detectar).

## Cómo decide

### Semáforo

**Brecha** = (meta − valor) ÷ (meta − crítico), con el signo invertido si menos es mejor. Se acota entre 0 y 3.

| Brecha | Semáforo |
|---|---|
| 0 | verde |
| menor que 1 | ámbar |
| 1 o más | rojo |

Cuando no hay fuente pública para una meta, se dice "meta interna del gemelo".

### Atribución al eslabón correcto

Los indicadores de resultado dependen de otros de arriba (`DEP` en el motor):

| Indicador | Depende de |
|---|---|
| Compra: con contrato, vitales, 30 días sin medicamento, margen | Planeación: holgura y avance |
| Proveedores: OTIF y piezas a tiempo | Compra: días entre la firma y el 1 de enero (sin contrato a tiempo no hay a quién exigirle) |
| Distribución nacional: llegadas a tiempo | CENADI: embarques que salen a tiempo |
| Distribución nacional: surtido, estados en cero, demanda atendida | Proveedores: OTIF; Compra: con contrato (y CENADI: salidas, para estados en cero) |
| Almacén estatal: surtido a unidades | Proveedores: OTIF; Distribución nacional: surtido |
| Distribución estatal: urgencias | Almacén estatal: surtido |
| Unidad: recetas completas | Almacén estatal: surtido; Distribución estatal: urgencias |

Si el indicador de arriba está en rojo, **65 %** de la brecha pasa a su eslabón; si está en ámbar, **25 %**. En "¿De quién es el problema?" la parte que llega de abajo se ve rayada.

### Escalamiento

| Nivel | Cuándo | Qué se hace |
|---|---|---|
| 1 · dueño directo | Indicador en ámbar | Atender en 24 a 48 h con su procedimiento |
| 2 · revisión semanal | Indicador en rojo | A la junta semanal de operación (S&OE), con causa raíz y plan |
| 3 · dirección general | Rojo de peso 3, mayormente propio (≥ 70 %) y con brecha ≥ 1.5, o desabasto que ya cruza dos de los tres eslabones de entrega (distribución nacional, almacén, unidad) | Decisión de política esta semana |

Si más de la mitad de la brecha viene de arriba, baja un nivel: primero se llama allá.

### Reparto

"¿De quién es el problema?" = Σ brecha × peso por eslabón, después de la atribución, como porcentaje del total.

## Resultados (navegador, plan en el día hábil 15)

| Escenario | El problema es de… | Llamadas a dirección / semanal / dueño | Paciente |
|---|---|---|---|
| Operación normal | Red fría 26 %, Proveedores y contratos 24 % | 3 / 12 / 5 | 99.9 % de recetas completas, 100 % de abasto estatal |
| Un proveedor falla | Proveedores y contratos 31 %, Red fría 21 % | 3 / 13 / 6 | 97.9 % de recetas (todavía en meta) |
| Temporada de huracanes | Proveedores y contratos 25 %, Red fría 25 % | 3 / 12 / 6 | 2 estados de la península llegan a cero |
| Compra tardía (como 2025) | **Compra consolidada 19 %**, Red fría 18 %, Proveedores 16 % | 3 / 14 / 10 | 97.9 % de recetas; contratos firmados 49 días después del 1 de enero |

### Hallazgos

- **El paciente es lo último en enterarse.** Con un proveedor que falla, las recetas completas del piloto bajan de 99.9 % a 97.9 %, todavía en meta. Mientras, el CENADI solo embarca 66 % de lo que piden los estados y 86 % de las urgencias llegan tarde. La torre lo ve semanas antes que la ventanilla.
- **Siempre en rojo, aunque la operación sea normal:**
    - **Red fría:** con registro manual se detecta menos de la mitad de las excursiones y hay $6.6 M de producto dañado sin detectar.
    - **Integridad:** 4.6 % del costo del plan son pedidos maliciosos que pasan los controles mínimos.
    - **Bandeja de Oficina Central:** 53 % de las partidas están vencidas con 5 analistas.

  No son de un mal día: son de diseño. Por eso van a dirección general.
- **Compra tardía cambia al culpable.** Las entregas tarde de los proveedores dejan de ser de los proveedores. 65 % de la brecha pasa a Adquisiciones, porque los contratos se firmaron después del 1 de enero.

## Lo que la torre no ve

- **Los gemelos no están conectados entre sí.** Cada uno corre su escenario con sus propios datos. La torre los pone lado a lado con alcance y periodo, no como un solo modelo.
- **El detalle de CEDIS, rutas, unidades y recetas solo existe para Hidalgo.** Los otros 31 estados se ven a nivel de almacén estatal.
- **El ISSSTE no registra la causa de cada receta no surtida.** El INAI le ordenó informarla.
- **Al proveedor no se le regaña: se le aplica el contrato.** La torre señala al administrador del contrato.
- **Todo es simulado.** Sirve para decidir qué datos capturar y quién responde por cada uno, no para calificar a personas reales.

## Referencias

- Gartner, vía SupplyChain247: https://www.supplychain247.com/article/what_is_a_supply_chain_control_tower_and_whats_needed_to_deploy_one
- Umbrex, modelo operativo de una torre de control: https://umbrex.com/?p=244657
- Umbrex, SCOR: https://umbrex.com/resources/frameworks/strategy-frameworks/scor-model/
- ASCM, tablero SCORmark: https://www.ascm.org/globalassets/ascm_website_assets/docs/2026-scormark-dashboard-example-deliverables.pdf
- DSG.ai, torre de control: https://www.dsg.ai/blog/control-tower-in-supply-chain
- BSC Designer, RACI: https://bscdesigner.com/raci-strategic-planning.htm
- CONEVAL, ficha E018 del ISSSTE: https://www.coneval.org.mx/Evaluacion/Documents/EVALUACIONES/FMyE_2017_2018/FMyE_51_E018.pdf
- Consultor Salud, ISSSTE 97 % de abasto (1-abr-2026): https://consultorsalud.com.mx/issste-reporta-97-de-abasto-de-medicamentos-en-sus-unidades-y-elimina-farmacias-por-debajo-del-90/
- Zeta Tijuana, comparecencia de Salud (7-nov-2025): https://zetatijuana.com/2025/11/salud-federal-presume-96-de-abasto-de-medicamentos-imss-surte-97-recetas-dice/
- Cero Desabasto, radiografía 2017-2021: https://a.storyblok.com/f/162801/x/0680df0f5f/resumen-radiografia-desabasto-2017-2021.pdf
- Expansión, recetas no surtidas en 2023: https://politica.expansion.mx/mexico/2024/05/06/recetas-no-se-surtieron-completamente-en-2023
- El Universal, INAI y recetas no surtidas del ISSSTE: https://www.eluniversal.com.mx/nacion/ordena-inai-al-issste-transparentar-numero-de-medicamentos-no-surtidos-en-2024-debe-informar-la-causa/
- IAPHL, manual de indicadores: https://iaphl.org/wp-content/uploads/2016/05/M_E_indicators_hdbk.pdf
- OMS, indicadores de acceso: https://www.who.int/tools/monitoring-and-evaluation/access-indicators
- RHSC, indicadores armonizados de desabasto: https://rhsupplies.org/activities-resources/publications/harmonized-suite-of-indicators-to-measure-stockouts-and-availability-of-contraceptives-7374

## Parámetros de la URL

| Parámetro | Valores | Para qué |
|---|---|---|
| `esc` | `normal`, `proveedor`, `huracan`, `tardia` | Escenario |
| `e` | `plan`, `compra`, `prov`, `cenadi`, `dnac`, `alm`, `dest`, `unidad`, `frio`, `integ` | Eslabón abierto |
| `debug` | — | Expone `window.__torre` |

Tarda unos 6 segundos por escenario, en segundo plano, y guarda el resultado mientras la página está abierta.

---
© 2026 Gersain Barron · Licencia MIT
