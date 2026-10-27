# Módulo 1 · Planeación (plan anual de necesidades)

Ventana `web/planeacion.html` del gemelo digital. Es un prototipo operable del Módulo 1 de la plataforma homologada de abasto (requerimientos ATDT: Sprint 1, configuración y catálogos; Sprint 2, asignación de insumos; Sprint 3, aprobación, negociación, programas especiales y cierre), con una simulación del ciclo completo encima.

El prototipo responde dos preguntas:
- cómo se pide, se negocia y se autoriza la necesidad anual de cada unidad;
- qué pasa con el costo y la precisión del plan según cómo se arme la propuesta.

## Submódulos

| Submódulo | Pantallas | Requerimientos |
|---|---|---|
| **Planes de necesidad** | Bandeja con búsqueda, filtros y paginador de 15; nuevo plan en 5 pasos (datos, periodo de catálogos, de asignación, de programas especiales y de aprobación, cada uno con responsables); cancelar plan con motivo; consultar plan | RF_C_01 a RF_C_13, RN_04, RN_27 a RN_37 |
| **Mi tablero** | Pantalla de inicio por rol: a quién llamar hoy y por qué (atraso, calidad o integridad), KPI con semáforo, escalera de avisos y botón de recordatorio que llega a la campana del responsable | Gemelo |
| **Tablero del plan** | Etapas con color (verde concluida, café en proceso, gris pendiente), fechas, enlaces "Ir al catálogo", editar configuración inicial con motivo | RF_C_14, HU01 S2 |
| **Catálogos institucionales** | Unidades (1,033 CLUES ISSSTE): personalizar, quitar o regresar, dentro o fuera del plan, finalizar o cancelar la finalización, descarga. Insumos (60 claves CNIS) con detalle, en pestañas de medicamentos y material de curación. Kits en 3 pasos, con insumos exclusivos por kit | RF_C_16 a RF_C_25, RN_08 a RN_26 |
| **Asignación de insumos** | Vista por delegación, unidad o insumo; asignación automática por pronóstico; asistente de 3 pasos (unidades, insumos, piezas); planeación anual o mensual con propuesta mínima y máxima; carga y descarga CSV con validación; origen "Kit" o "Fuera de kit"; finalizar asignación | HU01 a HU12 S2, RNG-01 a RNG-03 |
| **Aprobación de insumos** | Por rol: la unidad dictamina sus insumos, la delegación sus unidades y Oficina Central todas las delegaciones. Detalle con planeación mensual, versiones, observaciones de cada nivel y gráfica de existencias (consumo, entradas, existencia). Aprobar, rechazar con motivo, o negociar con nueva propuesta mensual y observaciones; aprobar o rechazar todo; finalizar verificación; solicitud de insumo nuevo; piezas fuera de rango en rojo | HU03 a HU23 S3 |
| **Programas especiales** | Bandeja, alta en 4 pasos (datos, kits, insumos, piezas), detalle y edición de piezas | HU26 a HU31 S3 |
| **Cierre del plan** | El aprobador firmante descarga el plan consolidado nacional y sube el oficio en PDF; el plan pasa a "Cerrado" | HU24 S3 |
| **Notificaciones y bitácora** | Campana por rol (la unidad solo ve las suyas, la delegación las de sus unidades) y registro de movimientos con descarga | HU02 y HU25 S3, REQ_NOFUN_07 |
| **Seguimiento y traza** | Indicadores de desviación (avance contra lo programado, cierre estimado contra la fecha límite, peticiones vencidas por actor, cuello de botella, de quién es el retraso, piezas y costo contra la propuesta y el presupuesto, fuera de rango y rondas de más); etapas programadas contra reales; avance por nivel; dónde está atorado (antigüedad por actor); reparto del retraso por delegación; a quién se le acaba el tiempo; plazos editables. En el detalle de cada insumo, la traza de la petición por carriles | Gemelo |
| **Flujo nacional 3D** | Mapa de México por estado con la torre de Buenavista: las peticiones viajan como partículas (asignación, aprobación, negociación, rechazo) entre unidades, delegaciones y Oficina Central; pilas de cajas con lo que cada quien tiene pendiente por antigüedad; estados coloreados por quién tiene la mayoría o por vencidas; línea de tiempo con reproducción y ficha de lo que se atora | Gemelo |
| **Integridad del plan** | Actores de mala fe sembrados (unidades, delegaciones y analistas de Central), 15 reglas de alerta y 13 datos que debe crear la plataforma; qué se frena, qué se ve tarde, qué se escapa y cuántas falsas alarmas; ficha y CSV para la ATDT. Detalle en `docs/INTEGRIDAD.md` | Gemelo |
| **Simulación del ciclo** | Indicadores, avance diario, mapa de delegaciones, reglas de los actores, tabla por delegación y comparación de métodos | Gemelo |

