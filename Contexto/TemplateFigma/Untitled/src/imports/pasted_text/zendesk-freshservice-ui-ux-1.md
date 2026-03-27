Sí. Hice la investigación pública y te complemento el PRD con una capa **mucho más técnica de UX/UI**.

Antes de entrar al detalle, una precisión importante: **sí se pueden identificar muchísimos patrones, componentes, comportamientos y design systems públicos**, pero **no se puede verificar con certeza todo el stack privado exacto de producción** de cada app solo desde internet. Lo que sí está claramente documentado es que **Zendesk usa su design system público Garden**, con librerías React, theming, iconografía SVG, utilidades de color y componentes/patrones listados abiertamente; y que **Freshworks/Freshservice expone Crayons como librería pública de componentes**, además de haber introducido desde diciembre de 2025 la nueva interfaz **Dew** como experiencia visual unificada para Freshservice. ([garden.zendesk.com][1])

## 1. Hallazgos clave de UX/UI

### Zendesk

Zendesk centra su experiencia en el **Agent Workspace**, una vista unificada donde el agente resuelve tickets, chats y voz desde una sola interfaz. En esa vista aparecen repetidamente estos patrones: **panel izquierdo de contexto**, **área central de conversación**, **panel lateral de contexto/knowledge/side conversations**, cabecera con acciones rápidas, composer persistente y tabs o estados dentro de la misma página. Eso no es solo marketing; su documentación oficial lo describe así y además expone componentes y patrones de diseño públicos en Garden para tablas, tabs, tooltips, rich text editor, drag-and-drop, avatars, tags, skeletons y theme provider. ([Zendesk Soporte][2])

### Freshservice

Freshservice enfatiza un **service desk unificado**, dashboards operativos, tickets, service catalog, knowledge base, automatización drag-and-drop, CMDB/assets y configuración administrativa. Desde diciembre de 2025 Freshservice migró a la UI **Dew**, que Freshworks describe como una experiencia visual renovada, moderna, consistente y unificada. Paralelamente, su librería pública **Crayons** documenta componentes reutilizables como input, select, icon, pill/tag-like states, toggle y utilidades orientadas a consistencia visual en sus apps. ([Freshservice][3])

### Conclusión práctica

Si quieres “parecerte lo más posible” sin copiar literalmente, el camino correcto es replicar la **gramática visual y operativa** compartida por ambas: **sidebar vertical compacta**, **top bar sobria**, **workspace de 2 o 3 paneles**, **badges semánticos suaves**, **tablas limpias**, **filtros guardables**, **composer persistente**, **tooltips**, **íconos lineales SVG**, **espaciado generoso**, **cards muy contenidas**, **bordes redondeados suaves**, **sombras discretas** y **densidad de información alta pero ordenada**. Eso sí es observable y consistente entre ambas experiencias. ([Freshworks][4])

---

# ADDENDUM TÉCNICO UX/UI PARA EL PRD

## 2. Objetivo del addendum

Este addendum define con precisión los elementos visuales, patrones de interacción, componentes base, iconografía, estados, efectos y lineamientos técnicos para diseñar un mockup ITSM inspirado en Freshservice y Zendesk, buscando **alta similitud funcional y sensorial**, pero evitando una copia exacta de propiedad visual. La referencia principal debe ser el **modelo operativo visual** que ambos productos exponen públicamente: un workspace centralizado, modular y minimalista. ([Zendesk Soporte][2])

## 3. Diseño de referencia: arquitectura visual observable

### 3.1 Estructura de layout

Ambos productos gravitan hacia una estructura muy parecida:

* **Sidebar vertical izquierda** angosta con iconos
* **Top bar horizontal** con búsqueda, acciones, notificaciones y perfil
* **Área principal central** para listas, dashboards o conversación
* **Panel contextual lateral derecho** para metadatos, apps, knowledge, SLA o acciones secundarias

En Zendesk esto se ve con mucha claridad en Agent Workspace y unified conversations; en Freshservice se observa el mismo principio de navegación lateral + contenido principal + módulos contextuales sobre tickets, dashboards y automatización. ([Zendesk Soporte][2])

### 3.2 Jerarquía visual

La jerarquía en ambas interfaces prioriza:

1. Estado del trabajo actual
2. Acción primaria disponible
3. Contexto del caso/ticket
4. Información secundaria y colaboración
5. Navegación persistente pero de bajo ruido

