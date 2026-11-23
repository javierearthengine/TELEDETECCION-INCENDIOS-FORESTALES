// =====================================================================
// IMPORTS (generados desde el Code Editor de GEE)
// AOI: geometria que la persona usuaria dibuja en el mapa
// =====================================================================
var AOI = /* color: #ff3b30 */ee.Geometry.MultiPoint();

/**** =========================================================================
 *  APP: MAPEO DE SEVERIDAD DE INCENDIOS FORESTALES - GUATEMALA   (SIGPRO)
 *  -------------------------------------------------------------------------
 *  Metodología 1 (UJED): RBRc con corrección fenológica (percentil 25).
 *  Metodología 2 (FAO / UN-SPIDER): dNBR clasificado en 5 niveles.
 *  -------------------------------------------------------------------------
 *  NOVEDADES v2:
 *   - Área de interés: dibujada por el usuario O seleccionada entre las
 *     regiones REDD+ (propuesta subnacional 2021).
 *   - FAO: Sentinel-2, Landsat 8, Landsat 9 y Landsat 8+9 combinados.
 *   - Descargas que funcionan en una App publicada (enlaces directos,
 *     vectorización a SHP y enlace de teselas XYZ para QGIS/ArcGIS).
 * ========================================================================= ****/

//==========================================================================
// 0. CONSTANTES
//==========================================================================
var ASSET_REDD = 'users/inabsigguatemala/InformacionBase/Propuesta_subnac_un2021_REDD';
var REGIONES = ee.FeatureCollection(ASSET_REDD);

var VIS_S2 = {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.30, gamma: 1.4};
var VIS_L  = {bands: ['SR_B4', 'SR_B3', 'SR_B2'], min: 0, max: 0.30, gamma: 1.4};

var PALETA_UJED  = ['fffc0d', 'ffaa03', 'd7191c', '060006'];
var NOMBRES_UJED = ['Bajo', 'Moderado', 'Alto', 'Extremo'];
var VIS_UJED     = {min: 2, max: 5, palette: PALETA_UJED};

var PALETA_FAO  = ['0ae042', 'fff70b', 'ffaf38', 'ff641b', 'FF0000'];
var NOMBRES_FAO = ['No quemado', 'Baja severidad', 'Moderada-baja severidad',
                   'Moderada-alta severidad', 'Alta severidad'];
var VIS_FAO     = {min: 1, max: 5, palette: PALETA_FAO};
var VIS_GRIS    = {min: -500, max: 1300, palette: ['white', 'black']};

var BANDAS_S2 = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'];
var BANDAS_L  = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'];

var RESULTADOS = {};          // salidas de la última corrida
var AOI_REGION = null;        // geometría de la región REDD+ seleccionada
var CAMPO_REGION = null;      // nombre real de la columna de región

//==========================================================================
// 1. PANEL PRINCIPAL
//==========================================================================
var panel = ui.Panel({
  style: {width: '410px', padding: '10px', backgroundColor: '#f7f8f9'}
});
ui.root.insert(0, panel);

panel.add(ui.Label('Mapeo de severidad de incendios', {
  fontWeight: 'bold', fontSize: '19px', color: '#1a3c2f', margin: '4px 0 0 0'}));
panel.add(ui.Label('Guatemala · Sentinel-2 / Landsat 8-9', {
  fontSize: '12px', color: '#666', margin: '2px 0 10px 0'}));

function separador(texto) {
  return ui.Panel([
    ui.Label(texto, {fontWeight: 'bold', fontSize: '13px',
                     color: '#1a3c2f', margin: '10px 0 2px 0'}),
    ui.Label('', {margin: '0', padding: '0', height: '1px',
                  backgroundColor: '#cfd6d3', stretch: 'horizontal'})
  ]);
}

var panelAOI        = ui.Panel();
var panelParametros = ui.Panel();
var panelAccion     = ui.Panel();
var panelPreview    = ui.Panel();
var panelResultados = ui.Panel();
var panelDescarga   = ui.Panel();

panel.add(separador('1. Área de interés'));
panel.add(panelAOI);
panel.add(separador('2. Metodología'));

var selMetodologia = ui.Select({
  items: [
    {label: 'Metodología 1 - UJED (RBRc corregido)', value: 'UJED'},
    {label: 'Metodología 2 - FAO (dNBR clasificado)', value: 'FAO'}
  ],
  value: 'UJED',
  style: {width: '370px', margin: '6px 0 4px 0'},
  onChange: function () { construirFormulario(); limpiarSalidas(); }
});
panel.add(selMetodologia);

panel.add(separador('3. Parámetros'));
panel.add(panelParametros);
panel.add(panelAccion);
panel.add(panelPreview);
panel.add(panelResultados);
panel.add(panelDescarga);

//==========================================================================
//==========================================================================
// 2. ÁREA DE INTERÉS: DIBUJO O REGIÓN REDD+
//==========================================================================
var drawingTools = Map.drawingTools();
drawingTools.setShown(true);
drawingTools.setDrawModes(['polygon', 'rectangle']);
while (drawingTools.layers().length() > 0) {
  drawingTools.layers().remove(drawingTools.layers().get(0));
}
var capaAOI = ui.Map.GeometryLayer({geometries: null, name: 'AOI', color: '#ff3b30'});
drawingTools.layers().add(capaAOI);
drawingTools.setShape(null);

