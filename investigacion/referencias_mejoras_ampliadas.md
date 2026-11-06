# Qué más se puede poner en Referencias · investigación ampliada

5 nov 2026. Revisión de cómo gestionan la referencia otros sistemas (NHS de Inglaterra y Escocia, Canadá, Chile, España, Uruguay, Costa Rica, EE. UU.) y del contexto 2026 en México. Cada idea trae su evidencia y cómo se modelaría en la simulación actual.

Etiquetas: **[DATO]** medido y publicado · **[PROPUESTA]** cómo meterlo al gemelo.

---

## A. Antes de referir: que llegue sólo lo que tiene que llegar

### 1. Interconsulta electrónica (eConsult / Advice & Guidance)
- El médico familiar le pregunta al especialista por escrito antes de referir, o en lugar de referir.
- **[DATO]** Revisión sistemática: respuesta del especialista entre 4.6 horas y 3.9 días, 12 a 84 % de referencias evitadas y 78 a 93 % de satisfacción (Liddy et al., Fam Pract 2016).
- **[DATO]** Champlain BASE (Ontario): se evitó la visita presencial en 35 % (urología), 44 % (oftalmología) y 64 % (ortopedia) de los casos.
- **[DATO]** Ensayo aleatorizado en Ontario: menos referencias en el grupo con eConsult (RR 0.80).
- **[DATO]** Riesgo: el colegio de médicos generales británico (RCGP) advierte que se usa para rechazar referencias; las rechazadas subieron 87 % entre feb 2020 y nov 2021, y el paciente se queda en primer nivel.
- **[PROPUESTA]** Nuevo desvío `INTERCONSULTA` después de la solicitud: el especialista responde en 1 a 4 días; un porcentaje (por especialidad, 35-64 %) se resuelve en la UMF sin traslado; el resto sigue como referencia con estudios previos ya hechos (menos devoluciones). Indicadores: referencias evitadas, días y traslados ahorrados, lista de espera evitada.

### 2. Prioridad clínica: urgente, preferente, ordinaria
- **[DATO]** Navarra: prioridad 1 (preferente) 14 días máximo; prioridad 2, 30 días desde la solicitud.
- **[DATO]** Costa Rica (reglamento de listas de espera): P0 < 24 h, P1 ≤ 8 días, P2 ≤ 30 días.
- **[DATO]** Uruguay (decreto 2026): plazos máximos por tipo de consulta derivada, hasta 90 días.
- **[DATO]** Madrid (H. Infanta Leonor): 16 % de las derivaciones a medicina interna eran preferentes.
- **[DATO]** NHS: «regla de las dos semanas» para sospecha de cáncer.
- **[PROPUESTA]** Cada referencia nace con prioridad (≈ 5 % urgente, 15 % preferente, 80 % ordinaria, distinta por especialidad). Las agendas reservan cupo por prioridad. Semáforo y plazo según prioridad (la norma de 15 días se vuelve el plazo de la ordinaria o de la preferente, a definir). Indicador: cumplimiento por prioridad; ruta rápida de oncología.

### 3. Pertinencia y retroalimentación al que refiere
- **[DATO]** Revisión Cochrane (Akbari 2008): funcionan las guías locales hechas con los especialistas, hojas de referencia estructuradas, educación dirigida por especialistas, una segunda opinión interna antes de referir y **cupos dedicados en segundo nivel para cada unidad que refiere**.
- **[DATO]** Madrid: 16.4 % de los médicos generaba 42.8 % de las referencias (gran variabilidad).
- **[DATO]** BMJ 1994: 58 de 168 referencias se consideraron evitables.
- **[PROPUESTA]** Tablero de pertinencia por unidad que refiere: tasa de referencia por 1,000 derechohabientes, % rechazadas por pertinencia, % que regresan sin hallazgo. Escenario «hoja estructurada + segunda opinión»: −20 a 30 % de referencias evitables y menos devoluciones por formato incompleto.

---

## B. La oferta: cómo se reparte la agenda