La barra lateral "Sistema Integral de Abasto" enlaza los demás módulos con las vistas del gemelo que ya los representan:
- Contrataciones: `contratos.html`
- Suministro y reposición: `index.html`
- Entrega y recepción: `cenadi.html`
- Manejo de inventario: `mapa.html`
- Salidas de unidades médicas: `unidad.html`
- Monitoreo de KPI: `nacional.html`

## Roles

En la barra superior "Actuar como" se cambia de rol:
- Área central
- Administrador delegacional (se elige delegación)
- Unidad médica (se elige delegación y unidad)
- Aprobador firmante
- Administrador institucional (solo lectura)

Cada rol ve sus bandejas y acciones (RN_02, RN_03, RN_06).

## Flujo de estatus

- **Plan:** Pendiente de configuración → En proceso (al concluir la etapa 1) → Pendiente de validación (al finalizar la asignación) → Finalizado (cuando Oficina Central verifica la última unidad) → Cerrado (con el oficio del firmante). También puede pasar a Cancelado.
- **Insumo por nivel** (Unidad, Delegación y O. Central): Pendiente, Aprobado, Rechazado, Negociación, En revisión y Por validar.
  - La negociación de la delegación o de Central regresa el insumo a la unidad ("En revisión").
  - La respuesta de la unidad vuelve a subir por la delegación y Central.
  - Toda propuesta queda versionada.
- **Verificación por unidad:** la unidad finaliza, luego la delegación, luego Oficina Central. Una negociación reabre la verificación de los niveles que ya la habían cerrado.

## Traza y seguimiento

La aprobación es secuencial: Unidad → Delegación → Oficina Central → Cierre. Los programas especiales van aparte.
- **Quién tiene la petición:** la unidad mientras su insumo esté pendiente o en revisión. Pasa a la delegación cuando la unidad finaliza su verificación, y a Oficina Central cuando la delegación finaliza la de esa unidad.
- **Plazos:** cada actor tiene un plazo por ronda (unidad 5, delegación 5 y Central 3 días hábiles) y una fecha límite de fase (35 %, 60 % y 85 % del periodo de aprobación). Se editan en pantalla.
- **Culpa:** cada día hábil se suma un día-petición a quien la tiene. Pasado su plazo, cuenta como día fuera de plazo.
- **Cierre estimado:** al ritmo de Central de los últimos días, contra la fecha límite del periodo.
- **Traza de la petición:** carriles Unidad, Delegación y O. Central sobre días hábiles. Muestra cada decisión con sus piezas, flechas de quién la mandó a quién, el tiempo en cada escritorio (en rojo lo fuera de plazo) y las fechas límite.
- **En las tablas:** la de insumos de cada unidad tiene la columna "La tiene", con quién y cuántos días.

Con el ejemplo (método pronóstico):
- **Día 15:** Central va 5 pp arriba de lo programado, pero tiene 18,313 peticiones en su escritorio, 17,531 de ellas vencidas.
- **Retraso acumulado:** 65 % es de Central, 22 % de las delegaciones y 13 % de las unidades.
- **Jalisco y Ciudad de México:** el retraso es sobre todo de la delegación.
- **Ciclo completo:** termina en el día hábil 41, contra una fecha límite de 39.

