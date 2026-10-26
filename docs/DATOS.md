# Datos: fuentes, supuestos y contrato

## Fuentes reales

| Dato | Fuente | Archivo |
|---|---|---|
| 60 unidades IMSS e ISSSTE de Hidalgo: CLUES, tipo, municipio, domicilio, coordenadas | Catálogo de Establecimientos de Salud (CLUES), DGIS, corte de agosto 2026 | `investigacion/unidades_imss_issste_hidalgo.csv` → `web/assets/unidades_hidalgo.json` |
| Contorno del estado de Hidalgo | Geometría simplificada para el mapa | `investigacion/_hidalgo_geo.json` |
| 60 claves de medicamento: clave, descripción, presentación y grupo | Compendio Nacional de Insumos para la Salud (CNIS) del Consejo de Salubridad General; Cuadro Básico y Catálogo de Medicamentos | `web/assets/medicamentos.json` |

El catálogo CLUES completo (`ESTABLECIMIENTO_SALUD_202608.xlsx`, 26 MB) no se incluye en el repositorio. Se
descarga del portal de datos abiertos de la DGIS.

## Supuestos (simulados)

Todo lo operativo es **simulado**. Sirve para demostrar el método, no describe la operación real del IMSS o del
ISSSTE.

**CEDIS y rutas**
- La ubicación del CEDIS (20.045, −98.745) es un supuesto.
- Las 9 rutas, la frecuencia de entrega y los tiempos de traslado se derivan de la distancia.
- Costos de distribución: $9.5/km, $130/h de chofer, $350 por salida, 55 km/h, 20 min por parada,
  8,000 L por camioneta y jornada de 10 h.

**Clasificación y demanda de las claves**
- Cada clave tiene una clasificación VEN (Vital, Esencial, No esencial), alternativas terapéuticas y marcas
  de red fría y de controlado.
- La demanda tiene un peso relativo de prescripción y una diferencia entre lo real y lo planeado.
- La temporada respiratoria afecta a las claves marcadas.

**Inventario y pedidos**
- Lotes: cambian cada 14 días; la caducidad va de 14 a 30 meses, y el 12 % de los lotes llega con caducidad
  corta.
- Proveedor: entrega de 10 a 21 días; el 14 % de los pedidos llega con retraso y el 10 % llega incompleto.
- Escenario de contingencia: 6 claves sin existencia y 4 con existencia parcial en el CEDIS, más un brote
  respiratorio.
- Pedido extraordinario: la validación tarda de 15 min a 2 h el 85 % de las veces y la autorización de 25 min a
  3.7 h el 82 % de las veces.

**Pacientes y entregas**
- Los domicilios son puntos aleatorios en un radio de 5 km (urbano) o 9 km (rural) alrededor de la unidad.
- Perfil del paciente: edad, movilidad y preferencia de entrega.
- Sin entrega a domicilio, el paciente regresa a la unidad en un plazo de 0.3 a 5 días; del 12 % al 22 % no
  regresa.
- Moto de reparto: $3.2/km, $95/h y $60 por salida.

## Contrato de datos

`web/docs/pedido-extraordinario.schema.json` es un JSON Schema del **pedido extraordinario** con la estructura del
recurso **FHIR R4 SupplyRequest**. Agrega:
- campos de la operación mexicana: CLUES, clave CNIS, VEN, existencia, consumo, cobertura y existencia proyectada;
- la **bitácora del flujo**: propuesto, validado, autorizado, programado y entregado, con rol y hora;
- **indicadores:** tiempo de ciclo, cumplimiento de plazos y hora estimada de agotamiento.

La vista de la unidad descarga sus pedidos en este formato, en la pestaña Pedidos con el botón *Descargar JSON*.

Los domicilios de pacientes, en un sistema real, saldrían del expediente con consentimiento del paciente. El QR
de entrega incluye folio, CLUES, paciente y claves; en producción iría firmado digitalmente.

---
© 2026 Gersain Barron · Licencia MIT