var selFuente = ui.Select({
  items: [
    {label: 'Dibujar el área en el mapa', value: 'DIBUJO'},
    {label: 'Seleccionar región REDD+', value: 'REGION'}
  ],
  value: 'DIBUJO',
  style: {width: '370px', margin: '4px 0'},
  onChange: function () { construirPanelAOI(); limpiarSalidas(); }
});

var lblAOI = ui.Label('Sin área definida.', {fontSize: '12px', color: '#b3261e'});

function obtenerAOI() {
  if (selFuente.getValue() === 'REGION') return AOI_REGION;
  if (capaAOI.geometries().length() === 0) return null;
  return ee.Geometry(capaAOI.getEeObject());
}

function reportarArea(geom) {
  lblAOI.style().set('color', '#1a3c2f');
  lblAOI.setValue('Calculando superficie...');
  geom.area(100).divide(10000).evaluate(function (ha) {
    lblAOI.setValue('Área definida: ' + ha.toFixed(2) + ' ha');
  });
}

function actualizarEstadoDibujo() {
  var g = (capaAOI.geometries().length() === 0) ? null : ee.Geometry(capaAOI.getEeObject());
  if (g === null) {
    lblAOI.setValue('Sin área definida.');
    lblAOI.style().set('color', '#b3261e');
  } else {
    reportarArea(g);
  }
}
drawingTools.onDraw(actualizarEstadoDibujo);
drawingTools.onEdit(actualizarEstadoDibujo);
drawingTools.onErase(actualizarEstadoDibujo);

// ---- Detección automática de la columna con el nombre de la región ------
var selCampoRegion = ui.Select({items: [], placeholder: 'Detectando columnas...',
                                style: {width: '190px', margin: '3px 0'}});
var selRegion = ui.Select({items: [], placeholder: 'Cargando regiones...',
                           style: {width: '190px', margin: '3px 0'},
                           onChange: function (v) { if (v) usarRegion(v); }});
var lblBusqueda = ui.Label('', {fontSize: '11.5px', color: '#555', margin: '4px 0'});

REGIONES.first().propertyNames().evaluate(function (props, err) {
  if (err || !props) {
    selCampoRegion.setPlaceholder('No se pudo leer el asset');
    selRegion.setPlaceholder('No se pudo leer el asset');
    return;
  }
  var items = [];
  props.forEach(function (p) {
    if (p !== 'system:index') items.push({label: p, value: p});
  });
  selCampoRegion.items().reset(items);
  // busca una columna que parezca el nombre de la región
  var detectado = null;
  props.forEach(function (p) {
    var pl = p.toLowerCase();
    if (detectado === null &&
        (pl.indexOf('region') >= 0 || pl.indexOf('nombre') >= 0 || pl.indexOf('name') >= 0)) {
      detectado = p;
    }
  });
  CAMPO_REGION = detectado || (items.length ? items[0].value : null);
  if (CAMPO_REGION) {
    selCampoRegion.setValue(CAMPO_REGION, false);
    cargarRegiones();
  }
});

selCampoRegion.onChange(function (campo) {
  CAMPO_REGION = campo;
  cargarRegiones();
});

function cargarRegiones() {
  AOI_REGION = null;
  selRegion.items().reset([]);
  selRegion.setPlaceholder('Cargando regiones...');
  REGIONES.aggregate_array(CAMPO_REGION).distinct().sort()
    .evaluate(function (vals, err) {
      if (err || !vals || !vals.length) {
        selRegion.setPlaceholder('No se pudieron leer las regiones');
        return;
      }
      var items = vals.map(function (v) {
        return {label: String(v), value: String(v)};
      });
      selRegion.items().reset(items);
      selRegion.setPlaceholder('Seleccione una región');
    });
}

function usarRegion(nombre) {
  var campo = selCampoRegion.getValue() || CAMPO_REGION;
  AOI_REGION = null;
  limpiarSalidas();

  if (!nombre || !campo) {
    lblBusqueda.setValue('Seleccione una región y verifique la columna.');
    lblBusqueda.style().set('color', '#b3261e');
    return;
  }

  // la columna puede ser texto o numérica: se prueban ambas
  var filtros = [ee.Filter.eq(campo, nombre)];
  var num = Number(nombre);
  if (nombre.trim() !== '' && !isNaN(num)) filtros.push(ee.Filter.eq(campo, num));
  var seleccion = REGIONES.filter(ee.Filter.or.apply(null, filtros));

  seleccion.size().evaluate(function (n, err) {
    if (err || !n) {
      lblBusqueda.setValue('No se encontró la región seleccionada.');
      lblBusqueda.style().set('color', '#b3261e');
      return;
    }
    AOI_REGION = seleccion.geometry(100);
    Map.centerObject(AOI_REGION, 8);
    Map.addLayer(seleccion.style({color: 'ff3b30', width: 2, fillColor: '00000000'}),
                 {}, 'Región ' + nombre);
    lblBusqueda.setValue('Región seleccionada: ' + nombre + ' (' + n + ' polígono(s)).');
    lblBusqueda.style().set('color', '#1a3c2f');
    reportarArea(AOI_REGION);
  });
}

