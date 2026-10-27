# Especificación Técnica: Estructura de Datos del Gemelo Digital Burocrático

Este documento define la arquitectura de datos, esquemas de entidades, modelos de objetos y estructuras JSON para implementar el **Gemelo Digital de la Burocracia y Procesos de Abasto de Salud**.

Permite transformar los **12 procesos**, los **30 documentos oficiales** y la **matriz de semáforos/SLAs** descritos en [PROCESOS_Y_ALERTAS.md](PROCESOS_Y_ALERTAS.md) en un **sistema computacional ejecutable de eventos discretos, colas de espera y expedientes vivos**.

---

## 1. Arquitectura Conceptual: Las 6 Entidades del Ecosistema

Para modelar computacionalmente una burocracia, se desacopla la información en 6 estructuras de datos interconectadas:

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           EXPEDIENTE MAESTRO VIVO                           │
 │   (Folio único, estado de la red, semáforo global, índice de documentos)    │
 └──────────────────────┬───────────────────────────────┬──────────────────────┘
                        │                               │
        ┌───────────────┴───────────────┐               │
        ▼                               ▼               ▼
 ┌──────────────┐               ┌──────────────┐ ┌──────────────┐
 │ CRONÓMETROS  │               │ DOCUMENTOS   │ │ COMPUERTAS   │
 │ LEGALES (SLA)│               │ OFICIALES    │ │ LÓGICAS      │
 │ (Plazos      │               │ (30 tipos    │ │ (Reglas AND/ │
 │  fatales)    │               │  tipados)    │ │  OR de paso) │
 └──────────────┘               └──────────────┘ └──────────────┘
        │                               │               │
        └───────────────┬───────────────┘               │
                        ▼                               ▼
 ┌─────────────────────────────────────────────┐ ┌──────────────┐
 │          RED DE ESCRITORIOS Y VENTANILLAS   │ │ AUDITORÍA    │
 │ (Capacidad humana, buffers FIFO y latencia) │ │ INMUTABLE    │
 └─────────────────────────────────────────────┘ │ (Log OIC/ASF)│
                                                 └──────────────┘
