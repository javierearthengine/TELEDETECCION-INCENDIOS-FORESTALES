# Teledetección aplicada a incendios forestales

Algoritmos en **Google Earth Engine (GEE)** para el monitoreo de incendios forestales con sensores ópticos y de radar: identificación de **cicatrices de fuego** y mapeo de **severidad**. Desarrollados en el departamento de Sistemas de Información Geográfica del Instituto Nacional de Bosques (INAB), Guatemala, con una adaptación para El Salvador.

## Contenido

| # | Carpeta | Qué hace | Ámbito |
|---|---------|----------|--------|
| 01 | [`gee/01_cicatrices_fuego_guatemala`](gee/01_cicatrices_fuego_guatemala) | Clasificación de cicatrices / no cicatrices de fuego con imágenes ópticas y de radar | Guatemala |
| 02 | [`gee/02_app_severidad_incendios`](gee/02_app_severidad_incendios) | App para mapear la severidad de incendios con dos metodologías seleccionables | Guatemala |
| 03 | [`gee/03_cicatrices_fuego_el_salvador`](gee/03_cicatrices_fuego_el_salvador) | Adaptación de la metodología de cicatrices con selector de departamento (buffer de 1 km) | El Salvador |

## Descripción de los scripts

### 01 · Cicatrices de fuego — Guatemala
- **Objetivo:** clasificar las categorías *cicatriz* y *no cicatriz* de fuego.
- **Datos:** Landsat 8 y 9 (Collection 2, nivel 2), Sentinel-2 SR armonizado y Sentinel-1 GRD (SAR).
- **Base metodológica:** metodología SIGMA I y el curso de NASA ARSET *Mapeo y Monitoreo de los Bosques con Datos SAR*.
- **Muestras de entrenamiento:** colecciones `cicatriz` y `nocicatriz`, incluidas al inicio del script.

### 02 · App de severidad de incendios forestales
- **Metodología 1 (UJED):** RBR con corrección fenológica (percentil 25).
- **Metodología 2 (FAO / UN-SPIDER):** dNBR clasificado en 5 niveles.
- **Área de interés:** dibujada por la persona usuaria o seleccionada entre las regiones REDD+ (propuesta subnacional 2021).
- **Sensores:** Sentinel-2, Landsat 8, Landsat 9 y Landsat 8+9 combinados.
- **Descargas:** enlaces directos, vectorización a SHP y enlace de teselas XYZ para QGIS / ArcGIS.

### 03 · Cicatrices de fuego — El Salvador (V3)
- Adaptación del script 01 para El Salvador, con **selector de departamento** y un buffer de 1 km.
- **Período de trabajo:** 2016–2025.
- **Datos:** Landsat 8 y 9 (C2, L2), Sentinel-2 SR armonizado y Sentinel-1 GRD.
- **Muestras de entrenamiento:** colecciones `cicatriz` y `nocicatriz`, incluidas al inicio del script.

## Cómo usar los scripts

1. Abre el archivo `.js` que te interese y copia todo su contenido.
2. En el [Code Editor de GEE](https://code.earthengine.google.com/), crea un script nuevo y pega el código.
3. Las variables que en el Code Editor original eran *Imports* (geometrías dibujadas, muestras de entrenamiento, parámetros de visualización) están declaradas como código al inicio de cada archivo, así que no hace falta volver a dibujarlas.
4. Presiona **Run**.

> **Assets:** los scripts leen assets del INAB (por ejemplo, `users/inabsigguatemala/InformacionBase/Propuesta_subnac_un2021_REDD`). Si al correrlos aparece un error de permisos, solicita acceso a esos assets o reemplaza la ruta por una capa equivalente propia.

## Créditos

Scripts adaptados por el departamento de Sistemas de Información Geográfica del INAB: Danger Gómez, Javier Montes y Manuel Custodio.
Consejo Nacional de Áreas Protegidas (CONAP): Marlin George.
Apoyo especial: Emil Cherrington y Betsy Hernández (SERVIR – NASA).
Con la colaboración del GIMBUT (INAB, CONAP, MARN, MAGA, UVG, URL, USAC).