// ---- Construcción del bloque de AOI ------------------------------------
function construirPanelAOI() {
  panelAOI.clear();
  panelAOI.add(selFuente);

  if (selFuente.getValue() === 'DIBUJO') {
    panelAOI.add(ui.Label('Dibuje el polígono del incendio sobre el mapa.',
      {fontSize: '11.5px', color: '#555', margin: '4px 0'}));
    panelAOI.add(ui.Panel([
      ui.Button({label: 'Polígono', style: {stretch: 'horizontal'},
        onClick: function () { drawingTools.setShape('polygon'); drawingTools.draw(); }}),
      ui.Button({label: 'Rectángulo', style: {stretch: 'horizontal'},
        onClick: function () { drawingTools.setShape('rectangle'); drawingTools.draw(); }}),
      ui.Button({label: 'Borrar', style: {stretch: 'horizontal'},
        onClick: function () {
          while (capaAOI.geometries().length() > 0) {
            capaAOI.geometries().remove(capaAOI.geometries().get(0));
          }
          drawingTools.setShape(null);
          limpiarSalidas();
          actualizarEstadoDibujo();
        }})
    ], ui.Panel.Layout.flow('horizontal'), {margin: '2px 0'}));
    actualizarEstadoDibujo();

  } else {
    panelAOI.add(ui.Label('Capa: Propuesta_subnac_un2021_REDD (regiones REDD+)',
      {fontSize: '11.5px', color: '#555', margin: '4px 0'}));
    panelAOI.add(ui.Panel([
      ui.Label('Columna', {fontSize: '12px', margin: '7px 6px 0 0', width: '150px'}),
      selCampoRegion], ui.Panel.Layout.flow('horizontal')));
    panelAOI.add(ui.Panel([
      ui.Label('Región REDD+', {fontSize: '12px', margin: '7px 6px 0 0', width: '150px'}),
      selRegion], ui.Panel.Layout.flow('horizontal')));
    panelAOI.add(lblBusqueda);
    panelAOI.add(ui.Label('Una región completa es un área extensa: el cálculo puede tardar.',
      {fontSize: '11px', color: '#777', margin: '4px 0'}));
    if (AOI_REGION === null) {
      lblAOI.setValue('Sin área definida.');
      lblAOI.style().set('color', '#b3261e');
    }
  }
  panelAOI.add(lblAOI);
}

//==========================================================================
// 3. FORMULARIOS DINÁMICOS
//==========================================================================
var campos = {};

function campoTexto(etiqueta, valor, ayuda) {
  var tb = ui.Textbox({value: valor, style: {width: '185px', margin: '3px 0'}});
  panelParametros.add(ui.Panel([
    ui.Label(etiqueta, {fontSize: '12px', margin: '7px 6px 0 0', width: '155px'}), tb
  ], ui.Panel.Layout.flow('horizontal')));
  if (ayuda) {
    panelParametros.add(ui.Label(ayuda, {fontSize: '10.5px', color: '#777',
      margin: '0 0 4px 2px'}));
  }
  return tb;
}

function campoSelect(etiqueta, items, valor) {
  var sel = ui.Select({items: items, value: valor,
                       style: {width: '185px', margin: '3px 0'}});
  panelParametros.add(ui.Panel([
    ui.Label(etiqueta, {fontSize: '12px', margin: '7px 6px 0 0', width: '155px'}), sel
  ], ui.Panel.Layout.flow('horizontal')));
  return sel;
}

function construirFormulario() {
  panelParametros.clear();
  panelAccion.clear();
  campos = {};

  if (selMetodologia.getValue() === 'UJED') {
    panelParametros.add(ui.Label(
      'Compuestos percentil 25 con corrección fenológica (anillo de 2 km a 5 km del AOI). ' +
      'Solo Sentinel-2: los umbrales de RBRc están calibrados para ese sensor.',
      {fontSize: '11px', color: '#555', margin: '4px 0 6px 0'}));
    campos.idcpc   = campoTexto('ID del incendio (IDCPC)', 'Costa_Sur');
    campos.mes     = campoTexto('Mes', 'Mayo');
    campos.fecha   = campoTexto('Fecha del incendio', '2026-05-01',
                                'Formato YYYY-MM-DD (fin del periodo pre).');
    campos.dw      = campoSelect('Ventana dw (días)',
                       [{label: '30', value: '30'}, {label: '60', value: '60'},
                        {label: '90', value: '90'}], '60');
    campos.carpeta = campoTexto('Carpeta en Drive', 'Guatemala2026');

  } else {
    panelParametros.add(ui.Label(
      'dNBR escalado x1000 y clasificado en 5 niveles (umbrales FAO / UN-SPIDER).',
      {fontSize: '11px', color: '#555', margin: '4px 0 6px 0'}));
    campos.preIni = campoTexto('Pre-incendio inicio', '2024-02-01', 'Formato YYYY-MM-DD.');
    campos.preFin = campoTexto('Pre-incendio fin', '2024-02-28');
    campos.posIni = campoTexto('Post-incendio inicio', '2024-05-01');
    campos.posFin = campoTexto('Post-incendio fin', '2024-05-29');
    campos.plat   = campoSelect('Satélite', [
                      {label: 'Sentinel-2 (20 m)', value: 'S2'},
                      {label: 'Landsat 8 (30 m)', value: 'L8'},
                      {label: 'Landsat 9 (30 m)', value: 'L9'},
                      {label: 'Landsat 8 + 9 combinados (30 m)', value: 'L89'}
                    ], 'S2');
    campos.carpeta = campoTexto('Carpeta en Drive', 'Guatemala2026');
  }

  panelAccion.add(ui.Button({
    label: 'Ejecutar análisis',
    style: {stretch: 'horizontal', margin: '10px 0 4px 0'},
    onClick: ejecutar
  }));
}