Esto implica headers visualmente livianos, títulos pequeños a medianos, badges cortos, etiquetas de estado compactas y separación por bloques con mucho whitespace. Zendesk Garden además documenta variables semánticas de fondo, bordes y énfasis que refuerzan ese modelo. ([garden.zendesk.com][1])

## 4. Componentes UI que sí están públicamente identificados

### 4.1 Componentes visibles/documentados en Zendesk Garden

Zendesk Garden publica componentes y patrones que encajan exactamente con la UI observable de Zendesk: **Button, Avatar, Tags, Table, Tabs, Tooltip, Tooltip Dialog, Typography, Skeleton, File Upload, Draggable, Stepper, Rich Text Editor y Theme Provider**. También documenta utilidades de focus ring, color tokens, media queries y theme extension. ([garden.zendesk.com][5])

**Implicación para tu mockup:** si quieres aproximarte a Zendesk, tu design system interno debe contemplar al menos estos equivalentes:

* Button
* IconButton
* Avatar
* Badge/Tag
* Table
* Tabs
* Tooltip
* Drawer/Side panel
* Rich text editor
* File attachment list
* Skeleton loader
* Empty states
* Context panel
* Draggable workflow node/list

Esa lista es totalmente consistente con la evidencia pública de Garden y la interfaz de Agent Workspace. ([Zendesk Soporte][2])

### 4.2 Componentes visibles/documentados en Freshworks Crayons

Freshworks Crayons publica una base muy clara de componentes: **Icon (fw-icon), Input, Select, Pill, Toggle** y un ecosistema de componentes de formularios y sistema visual orientado a consistencia. El componente de icono soporta SVG, lazy loading con Intersection Observer, memoization de fetch y hasta registro de librerías externas. Crayons v3 también declara más flexibilidad, CSS variables, wrappers para React, i18n y utilidades CSS. ([Crayons][6])

**Implicación para tu mockup:** si quieres acercarte a Freshservice, tu kit debe incluir:

* SVG Icon system
* Inputs con icon-left / icon-right
* Selects modernos
* Pills para estado
* Toggles
* Formularios con error/hint/warning text
* CSS variables para tematización
* Comportamiento consistente entre admin, portal y workspace

Eso coincide con lo que Freshworks expone de forma pública. ([Crayons][6])

## 5. Iconografía

### 5.1 Zendesk

Garden documenta que su librería de íconos está implementada en **SVG**, con tamaños de **12 px y 16 px**, y posibilidad de escalar 16 px a 32 px. También recomienda tooltip para iconos interactivos ambiguos. ([garden.zendesk.com][7])

### 5.2 Freshworks

Crayons documenta `fw-icon` como renderer SVG, con soporte de optimización, lazy loading, memoization y accesibilidad por label. También permite registrar librerías externas de iconos. ([Crayons][6])

### 5.3 Requisito para tu PRD

Tu plataforma debe usar:

* **íconos SVG lineales**
* tamaño base **16 px** para navegación y acciones
* tamaño **12 px** para metadatos densos, pills y subtags
* tamaño **20–24 px** solo en navegación primaria o módulos destacados
* todo icono sin texto debe llevar tooltip o label accesible

Esto no es capricho: está alineado con el patrón documentado públicamente en Garden y Crayons. ([garden.zendesk.com][7])

## 6. Tipografía y escala visual

Zendesk Garden expone una escala tipográfica explícita con variantes **SM, MD, LG, XL, XXL, XXXL**, line heights y font weights temáticos. Freshworks no expone en estas páginas una escala tan detallada como Garden, pero sí una filosofía de consistencia de componentes y sistema visual. Lo correcto para tu mockup es adoptar una escala SaaS enterprise sobria: títulos cortos, labels compactos, data text muy legible y peso semibold solo en headings y números clave. ([garden.zendesk.com][1])

**Requisito PRD**

* Base text: 14 px
* Secondary/meta text: 12–13 px
* Section titles: 16–18 px semibold
* Page titles: 20–24 px semibold
* KPI numbers: 24–32 px
* Line height amplia para legibilidad en listas y tickets
* Evitar headers gigantes tipo landing page; ambas referencias usan lenguaje tipográfico contenido y productivo

Esto es una inferencia de diseño sustentada por la estructura pública de Garden y los screenshots/documentación funcional de ambos productos. ([garden.zendesk.com][8])

## 7. Color system y semantic tokens

Zendesk Garden documenta variables semánticas como:

* `background.default`
* `background.raised`
* `background.recessed`
* `background.subtle`
* `background.emphasis`
* `background.success`
* `background.warning`

y utilities para resolver color por tema, focus ring y dark mode. Eso indica un sistema basado en **semantic tokens**, no en hex hardcodeados. ([garden.zendesk.com][1])

Freshworks Crayons también orienta la customización por **CSS variables** y colores temáticos en componentes como pill. Freshworks además presentó Dew como una experiencia visual unificada y moderna para Freshservice y Freshdesk. ([Crayons][9])

**Requisito PRD**
El mockup debe definir semantic tokens, no colores sueltos:

* `surface.default`
* `surface.raised`
* `surface.subtle`
* `surface.selected`
* `border.default`
* `border.strong`
* `text.primary`
* `text.secondary`
* `text.muted`
* `accent.primary`
* `accent.primaryHover`
* `status.success`
* `status.warning`
* `status.danger`
* `status.info`

Y visualmente debe comportarse así:

* fondos casi blancos o gris muy claro
* bloques elevados apenas un nivel
* estados usando color suave, nunca chillón
* badges/pills de tono pastel con texto más oscuro
* foco visible con ring claro pero perceptible

Ese patrón es muy coherente con Garden y con la nueva línea Dew/Crayons. ([garden.zendesk.com][1])

## 8. Estados, badges, pills y etiquetas

Freshworks documenta explícitamente `fw-pill` para estados como overdue, new, pending, archived, con ícono opcional y colores temáticos. Zendesk usa tags/chips/tags dismissable en Garden. Ambos modelos confirman el uso intensivo de **status labels compactas**, semánticas y de baja altura. ([Crayons][9])

**Requisito PRD**
Crear un sistema unificado de badges:

* New
* Open
* Pending
* Waiting on customer
* In progress
* Escalated
* Overdue
* Resolved
* Closed
* Critical
* High
* Medium
* Low

Con estas reglas:

* altura baja
* padding horizontal corto
* radio pill completo o 999 px
* icono opcional solo para estados críticos
* usar en listas, detalle y dashboards
* consistencia absoluta entre tickets, assets, changes y requests

## 9. Tablas y listas de trabajo

Zendesk Garden documenta tablas con caption, striped rows y lineamientos de uso; Freshservice muestra listados con filtros, vistas guardadas, selección múltiple y acciones bulk. Los screenshots públicos y docs funcionales dejan claro que el patrón dominante no es card-heavy sino **tabla ligera/híbrida**, con alta capacidad de escaneo. ([garden.zendesk.com][10])

**Requisito PRD**
Las tablas del mockup deben tener:

* row height compacta-media
* checkbox al inicio
* subject/título dominante
* requester/assignee con avatar o inicial
* state y priority como pills
* SLA visible
* sorting
* saved views
* quick filters
* bulk actions
* sticky header opcional
* zebra striping muy sutil, o row hover, pero no ambos con demasiado contraste

Esto se alinea directamente con Garden y Freshservice tickets/views. ([garden.zendesk.com][10])

## 10. Navegación

La navegación observable en ambos productos usa una **sidebar izquierda icónica y persistente**, pensada para alta frecuencia de uso. No se ve una navegación decorativa; se ve una navegación operacional.

**Requisito PRD**
La navegación principal debe diseñarse así:

* ancho colapsado 64–72 px
* iconos verticales
* item activo con highlight suave
* tooltip al hover cuando esté colapsada
* posibilidad de expandir labels
* separadores visuales mínimos
* settings y admin abajo
* search/global create arriba o en top bar

## 11. Workspace de ticket/conversación

Aquí está la mayor similitud entre Freshservice y Zendesk: ambos llevan a un **espacio central operativo** donde el agente no debería saltar entre pantallas. Zendesk lo documenta explícitamente como unified interface con context panel, knowledge panel y side conversations; Freshservice enfatiza ticket module centralizado y unified view. ([Zendesk Soporte][2])

**Requisito PRD**
La pantalla de ticket debe estructurarse así:

* Header superior: ID, estado, prioridad, assignee, acciones primarias
* Columna central: conversación/timeline/actividad
* Panel lateral derecho: requester, SLA, related items, assets, KB suggestions, automations, collaborators
* Composer persistente abajo
* Alternancia clara entre public reply y internal note
* Adjuntos con mini file list
* Macros/plantillas accesibles desde composer
* Historial de cambios embebido en timeline
* Related records en panel o tab