## Mi tablero: a quién llamar hoy

Ventana `#/p/ID/mitablero` (archivo `web/js/responsables.js`). Responde, según el rol, a quién hay que regañar y por qué.
- **Cada rol ve solo el nivel de abajo.** Central ve 32 delegaciones y a sus 5 analistas, no 1,033 unidades. La delegación ve sus unidades. La unidad ve lo suyo.
- **Dos tipos de culpa:**
    - Directa: quien tiene la petición y ya venció su plazo.
    - De supervisión: la delegación responde por sus unidades atrasadas, aunque su bandeja esté al día.
- **Tres cosas que pueden andar mal**, cada una con su remedio:
    - Atraso: recordatorio.
    - Calidad (rondas de más, pedido lejos del consumo, costo arriba de la propuesta, aprobar todo sin cambios): revisar o capacitar.
    - Integridad (alertas de la ventana Integridad del plan): revisión formal.
- **Semáforo:** al día; con atraso; escalado (una petición pasó al supervisor o hay una alerta de integridad).
- **Escalera de avisos:**
    - Al vencer el plazo se avisa a quien tiene la petición.
    - 3 días después, a su supervisor.
    - 5 días después llega a Central.
    - Los días se editan en pantalla. El supervisor de la unidad es su delegación; el de la delegación y el de los analistas, la coordinación de planeación de Central.
- **Central también aparece.** Cada analista tiene asignadas 6 o 7 delegaciones y su bandeja vencida se muestra aparte, porque en la simulación Central es quien más retrasa.
- **Recordatorio:** el botón manda el aviso a la campana del responsable y queda en la bitácora.
- **Responsables por puesto**, no por persona. El directorio con nombres y supervisores es un dato que debe crear la plataforma.

Con el ejemplo, en el día 15:
- 6 delegaciones están escaladas y las 26 restantes tienen atraso.
- Central tiene 17,531 peticiones vencidas; 11,909 ya pasaron el nivel de aviso a Central.
- Jalisco encabeza la lista por tres motivos: 1,238 vencidas en su escritorio, costo 22 % arriba de la propuesta y 2 alertas de sus unidades.

## Flujo nacional 3D

Ventana `#/p/ID/flujo` (archivo `web/js/plan3d.js`). Usa el mapa `assets/mapa_mexico.glb` y la torre `assets/issste_buenavista.glb`, ambos de Blender.
- **Registro:** el motor guarda en cada día simulado (`P.flow[d]`) dos cosas. La primera es el corte de cuántas peticiones tiene cada nodo, por antigüedad contra su plazo. Los nodos son las 1,033 unidades, las 32 delegaciones y Oficina Central, separada por delegación. La segunda es qué se movió de quién a quién, con la decisión.
- **Partículas:** cada grupo de peticiones que cambia de escritorio viaja por arcos: unidad → delegación → Central, y de regreso cuando hay negociación. La asignación inicial sale de Central hacia todas las unidades. Lo concluido sube a la torre.
- **Pilas:** una caja equivale a 100 peticiones. Abajo van las más viejas: rojo es más del doble del plazo, ámbar vencida y verde agua dentro de plazo. La columna de cada unidad crece con sus pendientes.
- **Estados:** se colorean por quién tiene la mayoría de sus peticiones (unidad, delegación o Central) o por cuántas van vencidas.
- **Ficha:** muestra las peticiones abiertas por actor, lo concluido y dónde se atora más. Al tocar una delegación, una unidad o la torre se ve su detalle y un enlace a su aprobación.

## Simulación del ciclo