//==========================================================================
// 4. UTILIDADES
//==========================================================================
function limpiarSalidas() {
  Map.layers().reset();
  panelPreview.clear();
  panelResultados.clear();
  panelDescarga.clear();
  legendPanel.clear();
  RESULTADOS = {};
  if (selFuente.getValue() === 'REGION' && AOI_REGION !== null) {
    Map.addLayer(ee.FeatureCollection([ee.Feature(AOI_REGION)]).style(
      {color: 'ff3b30', width: 2, fillColor: '00000000'}), {}, 'Región REDD+');
  }
}

function mensaje(texto, color) {
  panelResultados.add(ui.Label(texto, {fontSize: '12px',
    color: color || '#b3261e', margin: '6px 0'}));
}

function epsgUTM(aoi) {
  var lon = ee.Number(aoi.centroid(10).coordinates().get(0));
  var zona = lon.add(180).divide(6).floor().add(1).int().getInfo();
  return {epsg: 'EPSG:326' + zona, zona: zona};
}

//==========================================================================
// 5. LEYENDA
//==========================================================================
var legendPanel = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 12px', backgroundColor: 'white'}});
Map.add(legendPanel);

function filaLeyenda(color, nombre) {
  return ui.Panel([
    ui.Label('', {backgroundColor: '#' + color, padding: '8px',
                  margin: '0 0 4px 0', border: '1px solid #999'}),
    ui.Label(nombre, {margin: '0 0 4px 6px', fontSize: '12px'})
  ], ui.Panel.Layout.Flow('horizontal'));
}

function construirLeyenda(titulo, paleta, nombres, notaFinal) {
  legendPanel.clear();
  legendPanel.add(ui.Label(titulo, {fontWeight: 'bold', fontSize: '15px',
                                    margin: '0 0 6px 0'}));
  for (var i = 0; i < paleta.length; i++) {
    legendPanel.add(filaLeyenda(paleta[i], nombres[i]));
  }
  if (notaFinal) legendPanel.add(filaLeyenda('b4b5b7', notaFinal));
}

//==========================================================================
// 6. COLECCIONES ÓPTICAS (S2, L8, L9, L8+L9)
//==========================================================================
function definirPlataforma(plat) {
  if (plat === 'L8') {
    return {col: ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'),
            escala: 30, nombre: 'Landsat-8', familia: 'L'};
  }
  if (plat === 'L9') {
    return {col: ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'),
            escala: 30, nombre: 'Landsat-9', familia: 'L'};
  }
  if (plat === 'L89') {
    // LC08 y LC09 comparten nombres de banda y escalado en la Colección 2 Nivel 2,
    // por lo que se pueden fusionar directamente y densificar la serie temporal.
    return {col: ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                   .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')),
            escala: 30, nombre: 'Landsat-8+9', familia: 'L'};
  }
  return {col: ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED'),
          escala: 20, nombre: 'Sentinel-2', familia: 'S2'};
}

function escalarS2(image) {
  return image.select(BANDAS_S2).divide(10000)
    .copyProperties(image, ['system:time_start']);
}
function mascaraS2(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(0).and(scl.neq(1)).and(scl.neq(3)).and(scl.neq(8))
    .and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.select(BANDAS_S2).divide(10000).updateMask(mask)
    .copyProperties(image, ['system:time_start']);
}
function escalarL(image) {
  return image.select(BANDAS_L).multiply(0.0000275).add(-0.2)
    .copyProperties(image, ['system:time_start']);
}
function mascaraL(image) {
  var qa = image.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 1).eq(0)      // nube dilatada
    .and(qa.bitwiseAnd(1 << 2).eq(0))         // cirros
    .and(qa.bitwiseAnd(1 << 3).eq(0))         // nube
    .and(qa.bitwiseAnd(1 << 4).eq(0))         // sombra de nube
    .and(qa.bitwiseAnd(1 << 5).eq(0));        // nieve
  return image.select(BANDAS_L).multiply(0.0000275).add(-0.2).updateMask(mask)
    .copyProperties(image, ['system:time_start']);
}