### 4. Entrada única y lista común por especialidad (single-entry model)
- **[DATO]** Revisión sistemática (CMAJ Open 2021, 10 estudios): todos redujeron el tiempo de la referencia a la primera consulta; la mayor reducción fue en cirugía (57 %) y medicina interna urgente (40 %).
- **[DATO]** Toronto (dolor crónico, 7 hospitales): espera de 299 a 176 días en 6 años.
- **[DATO]** Calgary (gastroenterología): una sola fila reduce la variabilidad y el promedio de espera; da visibilidad de la demanda total y de los cuellos de botella.
- **[PROPUESTA]** Escenario «lista regional única»: en vez de un destino fijo, la referencia va a la receptora de su región con el primer lugar libre de esa especialidad (con límite de distancia). Es el experimento ideal para el gemelo: se ve en el mapa cómo se reparte la carga.

### 5. Cupos dedicados por unidad que refiere
- **[DATO]** Cochrane (punto 3): cupos en segundo nivel proporcionales a cada unidad de primer nivel.
- **[PROPUESTA]** Escenario: parte del cupo de cada receptora se reparte por unidad emisora; se mide si baja la variación de espera entre unidades (equidad entre pueblos lejanos y cabeceras).

### 6. Sobrecupo según inasistencia
- **[DATO]** Chile (microsimulación, congreso UFRO 2023): el sobreagendamiento contiene la lista de espera pero no la cierra; la priorización con telemedicina asincrónica sí puede cerrar la brecha de ingreso al segundo nivel.
- **[PROPUESTA]** Escenario «sobrecupo = inasistencia esperada»: la agenda ofrece cupo × (1 + tasa de no acudió).

---

## C. El paciente en espera

### 7. Recordatorios por mensaje o llamada
- **[DATO]** Metaanálisis (10 ensayos, 8,236 participantes): los recordatorios mejoran la asistencia (RR 1.11).
- **[DATO]** Clínica universitaria en EE. UU.: no acudió 23.1 % sin recordatorio, 17.3 % con mensaje automático, 13.6 % con llamada de una persona.
- **[DATO]** Dublín: el mayor valor del SMS fue facilitar la cancelación para reusar el lugar; inasistencia de 22.2 % a 13.9 %.
- **[PROPUESTA]** Escenario: baja la probabilidad de «no acudió» (≈ −25 %) y una parte avisa con tiempo, liberando el cupo para otro paciente.

### 8. Validación de la lista de espera
- **[DATO]** NHS Highland: 81 % de respuesta; 9 % (hasta 15 % en algunas especialidades) pidió salir de la lista; ≈ £1 millón en citas evitadas.
- **[DATO]** Sussex: 13 % de los pacientes salió de la lista en pocas semanas.
- **[DATO]** Precaución: en Inglaterra el parlamento cuestiona las bajas no reportadas de la lista.
- **[PROPUESTA]** Nuevo cierre «Ya no la necesita» y una campaña periódica de validación (mensaje a quien lleva > 12 semanas): saca a quien ya se atendió en otro lado o mejoró, y además **convierte «sin rastro» en un estado conocido**. Ataca directo el problema que planteaste.

### 9. Acompañamiento de personas en lista de espera
- **[DATO]** Chile (BID 2023): modelo de gestión del cuidado y acompañamiento de personas en lista de espera no GES; los pilotos señalan como nudos críticos la actualización y la priorización de la lista.
- **[PROPUESTA]** Rol de gestor(a) de casos para crónicas y quienes dan vueltas; indicador de contacto con el paciente.

---

## D. Cerrar el ciclo

### 10. Indicador «cerrar el ciclo de la referencia»
- **[DATO]** Medida CMS50 (EE. UU., vigente 2026): % de pacientes referidos cuyo médico recibe el informe del especialista.
- **[DATO]** De 103,737 intentos de agendar referencias, sólo 34.8 % terminó en una cita completa documentada (Patel et al., 2018).
- **[DATO]** Un centro de salud en EE. UU. (Azara 2026) encontró casi la mitad de sus referencias abiertas antes de crear una lista de seguimiento.
- **[PROPUESTA]** Indicador explícito «ciclo cerrado en ≤ 30 días tras la atención» y la **bandeja de trabajo** (lista de pendientes por llamar) del área de referencia.

