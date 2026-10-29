# Inventario físico con marbetes: conteo, conciliación y ajustes

Pestaña **Marbetes** del CEDIS 3D (`web/index.html`) y capa **Marbetes (inventario físico)**. Archivos: `web/js/marbetes-sim.js` (motor) y `web/js/marbetes-ui.js` (pestaña y capa 3D).

Simula un año de operación del CEDIS ubicación por ubicación (1,366 ubicaciones con clave). El sistema (kárdex) y el anaquel se separan por errores que nadie ve. Las tomas de inventario con marbete los descubren, se concilian y se ajustan con autorización.

## Normativa en la que se basa

No se cuenta con la norma interna del ISSSTE. Se usa como referencia general:

- **Ley General de Contabilidad Gubernamental, art. 27:**
    - el levantamiento físico del inventario es obligatorio;
    - debe estar conciliado con el registro contable;
    - los bienes que se adquieren se incorporan al inventario en 30 días hábiles.

  ([texto](https://www.hcnl.gob.mx/transparencia/contabilidad.php), [aplicación en la APF](https://www.gob.mx/cms/uploads/attachment/file/430077/INTRODUCCION_INVENTARIO_BIENES_MUEBLES_INSTRUMENTALES_2018_pdf.pdf))
- **IMSS, procedimiento 1821-A03-002** ([PDF](https://www.imss.gob.mx/sites/all/statics/pdf/procedimientos/1821-A03-002.pdf)): levantamiento del inventario físico anual, rotativo y selectivo de bienes de consumo. Es el documento público más cercano del sector salud.
    - **Frecuencia:**
        - anual, total, al menos una vez al año;
        - rotativo mensual, que cubre todo en el año e incluye siempre el grupo 040 (estupefacientes y psicotrópicos);
        - selectivo por muestreo al menos cada tres meses, con el 100 % de controlados y los de mayor costo.
    - **Marbetes:** foliados, de cartoncillo, con dos partes separadas por línea perforada. Hay marbetes extraordinarios si una clave está en varios lugares. Se conservan 5 años y su destrucción requiere acta.
    - **Conteos:**
        - el primero registra disponible, suspendido, caduco y roto;
        - el segundo lo hace otra persona;
        - si no coinciden, hay tercer conteo.
    - **Movimientos:** no hay recepción ni surtido durante el levantamiento.
    - **Tolerancias:**
        - diferencias físicas (suma de sobrantes y faltantes) de hasta 0.72 % del inventario; si se pasan, se pide un informe de causas;
        - pendientes de hasta 0.30 %;
        - diferencias contables de hasta 0.80 % del valor.
    - **Controlados:** las diferencias del grupo 040 se aclaran al 100 %.
    - **Responsabilidades:** si no se cumple, hay medidas disciplinarias o las de la Ley General de Responsabilidades Administrativas.
- **Controlados:** el libro de control y el balance que piden el Reglamento de Insumos para la Salud y el Suplemento para establecimientos de la FEUM. Aquí, toda diferencia en controlados lleva acta y se asienta en el libro de control.

**Supuestos propios** (editables o por confirmar con la norma del ISSSTE):
- montos de autorización del ajuste: hasta $1,000 el jefe de almacén, hasta $10,000 el administrador del CEDIS; más, acta administrativa con el Órgano Interno de Control;
- tasas de error, tiempos de conteo (4 minutos por tarima y 2 por anaquel) y 8 almacenistas.

## Cómo funciona

- **Errores ocultos** (tasas por 1,000 movimientos, ajustadas por la disciplina de captura):
    - salida sin registrar;
    - captura en caja y no en pieza;
    - guardado en otra ubicación;
    - lote equivocado;
    - merma sin acta;
    - robo hormiga (más en controlados);
    - entrada capturada dos veces;
    - entrada sin capturar.
- **Estrategias:**
    - solo anual (dos días sin movimientos);
    - anual + selectivo trimestral;
    - anual + rotativo mensual;
    - cíclico ABC + anual: A cada mes, B cada trimestre, C cada semestre y controlados cada semana.
- **Cada toma:**
    - marbete foliado por ubicación;
    - primer conteo, segundo conteo ciego por otro almacenista y tercer conteo si no coinciden;
    - los conteos también se equivocan.
- **Conciliación:**
    - lo explicable (ubicación, lote, unidad de medida) se reclasifica la mayoría de las veces;
    - lo demás se ajusta con el nivel de autorización según el monto;
    - los controlados llevan acta y libro de control.
- **Integridad:**
    - se cuentan por almacenista los faltantes chicos (10 piezas o menos) y las ubicaciones con faltante repetido;
    - si una persona pasa 1.5 veces la mediana, salta una alerta;
    - se puede sembrar un almacenista deshonesto para ver si la alerta lo encuentra.

## Pantalla

- **Pestaña Marbetes:**
    - estrategia, disciplina, almacenista deshonesto y otro año;
    - indicadores del año y cumplimiento de las tolerancias;
    - cada toma con sus folios, terceros conteos, diferencias, aclaradas, ajustes por nivel y actas;
    - las diferencias de mayor valor; al tocar una se abre el **marbete** (folio, ubicación, clave, los tres conteos con quién contó, sistema, conteo final, diferencia, resultado y días sin detectarse) y la cámara va a esa ubicación;
    - causas de los errores, alertas de integridad y comparación de las cuatro estrategias.
- **Capa 3D:** un marbete en cada ubicación. Verde si se contó sin diferencia, azul si se aclaró, ámbar si hubo ajuste, rojo si fue con acta y gris si no se contó en la toma elegida.

## Resultados (disciplina media, un almacenista deshonesto, año 1)

| Estrategia | Exactitud promedio | Días que una diferencia vive sin detectarse | Diferencias físicas en la anual | Horas de conteo al año |
|---|---|---|---|---|
| Solo anual | 69 % | 212 | 1.23 % ✗ | 127 |
| Anual + selectivo trimestral | 74 % | 167 | 1.03 % ✗ | 227 |
| Anual + rotativo mensual | 78 % | 128 | 0.68 % ✓ | 277 |
| Cíclico ABC + anual | 86 % | 73 | 0.46 % ✓ | 886 |

- **Solo la toma anual no alcanza el tope de 0.72 %:** las diferencias se acumulan todo el año.
- **El rotativo mensual** del IMSS cumple con el doble de horas que la anual sola.
- **El cíclico ABC** lleva la exactitud a 86 % y detecta en 73 días, pero cuesta siete veces las horas.
- **El almacenista deshonesto:** con disciplina media la alerta lo encuentra. Con disciplina baja y solo la toma anual, su robo se esconde entre los demás errores.

## Pendiente

- Norma interna de inventarios del ISSSTE: frecuencias, montos de autorización y formatos de acta.
- Ligar los ajustes a la existencia del inventario del CEDIS (`network-sim.js`), al indicador "Exactitud de inventario" de la pestaña Almacén y a la ventana de Integridad del plan.
- Inventario físico en las farmacias de las unidades y en el CENADI.