//==========================================================================
// 7. VISTA PREVIA PRE / POST
//==========================================================================
function vistaPrevia(aoi, preIni, preFin, posIni, posFin, plat) {
  var p = definirPlataforma(plat);
  var esS2 = (p.familia === 'S2');
  var vis = esS2 ? VIS_S2 : VIS_L;
  var escalar = esS2 ? escalarS2 : escalarL;

  var pre  = p.col.filterDate(preIni, preFin).filterBounds(aoi).map(escalar).median().clip(aoi);
  var post = p.col.filterDate(posIni, posFin).filterBounds(aoi).map(escalar).median().clip(aoi);

  Map.addLayer(pre, vis, 'RGB pre-incendio (' + p.nombre + ')', false);
  Map.addLayer(post, vis, 'RGB post-incendio (' + p.nombre + ')', false);

  var params = {dimensions: 340, region: aoi.bounds(), format: 'png'};

  panelPreview.clear();
  panelPreview.add(separador('4. Vista previa (' + p.nombre + ')'));
  panelPreview.add(ui.Label('Pre-incendio: ' + preIni + ' a ' + preFin,
    {fontSize: '11.5px', margin: '4px 0 2px 0'}));
  panelPreview.add(ui.Thumbnail({image: pre.visualize(vis), params: params,
    style: {width: '350px', margin: '0 0 6px 0'}}));
  panelPreview.add(ui.Label('Post-incendio: ' + posIni + ' a ' + posFin,
    {fontSize: '11.5px', margin: '4px 0 2px 0'}));
  panelPreview.add(ui.Thumbnail({image: post.visualize(vis), params: params,
    style: {width: '350px', margin: '0 0 6px 0'}}));

  // conteo de imágenes disponibles
  var nPre  = p.col.filterDate(preIni, preFin).filterBounds(aoi).size();
  var nPost = p.col.filterDate(posIni, posFin).filterBounds(aoi).size();
  var lbl = ui.Label('Contando escenas...', {fontSize: '11px', color: '#666'});
  panelPreview.add(lbl);
  ee.List([nPre, nPost]).evaluate(function (v) {
    if (v) lbl.setValue('Escenas disponibles: ' + v[0] + ' pre / ' + v[1] + ' post');
  });
}

//==========================================================================
// 8. METODOLOGÍA 1 - UJED
//==========================================================================
function mascaraSCL_UJED(image) {
  var b1 = image.select('B1');
  var scl = image.select('SCL');
  var mask = scl.eq(9).or(scl.eq(3)).or(scl.eq(6))
    .or(scl.eq(8)).or(scl.eq(10)).or(scl.eq(11)).or(b1.gt(2000));
  return image.updateMask(mask.not()).copyProperties(image, ['system:time_start']);
}

function agregarNBR(image) {
  var nbr = image.expression('((NIR - SWIR) / (NIR + SWIR))', {
    'NIR': image.select('B8').divide(10000),
    'SWIR': image.select('B12').divide(10000)
  }).toFloat().rename('nbr');
  return image.addBands(nbr).copyProperties(image, ['system:time_start']);
}

function reclasificarTemplado(image) {
  return image.gte(86).and(image.lt(191)).multiply(2)
    .add(image.gte(191).and(image.lt(344)).multiply(3))
    .add(image.gte(344).and(image.lt(497)).multiply(4))
    .add(image.gte(497).multiply(5));
}
function reclasificarTropical(image) {
  return image.gte(67).and(image.lt(152)).multiply(2)
    .add(image.gte(152).and(image.lt(278)).multiply(3))
    .add(image.gte(278).and(image.lt(407)).multiply(4))
    .add(image.gte(407).multiply(5));
}