## 12. Rich text editor y composer

Zendesk Garden publica lineamientos muy concretos para rich text editor: toolbar por defecto de **48 px**, compacta de **40 px**, overflow menu cuando no cabe, toolbar superior o inferior según contexto, y padding interno suficiente si el toolbar invade el textarea. Eso es oro para tu PRD, porque te permite diseñar un editor realmente parecido al de herramientas enterprise modernas. ([garden.zendesk.com][11])

**Requisito PRD**
El composer del ticket debe incluir:

* editor simple/rich text
* toolbar compacta 40 px en workspace denso
* overflow menu para acciones secundarias
* adjuntos
* macros/snippets
* selector public reply vs internal note
* CTA primario siempre visible
* atajos de teclado
* estado draft opcional

## 13. Automatización y workflow builder

Freshservice documenta drag-and-drop de nodos, loop nodes, subflows, web request nodes y reorder de workflows. Zendesk también comunica drag-and-drop flow builder para automatizaciones conversacionales. ([Freshservice][12])

**Requisito PRD**
El mockup del builder debe incluir:

* canvas con grid sutil
* panel izquierdo de nodos
* nodos rectangulares con icono + título + metadata breve
* conectores curvos o rectos discretos
* configurador lateral derecho
* estados draft/active
* test mode
* logs o run history visual
* soporte visual para event, condition, action, delay, loop, branch, API/webhook

## 14. Portal, service catalog y knowledge base

Freshservice documenta claramente service catalog, customización por grupos, knowledge base, multilingual KB y portal layout customization. Zendesk refuerza autoservicio y knowledge suggestions en workspace. ([Freshservice][13])

**Requisito PRD**
El portal debe verse menos “IT admin” y más “employee experience”:

* hero search prominente
* categorías en cards limpias
* servicio destacado
* artículos recomendados
* requests recientes
* estado de incidentes masivos
* branding configurable
* layout modular

## 15. Efectos visuales observables

No hay documentación pública que diga “usas exactamente X shadow o Y blur” en producción para cada app, pero sí se puede inferir con alta confianza el tipo de efectos:

* **sombras muy sutiles** en paneles elevados
* **bordes finos** y discretos
* **hover states suaves**
* **selected states con fondo tenue**
* **focus ring visible**
* **skeleton loading** cuando la estructura está definida
* **tooltips** para acciones icon-only
* **overflow menus** en espacios reducidos
* **animación mínima**, más funcional que ornamental

Esto está soportado por Garden en focus styles, tooltip, skeleton, theme object y rich text responsive behaviors, y por la naturaleza modular de Crayons/Dew. ([garden.zendesk.com][14])

## 16. Librerías y stack visual replicable recomendado

Aquí hay que separar dos cosas: **lo confirmado** y **lo recomendado**.

### Confirmado públicamente

* Zendesk Garden: ecosistema React/theming/components público. ([garden.zendesk.com][1])
* Freshworks Crayons: librería pública de componentes con wrappers React y CSS variables. ([Crayons][15])

### Recomendado para tu proyecto

Para lograr una UI muy parecida en feeling, te recomiendo definir en el PRD objetivo técnico de implementación con:

* React + TypeScript
* design tokens
* SVG icon system
* CSS variables
* headless data tables
* rich text editor modular
* panel/drawer system
* drag-and-drop para workflows
* theming light/dark
* skeleton loaders
* tooltip system
* badge/tag system
* avatar system

Eso no afirma que Freshservice y Zendesk usen exactamente tu stack propuesto; solo dice que ese stack reproduce muy bien los patrones públicos observados. La parte confirmada es Garden/Crayons; la parte propuesta es arquitectura de implementación equivalente. ([Crayons][15])

## 17. Requisitos UX/UI nuevos para insertar en tu PRD

### 17.1 Design system obligatorio

El producto deberá construirse sobre un design system propio compuesto por:

* semantic tokens
* typography scale
* button variants
* form controls
* tables
* badges/pills/tags
* avatars
* tooltips
* drawers
* tabs
* cards
* modals
* toasts
* skeletons
* empty states
* rich text editor
* workflow nodes
* icon library SVG

Inspirado en la exposición pública de Garden y Crayons. ([Crayons][15])

### 17.2 Interacción obligatoria

La UI debe soportar:

* hover states discretos
* focus visible keyboard-first
* inline actions
* saved views
* bulk actions
* paneles colapsables
* overflow menus
* tooltips para icon-only
* loaders skeleton
* drag-and-drop en automatizaciones
* composer persistente en tickets

([garden.zendesk.com][14])

### 17.3 Lenguaje visual obligatorio

La UI deberá verse:

* minimalista
* enterprise
* productiva
* calmada
* moderna
* modular
* precisa
* sin ruido visual innecesario

Consistente con Dew/Freshservice y Agent Workspace/Garden. ([Freshservice][3])

## 18. Lo que no debes copiar literalmente

Aunque quieras asemejarte mucho, te recomiendo dejar explícito en el PRD que **no se copiarán marcas, íconos propietarios exclusivos, ilustraciones propias, microcopy exacto ni layout pixel-perfect idéntico**. El objetivo será replicar:

* el modelo de información
* la densidad visual
* la lógica espacial
* la priorización operacional
* la sobriedad visual
* el comportamiento de componentes

y no la identidad propietaria exacta. Eso te da una base segura y profesional.

## 19. Resumen ejecutivo final

Lo más valioso que encontré es esto:

* **Zendesk** tiene el design system público más explícito para replicar el feeling: **Garden**. Ahí ya están definidos iconos SVG, theming, typography, tags, tables, tabs, tooltips, rich text editor, skeletons, drag-and-drop y patrones de accesibilidad. ([garden.zendesk.com][1])
* **Freshservice** hoy debe leerse desde dos frentes: la **nueva interfaz Dew** y la librería pública **Crayons**, que expone componentes, SVG icons, CSS variables, wrappers React y componentes de formularios/estado muy alineados al look Freshservice. ([Freshservice][3])
* El patrón común replicable entre ambas es: **sidebar compacta + workspace central + panel contextual + tablas sobrias + badges suaves + iconografía SVG lineal + automatización visual + knowledge/self-service + theming semántico**. ([Freshworks][4])

Si quieres, el siguiente paso te lo puedo entregar ya convertido en un **PRD v2 completo**, reescrito de punta a punta, con secciones formales de:
**objetivos, benchmark UX/UI, design tokens, component inventory, interaction patterns, user stories y acceptance criteria**.

[1]: https://garden.zendesk.com/components/theme-object/?utm_source=chatgpt.com "Theme object / Components / Zendesk Garden"
[2]: https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace?utm_source=chatgpt.com "About the Zendesk Agent Workspace"
[3]: https://support.freshservice.com/support/solutions/articles/50000011726-introducing-the-new-freshservice-interface?utm_source=chatgpt.com "Introducing the new Freshservice interface"
[4]: https://www.freshworks.com/freshservice/features/?utm_source=chatgpt.com "Freshservice Features: ITSM, ITAM, ITOM, ESM & Service ..."
[5]: https://garden.zendesk.com/components/avatar/?utm_source=chatgpt.com "Avatar / Components / Zendesk Garden"
[6]: https://crayons.freshworks.com/components/core/icon/?utm_source=chatgpt.com "Icon (fw-icon) | Crayons"
[7]: https://garden.zendesk.com/design/icons/?utm_source=chatgpt.com "Icon overview / Design / Zendesk Garden"
[8]: https://garden.zendesk.com/components/typography/?utm_source=chatgpt.com "Typography / Components / Zendesk Garden"
[9]: https://crayons.freshworks.com/v3/components/core/pill/?utm_source=chatgpt.com "Pill (fw-pill) - Crayons - Freshworks"
[10]: https://garden.zendesk.com/components/table/?utm_source=chatgpt.com "Table / Components / Zendesk Garden"
[11]: https://garden.zendesk.com/patterns/rich-text-editor/?utm_source=chatgpt.com "Rich-text editor"
[12]: https://support.freshservice.com/support/solutions/articles/50000011585-subflows-in-freshservice-workflows?utm_source=chatgpt.com "Subflows in Freshservice Workflows"
[13]: https://support.freshservice.com/support/solutions/articles/200987-how-to-restrict-visibility-of-service-catalog-items-based-on-user-groups?utm_source=chatgpt.com "How to customize the Service Catalog based on User Groups"
[14]: https://garden.zendesk.com/components/utilities/?utm_source=chatgpt.com "Utilities / Components / Zendesk Garden"
[15]: https://crayons.freshworks.com/introduction/?utm_source=chatgpt.com "Overview | Crayons"