---

## E. Transparencia y garantías

### 11. Tiempos de espera públicos y garantías de oportunidad
- **[DATO]** Chile: Repositorio Nacional de Listas de Espera; el Ministerio informa al Congreso cada trimestre; la promesa es al tiempo de espera, no al lugar en la fila.
- **[DATO]** Chile: las garantías GES se cumplen en más de 90 %; fuera de GES, 41 % espera más de un año.
- **[DATO]** Colombia (Res. 1552 de 2013): las instituciones publican cada mes sus tiempos de espera por especialidad.
- **[PROPUESTA]** Página pública de tiempos de espera por especialidad y unidad; prueba de «garantía» para algunos diagnósticos (cáncer, embarazo de alto riesgo) con plazo obligatorio.

---

## F. Contexto México 2026 (para escenarios realistas)

- **[DATO]** Expediente y receta electrónica: el ISSSTE tiene 660 unidades de primer nivel y 144 hospitales digitalizados; las 34 restantes deben entrar antes de diciembre de 2026.
- **[DATO]** El IMSS avanza en la programación digital de la consulta de especialidad para evitar el cierre de agendas.
- **[DATO]** Telemedicina ISSSTE: de 239 unidades (dic 2025) a 859 (may 2026); su efecto depende de conectividad, agenda, capacitación y continuidad del seguimiento.
- **[PROPUESTA]** Escenario «registro digital»: sube la probabilidad de que cada paso quede registrado → baja «sin rastro». Escenario «agenda digital sin cierre de año»: se quita la temporada de octubre a diciembre. Telemedicina como desvío real (quedó pendiente de la primera investigación).

---

## G. Lo que lo junta todo: un laboratorio de escenarios

Todas las propuestas se vuelven palancas de un solo panel «¿Qué pasaría si…?», corriendo dos simulaciones con la misma semilla (base contra escenario) y comparando:
- % atendidas en el plazo, espera mediana, receptoras saturadas;
- sin rastro, sin cierre, quemadas, no acudió;
- traslados evitados y referencias evitadas.

Orden sugerido:
1. Laboratorio de escenarios (base para todo lo demás).
2. Prioridad clínica (cambia el semáforo y la agenda).
3. Interconsulta electrónica y telemedicina (menos referencias y traslados).
4. Validación de lista y bandeja de trabajo (atacan «sin rastro»).
5. Recordatorios, lista regional única, cupos por unidad y sobrecupo (palancas de agenda).
6. Tablero de pertinencia y página pública de tiempos.

---

## Fuentes