function correrUJED(aoi) {
  var IDCPC   = campos.idcpc.getValue();
  var MES     = campos.mes.getValue();
  var FECHA   = campos.fecha.getValue();
  var dw      = parseInt(campos.dw.getValue(), 10);
  var carpeta = campos.carpeta.getValue();
  var respix  = 20;
  var per     = 25;

  var prefire_end    = ee.Date(FECHA);
  var prefire_start  = prefire_end.advance(-dw, 'day');
  var postfire_start = prefire_end.advance(30, 'day');
  var postfire_end   = postfire_start.advance(dw, 'day');

  var extent = aoi.buffer(10);

  var S2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(prefire_start, postfire_end).filterBounds(extent);
  var SL2A = S2.map(mascaraSCL_UJED).map(agregarNBR);

  var pre = SL2A.select('nbr').filterDate(prefire_start, prefire_end)
    .reduce(ee.Reducer.percentile([per])).rename('NBRpr');
  var post = SL2A.select('nbr').filterDate(postfire_start, postfire_end)
    .reduce(ee.Reducer.percentile([per])).rename('NBRpo');

  var indices = pre.addBands(post);
  var indices3 = indices.expression("(b('NBRpr') - b('NBRpo')) * 1000")
    .rename('dNBR').toFloat().addBands(indices);
  var indices4 = indices3.expression("b('dNBR') / (b('NBRpr') + 1.001)")
    .rename('RBR').toFloat().addBands(indices3);

  var nbrm = indices3.expression("((b('NBRpr') > 0.00) and (b('NBRpo') > 0.00)) ? 1 : 0")
    .rename('nbrm');
  indices3 = indices3.addBands(nbrm);

  var interior = aoi.buffer(5000);
  var anillo = interior.buffer(2000).difference(interior);
  var offset = indices3.select('dNBR').updateMask(nbrm).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: anillo, scale: respix, maxPixels: 1e9
  }).getNumber('dNBR');

  var dnbrdona = ee.Image.constant(
    ee.Algorithms.If(offset, ee.Number(offset).toFloat(), ee.Number(0).toFloat())
  ).rename('dnbrdona');
  indices3 = indices3.addBands(dnbrdona);

  var indices5 = indices3.expression("b('dNBR') - b('dnbrdona')")
    .rename('dNBRc').toFloat().addBands(indices4);
  var indices6 = indices5.expression("b('dNBRc') / (b('NBRpr') + 1.001)")
    .rename('RBRc').toFloat().addBands(indices5);

  var rbrc = indices6.select('RBRc').clip(extent);
  var rbrcClip = rbrc.clip(aoi);

  var sevTemplado = reclasificarTemplado(rbrc).updateMask(rbrc.gte(86)).rename('severidad');
  var sevTropical = reclasificarTropical(rbrc).updateMask(rbrc.gte(67)).rename('severidad');

  Map.addLayer(rbrc, {min: 0, max: 800, palette: ['ffffff', '060006']}, 'RBRc continuo', false);
  Map.addLayer(sevTemplado, VIS_UJED, 'Severidad - Templado/Semiárido');
  Map.addLayer(sevTropical, VIS_UJED, 'Severidad - Tropical');
  Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style(
    {color: '0000FF', width: 3, fillColor: '00000000'}), {}, 'AOI');

  construirLeyenda('Niveles de severidad (UJED)', PALETA_UJED, NOMBRES_UJED,
                   'Muy bajo / no quemado');

  vistaPrevia(aoi,
    prefire_start.format('YYYY-MM-dd').getInfo(),
    prefire_end.format('YYYY-MM-dd').getInfo(),
    postfire_start.format('YYYY-MM-dd').getInfo(),
    postfire_end.format('YYYY-MM-dd').getInfo(), 'S2');

  panelResultados.add(separador('5. Resultados'));
  panelResultados.add(ui.Label('Periodos: pre ' +
    prefire_start.format('YYYY-MM-dd').getInfo() + ' a ' +
    prefire_end.format('YYYY-MM-dd').getInfo() + ' | post ' +
    postfire_start.format('YYYY-MM-dd').getInfo() + ' a ' +
    postfire_end.format('YYYY-MM-dd').getInfo(), {fontSize: '11.5px', margin: '4px 0'}));

  var lblOffset = ui.Label('Offset fenológico: calculando...', {fontSize: '12px'});
  panelResultados.add(lblOffset);
  offset.evaluate(function (v) {
    lblOffset.setValue('Offset fenológico (dNBR anillo): ' +
      (v === null ? 'sin datos (0)' : v.toFixed(2)));
  });

  var p50 = rbrcClip.reduceRegion({reducer: ee.Reducer.median(), geometry: aoi,
    scale: respix, maxPixels: 1e9}).get('RBRc');
  var lblP50 = ui.Label('P50 RBRc: calculando...', {fontSize: '12px'});
  panelResultados.add(lblP50);
  p50.evaluate(function (v) {
    lblP50.setValue('P50 RBRc: ' + (v === null ? 'sin datos' : v.toFixed(1)) +
      ' | umbral óptimo (0.5 x P50): ' + (v === null ? '-' : (v * 0.5).toFixed(0)));
  });

  agregarAreasPorClase(sevTropical, aoi, respix, 'Área por clase (tropical)',
                       [2, 3, 4, 5], NOMBRES_UJED);

  var utm = epsgUTM(aoi);
  var base = IDCPC + '_' + MES;
  RESULTADOS = {tipo: 'UJED', region: extent, escala: respix, crs: utm.epsg,
                carpeta: carpeta, zona: utm.zona};

  construirPanelDescarga([
    {etiqueta: 'Severidad templado/semiárido', imagen: sevTemplado,
     nombre: base + '_Severidad_templado', vis: VIS_UJED, vector: true},
    {etiqueta: 'Severidad tropical', imagen: sevTropical,
     nombre: base + '_Severidad_tropical', vis: VIS_UJED, vector: true}
  ]);
}

