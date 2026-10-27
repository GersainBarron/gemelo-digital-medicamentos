# Integridad del plan de necesidades: datos que debe crear la plataforma

Ventana `#/p/ID/integridad` de Planeación (archivos `web/js/integridad.js` y la vista en `web/js/planeacion.js`).

El gemelo no tiene los datos reales y no los necesita para esto. Simula para decirle a la ATDT qué datos debe crear la plataforma, con qué campos, para que ninguna dependencia (unidad, delegación u Oficina Central) pueda manipular el plan sin que se note.

## Cómo funciona

- **Actores de mala fe:** sobre el plan simulado se siembra un porcentaje de unidades (5 %), delegaciones (10 %) y analistas de Oficina Central (2 de 5). Cada uno comete una o dos conductas conocidas, con su monto en pesos.
- **Reglas de alerta:** cada regla necesita ciertos datos. Si la plataforma no los crea, la regla no corre. Ninguna regla es perfecta: tiene una sensibilidad, porque los actores también se cuidan (aprueban despacio, adjuntan evidencia falsa, reparten entre proveedores).
- **Resultado:** cada caso queda frenado a tiempo (antes de autorizar), visto tarde (al comparar contra el surtido, con el dinero ya gastado) o escapado.
- **Falsas alarmas:** se cuentan los insumos de unidades honestas que una regla acusa. Ejemplo: el consumo solo, sin vales de desabasto, padrón ni plantilla, acusa a miles de insumos con cambios legítimos.
- **Valor de cada dato:** cuánto se frena de más al crearlo, o cuánto se escapa al quitarlo, y cuántas falsas alarmas evita.
- **Descargas:** "Ficha para la ATDT" (Markdown) y "Requerimiento de datos" (CSV) con dato, área que lo genera, frecuencia, campos mínimos, reglas que habilita, conductas que detecta y valor en la simulación.

## Resultado del ejemplo (corrida 1)

$251 M en riesgo (5.2 % del plan) en 178 casos.

| Datos creados | Frenado a tiempo | Se escapa | Falsas alarmas |
|---|---|---|---|
| Ninguno | 0 % | $251 M | 0 |
| Los del requerimiento del Módulo 1 (Llave MX, catálogo de unidades y cuadro por nivel) | 10 % ($24.9 M) | $226 M | 0 |
| Los 13 | 99 % ($248 M) | menos de $1 M | 534 |

- **Lo que más pesa:** los casos de Oficina Central. Dirigir el plan a un proveedor ($156 M) solo se detecta con proveedor y precio por clave.
- **La bitácora del requerimiento no basta:** registra movimientos, pero sin sello y sin el valor anterior no detecta cambios después de la firma, inflado en la negociación ni borrado de versiones.
- **El consumo real no basta solo:** necesita los vales de desabasto, el padrón y la plantilla para no acusar a unidades honestas.

## Datos

| Dato | Área que lo genera | Frecuencia | Campos mínimos | Para qué |
|---|---|---|---|---|
| Consumo real por unidad | Salidas de unidades médicas (farmacia) | Diaria | CLUES, clave, fecha, piezas surtidas, folio de receta, cédula del médico | Lo que de verdad se entregó a pacientes. Es la vara para medir si un pedido está inflado. |
| Recetas negadas y vales de desabasto | Salidas de unidades médicas (farmacia) | Diaria | CLUES, clave, fecha, piezas negadas, folio del vale | Corrige el consumo de los meses con desabasto; sin esto, una unidad que se quedó sin medicamento parece que pide de más. |
| Padrón de derechohabientes adscritos | Afiliación y vigencia de derechos | Mensual | CLUES, mes, adscritos, altas, bajas | Comprueba el motivo "más derechohabientes". |
| Plantilla médica y servicios activos | Personal y planeación de servicios | Mensual | CLUES, servicio, especialidad, médicos, fecha de apertura | Comprueba el motivo "servicio nuevo o médico especialista". |
| Cuadro básico por nivel de atención | Comité de insumos (CNIS) | Por actualización | clave, nivel, servicios que la prescriben, vigencia | Qué claves puede pedir cada tipo de unidad. |
| Estatus de cada unidad (CLUES) | Infraestructura y DGIS | Por evento | CLUES, estatus (operando, en obra, cerrada), fecha, documento | Evita planear para unidades que no operan. |
| Existencias, caducidades y mermas | Manejo de inventario | Diaria | CLUES, clave, lote, caducidad, existencia, mermas con acta | Detecta a quien pide teniendo inventario de sobra y lo que se caduca después. |
| Identidad en cada acción | Gestor de usuarios (Llave MX) | En cada acción | usuario, rol, CLUES o delegación asignada, sesión, IP, fecha y hora | Quién hizo cada cosa; impide que una persona actúe con dos roles. |
| Bitácora sellada y versiones | Plataforma (núcleo) | En cada acción | acción, valor antes, valor después, usuario, hora, huella del registro anterior | Registro que no se puede borrar ni editar; guarda cada versión de las piezas. |
| Tiempo de revisión por petición | Plataforma (núcleo) | En cada acción | petición, apertura, decisión, segundos con el detalle abierto | Distingue una revisión real de una aprobación en bloque. |
| Motivo con evidencia | Plataforma (núcleo) | En cada cambio | catálogo de motivos, documento adjunto, quién lo valida | Todo cambio de piezas lleva una razón comprobable. |
| Proveedor y precio por clave | Contrataciones | Por contrato | clave, proveedor, contrato, precio, vigencia | Permite ver si el plan se carga hacia las claves de un proveedor. |
| Surtido contra lo planeado | Suministro y reposición | Mensual | plan, CLUES, clave, mes, piezas planeadas, compradas, entregadas y consumidas | Cierra el ciclo: al final del año muestra lo que se pidió de más, pero el dinero ya se gastó. |