- Liddy C. et al. Electronic consultation systems: systematic review. Fam Pract 2016: https://pubmed.ncbi.nlm.nih.gov/27075028/
- eConsult y tasas de referencia (ensayo, Trials 2019): https://trialsjournal.biomedcentral.com/track/pdf/10.1186/s13063-019-3393-5
- eConsult urología (CUAJ): https://pmc.ncbi.nlm.nih.gov/articles/PMC5542837
- eConsult oftalmología (Clin Ophthalmol 2025): https://www.dovepress.com/ontario-primary-care-practitioners-and-access-to-ophthalmologists-thro-peer-reviewed-fulltext-article-OPTH
- eConsult ortopedia (Can J Surg): https://www.canjsurg.ca/content/cjs/65/5/E643.full.pdf
- RCGP, Advice and guidance: https://rcgp.org.uk/representing-you/policy-areas/advice-and-guidance
- NHS e-RS, beneficios de Advice and Guidance: https://nhsd-proxy.openprescribing.net/services/e-referral-service/document-library/advice-and-guidance-toolkit/benefits-of-using-advice-and-guidance
- Single-entry models, revisión sistemática (CMAJ Open 2021): https://cmajopen.ca/content/9/2/E413.short
- Single-entry dolor crónico Toronto (Can J Pain 2024): https://experts.mcmaster.ca/scholarly-works/3395939
- Central triage gastroenterología Calgary: https://pmc.ncbi.nlm.nih.gov/articles/PMC3816943
- Cochrane Akbari 2008 (resumen SUPPORT): https://supportsummaries.epistemonikos.org/support-summaries/show/do-educational,-organisational-or-financial-interventions-improve-referrals-from-primary-care-to-secondary-carea
- Avoidable referrals (BMJ 1994): https://pmc.ncbi.nlm.nih.gov/articles/PMC2541394
- Derivación preferente Madrid (SEMI): https://revclinesp.es/es-congresos-xxxvi-congreso-nacional-sociedad-espanola-21-sesion-gestion-1793-cantidad-calidad-y-seguridad-en-19438-pdf
- Garantías de espera Navarra: https://parlamentodenavarra.es/es/tramite-documento/1154620
- Priorización Costa Rica: https://semanariouniversidad.com/pais/ministerio-de-salud-emite-reglamento-que-establece-criterios-de-priorizacion-para-gestionar-listas-de-espera/
- Tiempos máximos Uruguay 2026: https://www.impo.com.uy/bases/decretos/44-2026
- Metaanálisis de recordatorios (J Hosp Manag Health Policy): https://jhmhp.amegroups.org/article/view/10215/html
- No-show por tipo de recordatorio: https://lobbie.com/institute/actions-to-prevent-no-shows
- SMS y cancelaciones (Ir J Med Sci 2017): https://link.springer.com/10.1007/s11845-017-1710-0
- Validación de lista NHS Highland: https://nhshighland.scot.nhs.uk/news/2024/12/waiting-list-validation-shows-great-results
- Validación de lista Sussex: https://www.netcall.com/news/waiting-list-validation/
- Bajas no reportadas (Office for Statistics Regulation 2026): https://osr.statisticsauthority.gov.uk/wp-content/uploads/2026/07/Annex-Waiting-Lists-and-Unreported-Removals-2.pdf
- CMS50 Closing the referral loop: https://ecqi.healthit.gov/ecqm/ec/2022/cms0050v10
- Referral management dashboard (Azara 2026): https://www.azarahealthcare.com/hubfs/2026%20User%20Conference/Breakouts/KG_Referral%20Management.pdf
- Listas de espera Chile (UC 2017): https://politicaspublicas.uc.cl/web/content/uploads/2017/12/propuestas_listas_espera-3.pdf
- Plan de tiempos de espera Chile (MINSAL): https://www.minsal.cl/?p=33902
- GES vs no GES (tesis): https://core.ac.uk/download/288918075.pdf
- Acompañamiento en lista de espera Chile (BID 2023): https://publications.iadb.org/publications/spanish/document/Estudio-exploratorio-de-cuantificacion-de-resultados-del-modelo-de-gestion-del-cuidado-y-acompanamiento-de-personas-en-lista-de-espera-no-GES-en-el-sistema-publico-de-salud-de-Chile.pdf
- Microsimulación de políticas de lista de espera (UFRO 2023): https://congreso2023.ufro.cl/images/presentaciones/e-poster/jueves/Pantalla6/09-525-EVALUACION-CON-MICROSIMULACION-DE-POLITICAS-DE-GESTION.pdf
- Colombia Res. 1552 de 2013: https://normograma.supersalud.gov.co/compilacion/docs/resolucion_minsaludps_1552_2013.htm
- Digitalización ISSSTE/IMSS (oct 2026): https://www.tiempo.com.mx/local/expediente-medico-digital-listo-en-febrero-2027-eduardo-clark/
- IMSS programación digital de especialidad: https://www.imss.gob.mx/sites/all/statics/i2f_news/IMSS.%20Boletin.%20442.docx
- Telemedicina ISSSTE 2026: https://consultorsalud.com.mx/?p=315454