//==========================================================================
// 9. METODOLOGÍA 2 - FAO
//==========================================================================
function correrFAO(aoi) {
  var preIni  = campos.preIni.getValue();
  var preFin  = campos.preFin.getValue();
  var posIni  = campos.posIni.getValue();
  var posFin  = campos.posFin.getValue();
  var plat    = campos.plat.getValue();
  var carpeta = campos.carpeta.getValue();

  var p = definirPlataforma(plat);
  var esS2 = (p.familia === 'S2');
  var escala = p.escala;
  var enmascarar = esS2 ? mascaraS2 : mascaraL;

  var preCM  = p.col.filterDate(preIni, preFin).filterBounds(aoi)
                 .map(enmascarar).median().clip(aoi);
  var postCM = p.col.filterDate(posIni, posFin).filterBounds(aoi)
                 .map(enmascarar).median().clip(aoi);

  var preNBR, postNBR;
  if (esS2) {
    preNBR  = preCM.normalizedDifference(['B8', 'B12']).rename('preNBR');
    postNBR = postCM.normalizedDifference(['B8', 'B12']).rename('postNBR');
  } else {
    preNBR  = preCM.normalizedDifference(['SR_B5', 'SR_B7']).rename('preNBR');
    postNBR = postCM.normalizedDifference(['SR_B5', 'SR_B7']).rename('postNBR');
  }

  var dNBR = preNBR.subtract(postNBR).multiply(1000).rename('dNBR');

  var clasificadoRaw = ee.Image(0)
    .where(dNBR.gte(-500).and(dNBR.lt(100)), 1)
    .where(dNBR.gte(100).and(dNBR.lt(270)), 2)
    .where(dNBR.gte(270).and(dNBR.lt(440)), 3)
    .where(dNBR.gte(440).and(dNBR.lt(660)), 4)
    .where(dNBR.gte(660).and(dNBR.lte(1300)), 5)
    .rename('severidad').toInt();

  var clasificado = clasificadoRaw.updateMask(clasificadoRaw.gt(0))
    .updateMask(dNBR.mask()).clip(aoi);
  var dnbrClip = dNBR.clip(aoi);

  Map.addLayer(dnbrClip, VIS_GRIS, 'dNBR escala de grises', false);
  Map.addLayer(clasificado, VIS_FAO, 'dNBR clasificado');
  Map.addLayer(ee.FeatureCollection([ee.Feature(aoi)]).style(
    {color: '00909F', width: 2, fillColor: '00000000'}), {}, 'AOI');

  construirLeyenda('Clases del dNBR (FAO)', PALETA_FAO, NOMBRES_FAO);
  vistaPrevia(aoi, preIni, preFin, posIni, posFin, plat);

  panelResultados.add(separador('5. Resultados'));
  panelResultados.add(ui.Label('Plataforma: ' + p.nombre + ' | escala: ' + escala + ' m',
    {fontSize: '11.5px', margin: '4px 0'}));
  agregarAreasPorClase(clasificado, aoi, escala, 'Área por clase de severidad',
                       [1, 2, 3, 4, 5], NOMBRES_FAO);

  var utm = epsgUTM(aoi);
  var base = 'dNBR_Guatemala_' + p.nombre;
  RESULTADOS = {tipo: 'FAO', region: aoi, escala: escala, crs: utm.epsg,
                carpeta: carpeta, zona: utm.zona};

  construirPanelDescarga([
    {etiqueta: 'dNBR clasificado', imagen: clasificado,
     nombre: 'dNBR_clasificado_' + p.nombre, vis: VIS_FAO, vector: true},
    {etiqueta: 'dNBR continuo (escala de grises)', imagen: dnbrClip,
     nombre: base, vis: VIS_GRIS, vector: false}
  ]);
}

//==========================================================================
// 10. ÁREA POR CLASE
//==========================================================================
function agregarAreasPorClase(imagenClases, aoi, escala, titulo, clases, nombres) {
  panelResultados.add(ui.Label(titulo, {fontWeight: 'bold', fontSize: '12px',
    margin: '8px 0 2px 0'}));
  var lblCarga = ui.Label('Calculando superficies...', {fontSize: '11.5px', color: '#666'});
  panelResultados.add(lblCarga);

  var stats = ee.Image.pixelArea().divide(10000).rename('hectareas')
    .addBands(imagenClases)
    .reduceRegion({
      reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'clase'}),
      geometry: aoi, scale: escala, maxPixels: 1e13, bestEffort: true});

  stats.evaluate(function (res) {
    lblCarga.style().set('shown', false);
    if (!res || !res.groups || res.groups.length === 0) {
      panelResultados.add(ui.Label('Sin píxeles clasificados en el AOI.',
        {fontSize: '11.5px', color: '#b3261e'}));
      return;
    }
    var total = 0;
    res.groups.forEach(function (g) {
      var idx = clases.indexOf(g.clase);
      var nombre = idx >= 0 ? nombres[idx] : ('Clase ' + g.clase);
      total += g.sum;
      panelResultados.add(ui.Label(nombre + ': ' + g.sum.toFixed(2) + ' ha',
        {fontSize: '11.5px', margin: '1px 0 1px 4px'}));
    });
    panelResultados.add(ui.Label('Total: ' + total.toFixed(2) + ' ha',
      {fontSize: '12px', fontWeight: 'bold', margin: '3px 0 0 4px'}));
  });
}

//==========================================================================
// 11. DESCARGAS  (Export a Drive -> pestaña Tasks del Code Editor)
//   Cada botón crea una tarea de exportación. Hay que abrir la pestaña Tasks
//   (arriba a la derecha) y presionar RUN en cada tarea; el archivo llega a la
//   carpeta de Google Drive indicada en el formulario.
//   Nota: esto NO funciona en una App publicada, solo en el Code Editor.
//==========================================================================
var selEscalaDescarga;

// los nombres de tarea de GEE no admiten tildes, ñ ni espacios
function nombreSeguro(txt) {
  var map = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','Á':'A','É':'E','Í':'I',
             'Ó':'O','Ú':'U','ñ':'n','Ñ':'N','ü':'u','Ü':'U'};
  var out = '';
  for (var i = 0; i < txt.length; i++) {
    var c = txt.charAt(i);
    out += (map[c] || c);
  }
  return out.replace(/[^A-Za-z0-9_\-\.]/g, '_');
}

function escalaSalida() {
  return Number(selEscalaDescarga.getValue()) || RESULTADOS.escala;
}