## Reglas de alerta y datos que necesita cada una

| Regla | Datos | Momento |
|---|---|---|
| Pide más de 1.5 veces lo que consumió | Consumo real por unidad | Durante la aprobación |
| Pide teniendo más de 6 meses de existencia | Existencias, caducidades y mermas | Durante la aprobación |
| Pide para una unidad que no opera | Estatus de cada unidad (CLUES) | Durante la aprobación |
| Pide claves que no le corresponden por nivel | Cuadro básico por nivel de atención | Durante la aprobación |
| "Más derechohabientes" sin crecimiento del padrón | Padrón de derechohabientes adscritos | Durante la aprobación |
| "Servicio nuevo" sin servicio ni médico registrados | Plantilla médica y servicios activos | Durante la aprobación |
| Aprobó cientos de peticiones en minutos | Tiempo de revisión por petición | Durante la aprobación |
| Aprobaciones masivas desde una sola sesión | Identidad en cada acción + Tiempo de revisión por petición | Durante la aprobación |
| La delegación subió lo que pidió la unidad | Bitácora sellada y versiones | Durante la aprobación |
| Aprueba sin cambios pedidos inflados de la misma unidad | Consumo real por unidad + Bitácora sellada y versiones | Durante la aprobación |
| Cambio de Central sin motivo comprobable | Motivo con evidencia + Bitácora sellada y versiones | Durante la aprobación |
| Aumentos concentrados en claves de un proveedor | Proveedor y precio por clave | Durante la aprobación |
| Cambio o borrado después de la firma | Bitácora sellada y versiones + Identidad en cada acción | Durante la aprobación |
| Una persona aprueba como unidad y como delegación | Identidad en cada acción | Durante la aprobación |
| Al cierre del año: comprado y no consumido | Surtido contra lo planeado + Existencias, caducidades y mermas | Al cierre del año (tarde) |

## Conductas que se buscan

| Conducta | Quién | Cómo | Reglas que la detectan |
|---|---|---|---|
| Inflar el pedido | Unidad | Pide de 1.3 a 2.5 veces su necesidad en algunas claves para desviar o acaparar. | Pide más de 1.5 veces lo que consumió; Pide teniendo más de 6 meses de existencia; Al cierre del año: comprado y no consumido |
| "Más derechohabientes" falso | Unidad | Sube 15 a 30 % todo su pedido con un motivo que no es cierto. | "Más derechohabientes" sin crecimiento del padrón; Al cierre del año: comprado y no consumido |
| "Servicio nuevo" falso | Unidad | Pide 1.5 a 2.2 veces en claves de una especialidad que no tiene. | "Servicio nuevo" sin servicio ni médico registrados; Pide más de 1.5 veces lo que consumió; Al cierre del año: comprado y no consumido |
| Pedir teniendo existencia | Unidad | Tiene 8 a 14 meses de inventario y pide el año completo; luego se caduca. | Pide teniendo más de 6 meses de existencia; Al cierre del año: comprado y no consumido |
| Claves que no le tocan | Unidad | Una unidad de 1er nivel pide claves hospitalarias. | Pide claves que no le corresponden por nivel; Al cierre del año: comprado y no consumido |
| Unidad fantasma | Unidad | Se planea para una unidad en obra o cerrada. | Pide para una unidad que no opera; Al cierre del año: comprado y no consumido |
| Aprobar en bloque | Delegación | La delegación aprueba todo sin revisar; pasa el colchón de sus unidades. | Aprobó cientos de peticiones en minutos; Aprobaciones masivas desde una sola sesión |
| Inflar en la negociación | Delegación | La delegación sube piezas a sus unidades favoritas. | La delegación subió lo que pidió la unidad; Al cierre del año: comprado y no consumido |
| Colusión con una unidad | Delegación | Aprueba sin cambios, ronda tras ronda, el pedido inflado de una unidad. | Aprueba sin cambios pedidos inflados de la misma unidad; Al cierre del año: comprado y no consumido |
| Aumento discrecional | Oficina Central | Un analista de Central sube 10 a 20 % a una delegación por encima del máximo. | Cambio de Central sin motivo comprobable; Al cierre del año: comprado y no consumido |
| Dirigir a un proveedor | Oficina Central | Sube 25 a 60 % en claves que surte un mismo proveedor. | Aumentos concentrados en claves de un proveedor; Al cierre del año: comprado y no consumido |
| Cambiar después de la firma | Oficina Central | Modifica piezas cuando el plan ya está cerrado. | Cambio o borrado después de la firma |
| Doble rol | Cualquier nivel | La misma persona pide como unidad y aprueba como delegación. | Una persona aprueba como unidad y como delegación; Al cierre del año: comprado y no consumido |
| Borrar versiones | Cualquier nivel | Se borra la versión original para ocultar un aumento. | Cambio o borrado después de la firma |