```

---

## 2. Esquemas de Datos Principales (JSON Schemas y Tipos)

### Entidad 1: `ExpedienteMaestro` (The Living Dossier)
El contenedor raíz de cada ciclo de abasto (desde la necesidad presupuestal hasta la destrucción o pago final).

```json
{
  "$id": "https://salud.gob.mx/schemas/expediente-maestro.json",
  "type": "object",
  "properties": {
    "dossier_id": {
      "type": "string",
      "format": "uuid",
      "description": "Identificador único inmutable del expediente."
    },
    "folio_institucional": {
      "type": "string",
      "example": "EXP-2026-IMSS-HGO-00451",
      "description": "Folio legible para humanos y auditoría oficial."
    },
    "institucion": {
      "type": "string",
      "enum": ["IMSS", "ISSSTE", "IMSS_BIENESTAR", "SECRETARIA_SALUD"]
    },
    "clave_cnis": {
      "type": "string",
      "pattern": "^[0-9]{3}\\.[0-9]{3}\\.[0-9]{4}\\.[0-9]{2}$",
      "example": "010.000.0104.00"
    },
    "fase_actual": {
      "type": "integer",
      "minimum": 1,
      "maximum": 12,
      "description": "Número del proceso activo según PROCESOS_Y_ALERTAS.md"
    },
    "estado_flujo": {
      "type": "string",
      "enum": [
        "EN_PLANIFICACION",
        "CONTRATO_FORMALIZADO",
        "ORDEN_EMITIDA",
        "EN_TRANSITO_LABORATORIO",
        "EN_ANDEN_CEDIS",
        "EN_CUARENTENA_ANALITICA",
        "LIBERADO_EN_CEDIS",
        "EN_DISTRIBUCION_HOSPITAL",
        "EN_FARMACIA_HOSPITAL",
        "DISPENSADO_PACIENTE",
        "EN_PROCESO_CANJE",
        "EN_CONCILIACION_PAGO",
        "EN_RESCISION_ADMINISTRATIVA",
        "FINIQUITADO_CERRADO"
      ]
    },
    "semaforo_global": {
      "type": "string",
      "enum": ["VERDE", "AMARILLO", "NARANJA", "ROJO"],
      "description": "Semáforo consolidado más crítico de la entidad."
    },
    "escritorio_actual_id": {
      "type": "string",
      "format": "uuid",
      "description": "ID de la ventanilla o funcionario donde reposa el trámite."
    },
    "documentos_adjuntos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "tipo_documento_id": { "type": "integer", "minimum": 1, "maximum": 30 },
          "documento_id": { "type": "string", "format": "uuid" },
          "estado_validacion": { "type": "string", "enum": ["BORRADOR", "FIRMADO", "RECHAZADO"] }
        },
        "required": ["tipo_documento_id", "documento_id", "estado_validacion"]
      }
    },
    "cronometros_asociados": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" }
    },
    "partidas_detalle": {
      "type": "array",
      "description": "Desglose por clave CNIS para contratos y órdenes multipartida (multiclave).",
      "items": {
        "type": "object",
        "properties": {
          "partida_numero": { "type": "integer", "example": 1 },
          "clave_cnis": { "type": "string", "example": "010.000.0104.00" },
          "descripcion": { "type": "string", "example": "Paracetamol 500mg tabletas" },
          "cantidad_solicitada": { "type": "integer", "example": 10000 },
          "cantidad_recibida_aprobada": { "type": "integer", "default": 0 },
          "cantidad_rechazada": { "type": "integer", "default": 0 },
          "cantidad_pendiente_saldo": { "type": "integer" },
          "precio_unitario": { "type": "number", "example": 8.50 },
          "dictamen_anden": {
            "type": "string",
            "enum": ["PENDIENTE", "ACEPTADA_TOTAL", "ACEPTADA_CON_CANJE", "RECHAZADA_TEMPERATURA", "RECHAZADA_FEUM", "RECHAZADA_CADUCIDAD", "ENTREGA_PARCIAL"]
          },
          "motivo_rechazo": { "type": "string", "nullable": true },
          "dias_atraso_partida": { "type": "integer", "default": 0 },
          "pena_acumulada_partida": { "type": "number", "default": 0.00 }
        },
        "required": ["partida_numero", "clave_cnis", "cantidad_solicitada", "precio_unitario", "dictamen_anden"]
      }
    }
  },
  "required": [
    "dossier_id",
    "folio_institucional",
    "institucion",
    "clave_cnis",
    "fase_actual",
    "estado_flujo",
    "semaforo_global",
    "escritorio_actual_id"
  ]
}
```

---

### Entidad 2: `NodoEscritorio` (Ventanilla / Human Capacity)
Modela los cuellos de botella de la fuerza laboral administrativa y las colas de espera.

```json
{
  "$id": "https://salud.gob.mx/schemas/nodo-escritorio.json",
  "type": "object",
  "properties": {
    "escritorio_id": { "type": "string", "format": "uuid" },
    "codigo": { "type": "string", "example": "VENTANILLA_ANDEN_CEDIS_CALIDAD" },
    "nombre": { "type": "string", "example": "Verificación Documental y Analítica de Andén" },
    "area_responsable": {
      "type": "string",
      "enum": ["ADQUISICIONES", "CONTROL_CALIDAD", "ALMACEN_CENTRAL", "FARMACIA_HOSPITAL", "FINANZAS", "JURIDICO"]
    },
    "capacidad_nominal_dia": {
      "type": "integer",
      "description": "Número máximo de trámites o remisiones que puede procesar por turno.",
      "example": 25
    },
    "tiempo_medio_atencion_segundos": {
      "type": "integer",
      "description": "Tiempo promedio que un funcionario tarda en procesar un trámite.",
      "example": 1200
    },
    "horario_operacion": {
      "type": "object",
      "properties": {
        "dias_habiles_solo": { "type": "boolean", "default": true },
        "hora_apertura": { "type": "string", "example": "08:00" },
        "hora_cierre": { "type": "string", "example": "16:00" },
        "turnos_activos": { "type": "integer", "default": 1 }
      }
    },
    "cola_pendientes": {
      "type": "array",
      "description": "Lista ordenada (FIFO con prioridad) de expedientes esperando turno.",
      "items": {
        "type": "object",
        "properties": {
          "dossier_id": { "type": "string", "format": "uuid" },
          "prioridad": { "type": "integer", "minimum": 1, "maximum": 5, "description": "1: Vital/Urgente, 5: Ordinario" },
          "t_ingreso_cola": { "type": "string", "format": "date-time" }
        }
      }
    },
    "tasa_error_humano": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Probabilidad estocástica de captura errónea o rechazo injustificado.",
      "example": 0.03
    }
  },
  "required": ["escritorio_id", "codigo", "capacidad_nominal_dia", "tiempo_medio_atencion_segundos"]
}
```

---

### Entidad 3: `CronometroLegal` (SLA Ticking Clock)
El motor de términos fatales que genera sanciones y alertas automáticas.

```json
{
  "$id": "https://salud.gob.mx/schemas/cronometro-legal.json",
  "type": "object",
  "properties": {
    "cronometro_id": { "type": "string", "format": "uuid" },
    "dossier_id": { "type": "string", "format": "uuid" },
    "tipo_termino": {
      "type": "string",
      "enum": [
        "ACUSE_NOTIFICACION_OS",       // 24 horas
        "PLAZO_ENTREGA_ORDEN",         // 15 días naturales
        "LIBERACION_CUARENTENA",       // 48 horas
        "CAPTURA_KARDEX_HOSPITAL",     // 4 horas
        "ALERTA_CANJE_CADUCIDAD",      // 60 días antes de vencer
        "EJECUCION_CANJE_FABRICANTE",  // 15 días naturales
        "AUDIENCIA_RESCISION",         // 5 días hábiles
        "RESOLUCION_RESCISION",        // 15 días hábiles
        "PAGO_FACTURA_FINANZAS"        // 20 días naturales
      ]
    },
    "computo_dias": {
      "type": "string",
      "enum": ["NATURALES", "HABILES"],
      "default": "NATURALES"
    },
    "t_inicio": { "type": "string", "format": "date-time" },
    "t_limite_fatal": { "type": "string", "format": "date-time" },
    "segundos_totales": { "type": "integer" },
    "segundos_transcurridos": { "type": "integer", "default": 0 },
    "segundos_restantes": { "type": "integer" },
    "estado_cronometro": {
      "type": "string",
      "enum": ["CORRIENDO", "PAUSADO_JUSTIFICADO", "CONCLUIDO_EN_TIEMPO", "VENCIDO_EN_MORA"]
    },
    "semaforo_sla": {
      "type": "string",
      "enum": ["VERDE", "AMARILLO", "NARANJA", "ROJO"]
    },
    "accion_al_vencer": {
      "type": "string",
      "enum": [
        "CALCULAR_PENA_DIARIA_2_5",
        "DISPARAR_RESCISION_ART_54",
        "APLICAR_DEDUCCION_DIRECTA",
        "NOTIFICAR_AUDITORIA_OIC",
        "RECHAZO_AUTOMATICO_SISTEMA"
      ]
    }
  },
  "required": [
    "cronometro_id",
    "dossier_id",
    "tipo_termino",
    "computo_dias",
    "t_inicio",
    "t_limite_fatal",
    "estado_cronometro",
    "semaforo_sla"
  ]
}
```

---

### Entidad 4: `DocumentoOficial` (Tipado Fuerte para los 30 Documentos)
Ejemplo de estructura para los documentos críticos de andén y calidad (Documentos 10, 11 y 12):

```json
{
  "$id": "https://salud.gob.mx/schemas/documento-calidad-anden.json",
  "type": "object",
  "properties": {
    "documento_id": { "type": "string", "format": "uuid" },
    "tipo_documento_id": { "type": "integer", "enum": [9, 10, 11, 12, 13, 14] },
    "folio": { "type": "string", "example": "CERT-FEUM-2026-8801" },
    "numero_lote": { "type": "string", "example": "LT-2026-X99" },
    "fecha_fabricacion": { "type": "string", "format": "date" },
    "fecha_caducidad": { "type": "string", "format": "date" },
    "meses_vida_util_restante": { "type": "integer", "example": 22 },
    
    "atributos_sanitarios": {
      "type": "object",
      "properties": {
        "cumple_feum": { "type": "boolean" },
        "nombre_responsable_sanitario": { "type": "string" },
        "numero_cedula_profesional": { "type": "string" },
        "inspeccion_red_fria": {
          "type": "object",
          "properties": {
            "requiere_refrigeracion": { "type": "boolean" },
            "temperatura_promedio_celsius": { "type": "number" },
            "temperatura_minima_celsius": { "type": "number" },
            "temperatura_maxima_celsius": { "type": "number" },
            "excursion_termica_detectada": { "type": "boolean" }
          }
        },
        "carta_canje_adjunta": {
          "type": "object",
          "properties": {
            "presenta_carta_100_porciento": { "type": "boolean" },
            "plazo_canje_dias": { "type": "integer", "default": 15 },
            "vigencia_ampliada_comprometida_meses": { "type": "integer", "default": 24 }
          }
        }
      },
      "required": ["cumple_feum", "nombre_responsable_sanitario"]
    },
    
    "dictamen_andén": {
      "type": "string",
      "enum": ["PENDIENTE", "ACEPTADO_EBA", "RECHAZADO_TEMPERATURA", "RECHAZADO_CADUCIDAD", "RECHAZADO_DOCUMENTAL"]
    },
    "firma_digital": {
      "type": "object",
      "properties": {
        "firmante": { "type": "string" },
        "sello_digital_sat_o_efirma": { "type": "string" },
        "timestamp_firma": { "type": "string", "format": "date-time" }
      }
    }
  },
  "required": ["documento_id", "tipo_documento_id", "folio", "numero_lote", "fecha_caducidad", "dictamen_andén"]
}
```

---

### Entidad 5: `CompuertaValidacion` (Decision Logic / Gates)
Define las reglas booleanas requeridas para que un trámite pueda transitar al siguiente nodo.

```json
{
  "$id": "https://salud.gob.mx/schemas/compuerta-validacion.json",
  "type": "object",
  "properties": {
    "compuerta_id": { "type": "string", "format": "uuid" },
    "nombre_hito": { "type": "string", "example": "LIBERACION_ANDEN_PARA_EBA" },
    "expresion_booleana": {
      "type": "string",
      "example": "(DOC_09_PRESENTE == true) && (DOC_10_FEUM == true) && (TEMP_MIN >= 2.0 && TEMP_MAX <= 8.0) && (MESES_CADUCIDAD >= 18 || (MESES_CADUCIDAD >= 12 && DOC_12_CARTA_CANJE == true))"
    },
    "resultado_evaluacion": { "type": "boolean" },
    "bloqueos_detectados": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "codigo_error": { "type": "string", "example": "ERR_RED_FRIA_EXCURSION" },
          "mensaje": { "type": "string", "example": "Temperatura máxima registrada fue 8.7°C. Supera el límite de 8.0°C." },
          "accion_bloqueante": { "type": "string", "example": "EMITIR_DOC_14_ACTA_RECHAZO" }
        }
      }
    }
  },
  "required": ["compuerta_id", "nombre_hito", "expresion_booleana", "resultado_evaluacion"]
}
```

---

### Entidad 6: `RegistroSancionMora` (Art. 53, 53 Bis y 54)
Almacena el estado de penalización financiera de cada contrato y orden.

```json
{
  "$id": "https://salud.gob.mx/schemas/registro-sancion-mora.json",
  "type": "object",
  "properties": {
    "sancion_id": { "type": "string", "format": "uuid" },
    "dossier_id": { "type": "string", "format": "uuid" },
    "contrato_id": { "type": "string", "format": "uuid" },
    "monto_maximo_contrato": { "type": "number", "example": 15000000.00 },
    "fianza_limite_10_porciento": { "type": "number", "example": 1500000.00 },
    
    "calculo_mora_actual": {
      "type": "object",
      "properties": {
        "dias_naturales_atraso": { "type": "integer", "example": 6 },
        "piezas_no_entregadas": { "type": "integer", "example": 20000 },
        "precio_unitario": { "type": "number", "example": 12.50 },
        "importe_bienes_atrasados": { "type": "number", "example": 250000.00 },
        "tasa_diaria_aplicada": { "type": "number", "example": 0.025 },
        "pena_diaria_calculada": { "type": "number", "example": 6250.00 },
        "pena_acumulada_orden": { "type": "number", "example": 37500.00 }
      }
    },
    
    "acumulado_global_contrato": { "type": "number", "example": 1480000.00 },
    "porcentaje_fianza_consumido": { "type": "number", "example": 98.67 },
    "umbral_rescision_alcanzado": { "type": "boolean", "example": false },
    "estado_cobro": {
      "type": "string",
      "enum": ["PROYECTADA", "NOTIFICADA_PROVEEDOR", "CONCILIADA_NOTA_CREDITO", "DEDUCIDA_EN_TESORERIA", "EN_DISPUTA_LITIGIO"]
    }
  },
  "required": [
    "sancion_id",
    "dossier_id",
    "contrato_id",
    "fianza_limite_10_porciento",
    "acumulado_global_contrato",
    "umbral_rescision_alcanzado"
  ]
}
```

---

## 3. Dinámica de Colas y Eventos en el Simulador (Event Loop)

Para que el gemelo digital procese estos datos en el tiempo `t`, el simulador gestiona una **Cola de Prioridad de Eventos Discretos (`EventQueue`)**:

```
 [ Evento t=10.0 ] ──► Camión arriba a rampa de andén.
 [ Evento t=10.2 ] ──► Verificador extrae data-logger y certificado FEUM.
 [ Evento t=10.3 ] ──► Evaluación de Compuerta: Red Fría Aprobada (4.2°C).
 [ Evento t=10.4 ] ──► Emisión de Documento 13: EBA (Alta en sistema).
 [ Evento t=10.5 ] ──► Ingreso a Cola de Escritorio de Almacén Hospitalario.