function construirPanelDescarga(productos) {
  panelDescarga.clear();
  panelDescarga.add(separador('6. Descargar'));
  panelDescarga.add(ui.Label('Zona UTM detectada: ' + RESULTADOS.zona +
    ' (' + RESULTADOS.crs + ')', {fontSize: '11.5px', color: '#555', margin: '4px 0'}));
  panelDescarga.add(ui.Label('Carpeta de Drive: ' + RESULTADOS.carpeta,
    {fontSize: '11.5px', color: '#555', margin: '0 0 4px 0'}));

  selEscalaDescarga = ui.Select({
    items: [
      {label: 'Resolución nativa (' + RESULTADOS.escala + ' m)', value: String(RESULTADOS.escala)},
      {label: '20 m', value: '20'},
      {label: '30 m', value: '30'},
      {label: '100 m', value: '100'}],
    value: String(RESULTADOS.escala), style: {width: '185px', margin: '3px 0'}});
  panelDescarga.add(ui.Panel([
    ui.Label('Resolución de salida', {fontSize: '12px', margin: '7px 6px 0 0', width: '155px'}),
    selEscalaDescarga], ui.Panel.Layout.flow('horizontal')));

  panelDescarga.add(ui.Label(
    'Las exportaciones se envían a la pestaña Tasks: ábrala y presione RUN en cada tarea.',
    {fontSize: '10.5px', color: '#777', margin: '0 0 6px 2px'}));

  productos.forEach(function (prod) { panelDescarga.add(bloqueProducto(prod)); });

  panelDescarga.add(ui.Button({
    label: 'Enviar todos a Tasks',
    style: {stretch: 'horizontal', margin: '10px 0 2px 0'},
    onClick: function () {
      productos.forEach(function (prod) { exportarRaster(prod, null); });
      mensaje('Tareas creadas. Abra la pestaña Tasks y presione RUN.', '#1a3c2f');
    }
  }));
}

function bloqueProducto(prod) {
  var bloque = ui.Panel({style: {margin: '8px 0 0 0'}});
  bloque.add(ui.Label(prod.etiqueta, {fontWeight: 'bold', fontSize: '12px',
    margin: '2px 0 2px 0'}));

  var lblEstado = ui.Label('', {fontSize: '11.5px', color: '#1a73e8', margin: '2px 0 0 2px'});

  bloque.add(ui.Panel([
    ui.Button({label: 'GeoTIFF a Tasks', style: {stretch: 'horizontal'},
      onClick: function () { exportarRaster(prod, lblEstado); }}),
    ui.Button({label: 'Ver en el mapa', style: {stretch: 'horizontal'},
      onClick: function () { Map.addLayer(prod.imagen, prod.vis, prod.etiqueta); }})
  ], ui.Panel.Layout.flow('horizontal'), {margin: '2px 0'}));

  if (prod.vector) {
    bloque.add(ui.Button({label: 'Vectorizar a SHP y enviar a Tasks',
      style: {stretch: 'horizontal', margin: '2px 0'},
      onClick: function () { exportarVector(prod, lblEstado); }}));
  }

  bloque.add(lblEstado);
  return bloque;
}

function exportarRaster(prod, lblEstado) {
  var escala = escalaSalida();
  var nombre = nombreSeguro(prod.nombre + '_' + escala + 'm');
  Export.image.toDrive({
    image: prod.imagen,
    description: nombre,
    folder: nombreSeguro(RESULTADOS.carpeta),
    fileNamePrefix: nombre,
    region: RESULTADOS.region,
    scale: escala,
    crs: RESULTADOS.crs,
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });
  if (lblEstado) {
    lblEstado.setValue('Tarea creada: ' + nombre + '.tif  (abra Tasks y presione RUN)');
    lblEstado.style().set('color', '#1a3c2f');
  }
}

function exportarVector(prod, lblEstado) {
  var escala = escalaSalida();
  var nombre = nombreSeguro(prod.nombre + '_' + escala + 'm_poligonos');
  var vect = prod.imagen.toInt().reduceToVectors({
    geometry: RESULTADOS.region,
    scale: escala,
    crs: RESULTADOS.crs,
    geometryType: 'polygon',
    eightConnected: false,
    labelProperty: 'clase',
    maxPixels: 1e13
  });
  Export.table.toDrive({
    collection: vect,
    description: nombre,
    folder: nombreSeguro(RESULTADOS.carpeta),
    fileNamePrefix: nombre,
    fileFormat: 'SHP'
  });
  if (lblEstado) {
    lblEstado.setValue('Tarea creada: ' + nombre + '.shp  (abra Tasks y presione RUN)');
    lblEstado.style().set('color', '#1a3c2f');
  }
}

//==========================================================================
// 12. EJECUCIÓN
//==========================================================================
function ejecutar() {
  var aoi = obtenerAOI();
  limpiarSalidas();

  if (aoi === null) {
    mensaje(selFuente.getValue() === 'REGION'
      ? 'Primero seleccione una región REDD+.'
      : 'Primero dibuje el área de interés sobre el mapa.');
    return;
  }

  Map.centerObject(aoi, selFuente.getValue() === 'REGION' ? 8 : 12);

  if (selMetodologia.getValue() === 'UJED') correrUJED(aoi);
  else correrFAO(aoi);
}

//==========================================================================
// 13. INICIO
//==========================================================================
Map.setOptions('SATELLITE');
Map.setCenter(-90.5, 15.5, 7);
construirPanelAOI();
construirFormulario();