- **Universo:** 1,033 unidades ISSSTE en operación (CLUES ago 2026) en 32 delegaciones y 60 claves CNIS. El 1er nivel recibe las 34 claves de farmacia; el 2º y 3er nivel, las 60. En total son 38,528 pares unidad-insumo.
- **Consumo:** 36 meses por par (nov 2023 a oct 2026), según:
  - el tamaño de la unidad y el peso de prescripción de la clave;
  - la estacionalidad respiratoria, la tendencia de crónicos y meses con desabasto.

  Para 2027 se agregan cambios que la unidad conoce y el pronóstico no: más derechohabientes, servicios nuevos, sustitución terapéutica o claves que ya no se prescriben.
- **Propuesta:** Holt-Winters mensual (estación de 12).
  - Mínimo = pronóstico de 2027.
  - Máximo = mínimo + 1.65 desviaciones, con tope de 30 %.
  - Reparto mensual: el del pronóstico.

  Alternativas para comparar: la regla de la HU08 (mínimo + 10 % repartido igual) y el consumo del año anterior.
- **Reglas de los actores** (se editan en pantalla):
  - **La unidad** empieza entre el día 0 y el 6. Negocia si su necesidad más un colchón (15 %) supera la propuesta en más de 10 %, y rechaza claves que ya no prescribe.
  - **La delegación** revisa 8 unidades por día. Acepta lo que cabe en 125 % del consumo histórico o un cambio justificado; si no, ofrece el punto medio.
  - **Oficina Central** revisa 60 unidades por día. Aprueba dentro del máximo + 10 % y, fuera de eso, solo si queda presupuesto (pronóstico + 5 %). Si no, ofrece el máximo.
  - A la tercera ronda todos aceptan.
- **Persistencia:** las acciones se guardan en el navegador (localStorage) y el estado se reconstruye repitiéndolas. Es determinista. El punto `>>> API` marca dónde va el servicio real.

## Resultados (ciclo completo, mismas reglas)

| Método de propuesta | Días hábiles | Aprobados a la primera | Rondas por insumo | Error vs necesidad real | Sobreasignado | Faltante | Costo del plan |
|---|---|---|---|---|---|---|---|
| Pronóstico del gemelo | 41 | 21 % | 1.71 | 12.1 % | $576 M | $42 M | $5,693 M |
| Regla HU08 (mín. + 10 %) | 40 | 43 % | 1.01 | 13.0 % | $635 M | $27 M | $5,767 M |
| Consumo del año anterior | 41 | 10 % | 1.58 | 13.2 % | $638 M | $35 M | $5,761 M |
| Pronóstico, unidades con 30 % de colchón | 41 | 5 % | 2.55 | 21.3 % | $1,075 M | $13 M | $6,221 M |

El pronóstico de partida cuesta $4,783 M. Lecturas:
- La negociación corrige parte del error (de 15.4 % a 12.1 %), pero sube el costo 19 %. Casi todo ese aumento es sobreasignación: lo que las unidades piden de colchón.
- La regla de la HU08 se aprueba más rápido porque ya trae 10 % de más.
- El colchón de las unidades es lo que más pesa en el costo.
- Los precios son de referencia (supuesto).

## Lo que falta para la plataforma real

- **Anexos** que citan los requerimientos y no están en el repositorio: `layout_medicamentos_columnas.xlsx`, `perfil_administrador_central_plan.xlsx`, `Cat_Notificaciones.xlsx`, `estados operativos.xlsx` y `layout_descarga_carga_insumos.xlsx`. Hoy el formato de descarga y de carga es propio del prototipo.
- **Material de curación:** el catálogo del gemelo no lo trae; la pestaña existe y queda vacía.
- **Autenticación:** Llave MX (RF_01) y el gestor de usuarios.
- **Notificaciones:** por correo con cron, 3 días hábiles antes de cada periodo (REQ_NOFUN_02).
- **Modelos epidemiológicos:** SIR, SEIR, SIRD y SEIRS del diagrama "Generación de necesidades".
- **Datos reales:** consumos de cada unidad y precios de compra.