```

### Reglas de Transición de Semáforos en Datos:

$$\text{Semáforo Global} = \max\Big(\text{Semáforo}_{\text{OS}}, \text{Semáforo}_{\text{Frío}}, \text{Semáforo}_{\text{Kárdex}}, \text{Semáforo}_{\text{Fianza}}\Big)$$

Donde el orden de severidad es:
$$\text{VERDE} (0) < \text{AMARILLO} (1) < \text{NARANJA} (2) < \text{ROJO} (3)$$

*   Si cualquiera de los 4 componentes cae en **ROJO (3)**, el expediente completo se tiñe de rojo en la Torre de Control y activa el protocolo de escalamiento coactivo.

---

## 4. Mapeo e Interacción con el Repositorio

| Entidad de Datos | Correspondencia en la Documentación | Correspondencia en el Código |
|---|---|---|
| **`ExpedienteMaestro`** | [PROCESOS_Y_ALERTAS.md](PROCESOS_Y_ALERTAS.md) | Contenedor central de la red acoplada en `network-sim.js` |
| **`NodoEscritorio`** | Cuellos de Botella 1 al 12 en [PROCESOS_Y_ALERTAS.md](PROCESOS_Y_ALERTAS.md) | Parámetros de retraso y capacidad en `sim.js` y `ops.js` |
| **`CronometroLegal`** | Matriz de Semáforos y SLAs en [PROCESOS_Y_ALERTAS.md](PROCESOS_Y_ALERTAS.md) | Atributo `actualizarTick()` en `CONTRATOS.md` y `supply.js` |
| **`DocumentoOficial`** | Catálogo de los 30 Documentos en [PROCESOS_Y_ALERTAS.md](PROCESOS_Y_ALERTAS.md) | Esquemas JSON tipo FHIR en `web/docs/` |
| **`CompuertaValidacion`**| Filtros de Andén en [CONTRATOS.md](CONTRATOS.md) | Clase `RecepcionAnden.inspeccionar()` |
| **`RegistroSancionMora`**| Artículos 53, 53 Bis y 54 en [CONTRATOS.md](CONTRATOS.md) | Worker nocturno `proc_calculo_nocturno_penas` |
