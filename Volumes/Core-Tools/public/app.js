'use strict';

const cities = [
  { name: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241 },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
  { name: 'London', country: 'United Kingdom', lat: 51.5072, lon: -0.1276 },
  { name: 'New York', country: 'United States', lat: 40.7128, lon: -74.0060 },
  { name: 'Sao Paulo', country: 'Brazil', lat: -23.5558, lon: -46.6396 },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
  { name: 'Dubai', country: 'United Arab Emirates', lat: 25.2048, lon: 55.2708 },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
  { name: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 }
];

const WORLD_MAP_URL = 'assets/world-map.svg';
const MAP_LAYER_SELECTORS = {
  labels: 'g[id^="text_"]',
  countryBorders: '#LineCollection_1',
  stateBorders: '#LineCollection_2',
  cityMarkers: '#city-markers, #map-cursor'
};

const state = {
  selectedCity: null,
  mapSvg: null,
  originalViewBox: null,
  currentViewBox: null,
  drag: null
};

function panelTransparencyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 60;
  return Math.max(0, Math.min(100, amount));
}

function setPanelGlass(enabled, transparency = enabled ? 60 : 0) {
  const amount = enabled ? panelTransparencyValue(transparency) : 0;
  document.body.classList.toggle('panels-glass', amount > 0);
  document.body.style.setProperty('--panel-glass-alpha', String(1 - (amount / 100)));
}

const panelGlassParams = new URLSearchParams(location.search);
setPanelGlass(panelGlassParams.get('panel_glass') === '1', panelGlassParams.get('panel_transparency') || 60);
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.data && event.data.type === 'core-saas-panel-glass') {
    setPanelGlass(event.data.enabled, event.data.transparency);
  }
});

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function qsaFrom(root, selector) {
  return root ? [...root.querySelectorAll(selector)] : [];
}

function project(lat, lon) {
  const box = state.originalViewBox || { x: 0, y: 0, width: 960, height: 480 };
  return {
    x: box.x + ((lon + 180) / 360) * box.width,
    y: box.y + ((90 - lat) / 180) * box.height
  };
}

function unproject(x, y) {
  const box = state.originalViewBox || { x: 0, y: 0, width: 960, height: 480 };
  return {
    lat: 90 - ((y - box.y) / box.height) * 180,
    lon: ((x - box.x) / box.width) * 360 - 180
  };
}

function distance(a, b) {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function selectPoint(point, city = null) {
  const nearest = cities.reduce((best, item) => {
    const km = distance(point, item);
    return km < best.km ? { city: item, km } : best;
  }, { city: null, km: Infinity });
  const pos = project(point.lat, point.lon);
  const cursor = state.mapSvg?.querySelector('#map-cursor');
  if (cursor) {
    cursor.setAttribute('cx', pos.x);
    cursor.setAttribute('cy', pos.y);
  }
  qs('#selected-lat').textContent = point.lat.toFixed(4);
  qs('#selected-lon').textContent = point.lon.toFixed(4);
  qs('#nearest-city').textContent = nearest.city ? `${nearest.city.name} (${Math.round(nearest.km)} km)` : 'Unknown';
  state.selectedCity = city;
  [...qsaFrom(state.mapSvg, '.city-marker'), ...qsa('.city-button')].forEach(el => {
    const isActive = el.dataset.name === city?.name;
    el.classList.toggle('active', isActive);
    if (el.classList.contains('city-marker')) el.setAttribute('r', isActive ? 7 : 5);
  });
}

function renderCities(filter = '') {
  const markerRoot = state.mapSvg?.querySelector('#city-markers');
  const listRoot = qs('#city-list');
  if (markerRoot) markerRoot.innerHTML = '';
  listRoot.innerHTML = '';
  const normalized = filter.trim().toLowerCase();
  const visible = cities.filter(city => `${city.name} ${city.country}`.toLowerCase().includes(normalized));
  visible.forEach(city => {
    if (markerRoot) {
      const pos = project(city.lat, city.lon);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('class', 'city-marker');
      marker.setAttribute('cx', pos.x);
      marker.setAttribute('cy', pos.y);
      marker.setAttribute('r', 5);
      marker.dataset.name = city.name;
      marker.addEventListener('click', () => selectPoint(city, city));
      markerRoot.append(marker);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-button';
    button.dataset.name = city.name;
    button.textContent = `${city.name}, ${city.country}`;
    button.addEventListener('click', () => selectPoint(city, city));
    listRoot.append(button);
  });
  if (state.mapSvg) applyMapToggles();
}

function parseViewBox(svg) {
  const values = (svg.getAttribute('viewBox') || '0 0 960 480').split(/\s+/).map(Number);
  const [x, y, width, height] = values.every(Number.isFinite) ? values : [0, 0, 960, 480];
  return { x, y, width, height };
}

function setMapViewBox(box) {
  if (!box) return;
  state.currentViewBox = { ...box };
  state.mapSvg?.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
}

function zoomMap(factor, anchor = null) {
  if (!state.currentViewBox || !state.originalViewBox) return;
  const current = state.currentViewBox;
  const minWidth = state.originalViewBox.width * 0.04;
  const nextWidth = Math.max(minWidth, Math.min(state.originalViewBox.width, current.width / factor));
  const nextHeight = nextWidth * (current.height / current.width);
  const focus = anchor || { x: current.x + current.width / 2, y: current.y + current.height / 2 };
  const ratioX = (focus.x - current.x) / current.width;
  const ratioY = (focus.y - current.y) / current.height;
  setMapViewBox({
    x: focus.x - nextWidth * ratioX,
    y: focus.y - nextHeight * ratioY,
    width: nextWidth,
    height: nextHeight
  });
}

function panMap(direction) {
  if (!state.currentViewBox) return;
  const box = state.currentViewBox;
  const dx = box.width * 0.18;
  const dy = box.height * 0.18;
  const offsets = {
    up: { x: 0, y: -dy },
    down: { x: 0, y: dy },
    left: { x: -dx, y: 0 },
    right: { x: dx, y: 0 }
  };
  const offset = offsets[direction] || { x: 0, y: 0 };
  setMapViewBox({ ...box, x: box.x + offset.x, y: box.y + offset.y });
}

function svgPointFromEvent(event) {
  if (!state.mapSvg) return null;
  const point = state.mapSvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(state.mapSvg.getScreenCTM().inverse());
}

function setLayerVisibility(selector, visible) {
  qsaFrom(state.mapSvg, selector).forEach(layer => {
    layer.classList.toggle('map-layer-hidden', !visible);
  });
}

function applyMapToggles() {
  setLayerVisibility(MAP_LAYER_SELECTORS.labels, qs('#toggle-country-labels').checked);
  setLayerVisibility(MAP_LAYER_SELECTORS.countryBorders, qs('#toggle-country-borders').checked);
  setLayerVisibility(MAP_LAYER_SELECTORS.stateBorders, qs('#toggle-state-borders').checked);
  setLayerVisibility(MAP_LAYER_SELECTORS.cityMarkers, qs('#toggle-city-markers').checked);
}

async function loadWorldMap() {
  const stage = qs('#world-map-stage');
  try {
    const response = await fetch(WORLD_MAP_URL);
    if (!response.ok) throw new Error(`Map failed to load (${response.status})`);
    stage.innerHTML = await response.text();
    const svg = stage.querySelector('svg');
    if (!svg) throw new Error('Map SVG did not contain an <svg> root.');
    svg.id = 'world-svg';
    svg.classList.add('world-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Interactive world map');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    state.mapSvg = svg;
    state.originalViewBox = parseViewBox(svg);
    setMapViewBox(state.originalViewBox);

    const markerRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerRoot.id = 'city-markers';
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    cursor.id = 'map-cursor';
    cursor.setAttribute('class', 'cursor-dot');
    cursor.setAttribute('r', '7');
    svg.append(markerRoot, cursor);
    applyMapToggles();
    renderCities(qs('#city-search').value);
    selectPoint({ lat: 0, lon: 0 });
  } catch (error) {
    stage.innerHTML = `<p class="map-loading error">Unable to load world map: ${error.message}</p>`;
  }
}

function encodeBase64() {
  const input = qs('#base64-input').value;
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  qs('#base64-output').value = btoa(binary);
  setBase64Status('Encoded input as UTF-8 Base64.');
}

function decodeBase64() {
  try {
    const input = qs('#base64-input').value.trim();
    const binary = atob(input);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    qs('#base64-output').value = new TextDecoder().decode(bytes);
    setBase64Status('Decoded Base64 input.');
  } catch {
    setBase64Status('Input is not valid Base64.', true);
  }
}

function setBase64Status(text, isError = false) {
  const status = qs('#base64-status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function polarPoint(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}

function sectorPath(radius, start, end) {
  const a = polarPoint(radius, start);
  const b = polarPoint(radius, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M 0 0 L ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)} Z`;
}

function renderSectors() {
  const count = Math.max(1, Math.min(72, Number(qs('#sector-count').value) || 1));
  const radius = Math.max(10, Math.min(1000, Number(qs('#sector-radius').value) || 120));
  const start = Number(qs('#sector-start').value) || 0;
  const prefix = qs('#sector-prefix').value.trim() || 'Sector';
  const step = 360 / count;
  const svg = qs('#sector-svg');
  const scaleRadius = 132;
  const data = [];
  svg.innerHTML = '';
  for (let i = 0; i < count; i += 1) {
    const startAngle = start + i * step;
    const endAngle = startAngle + step;
    const fill = i % 2 === 0 ? '#d7eef3' : '#eef6f8';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', sectorPath(scaleRadius, startAngle, endAngle));
    path.setAttribute('fill', fill);
    path.setAttribute('class', 'sector-slice');
    svg.append(path);

    const labelAngle = startAngle + step / 2;
    const labelPos = polarPoint(scaleRadius * 0.62, labelAngle);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelPos.x.toFixed(2));
    text.setAttribute('y', labelPos.y.toFixed(2));
    text.setAttribute('class', 'sector-label');
    text.textContent = `${i + 1}`;
    svg.append(text);

    data.push({
      id: i + 1,
      label: `${prefix} ${i + 1}`,
      startAngle: Number(startAngle.toFixed(3)),
      endAngle: Number(endAngle.toFixed(3)),
      centerAngle: Number(labelAngle.toFixed(3)),
      radius
    });
  }
  qs('#sector-json').value = JSON.stringify(data, null, 2);
}

function setupNavigation() {
  qsa('.menu-item').forEach(button => {
    button.addEventListener('click', () => {
      qsa('.menu-item').forEach(item => item.classList.toggle('active', item === button));
      qsa('.tool-view').forEach(view => view.classList.toggle('active', view.id === button.dataset.tool));
    });
  });
}

function setupMap() {
  loadWorldMap();
  qs('#city-search').addEventListener('input', event => renderCities(event.target.value));
  qsa('.pan-button').forEach(button => {
    button.addEventListener('click', () => panMap(button.dataset.pan));
  });
  qs('#zoom-in').addEventListener('click', () => zoomMap(1.35));
  qs('#zoom-out').addEventListener('click', () => zoomMap(1 / 1.35));
  qs('#reset-map').addEventListener('click', () => setMapViewBox(state.originalViewBox));
  [
    '#toggle-country-labels',
    '#toggle-country-borders',
    '#toggle-state-borders',
    '#toggle-city-markers'
  ].forEach(selector => qs(selector).addEventListener('change', applyMapToggles));

  qs('#world-map-stage').addEventListener('click', event => {
    if (!state.mapSvg || event.target.classList.contains('city-marker') || state.drag?.moved) return;
    const local = svgPointFromEvent(event);
    if (!local) return;
    selectPoint(unproject(local.x, local.y));
  });
  qs('#world-map-stage').addEventListener('wheel', event => {
    if (!state.mapSvg) return;
    event.preventDefault();
    zoomMap(event.deltaY < 0 ? 1.18 : 1 / 1.18, svgPointFromEvent(event));
  }, { passive: false });
  qs('#world-map-stage').addEventListener('pointerdown', event => {
    if (!state.mapSvg || event.button !== 0 || event.target.classList.contains('city-marker')) return;
    qs('#world-map-stage').setPointerCapture(event.pointerId);
    state.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...state.currentViewBox },
      moved: false
    };
    qs('#world-map-stage').classList.add('dragging');
  });
  qs('#world-map-stage').addEventListener('pointermove', event => {
    if (!state.drag || !state.mapSvg) return;
    const rect = state.mapSvg.getBoundingClientRect();
    const dx = (event.clientX - state.drag.startX) / rect.width * state.drag.box.width;
    const dy = (event.clientY - state.drag.startY) / rect.height * state.drag.box.height;
    if (Math.abs(event.clientX - state.drag.startX) + Math.abs(event.clientY - state.drag.startY) > 3) {
      state.drag.moved = true;
    }
    setMapViewBox({
      ...state.drag.box,
      x: state.drag.box.x - dx,
      y: state.drag.box.y - dy
    });
  });
  qs('#world-map-stage').addEventListener('pointerup', event => {
    if (!state.drag) return;
    qs('#world-map-stage').releasePointerCapture(event.pointerId);
    qs('#world-map-stage').classList.remove('dragging');
    window.setTimeout(() => { state.drag = null; }, 0);
  });
  qs('#world-map-stage').addEventListener('pointercancel', () => {
    state.drag = null;
    qs('#world-map-stage').classList.remove('dragging');
  });
  document.addEventListener('keydown', event => {
    if (!qs('#world-map').classList.contains('active')) return;
    const keys = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right'
    };
    if (keys[event.key]) {
      event.preventDefault();
      panMap(keys[event.key]);
    }
    if (event.key === '+' || event.key === '=') zoomMap(1.25);
    if (event.key === '-' || event.key === '_') zoomMap(1 / 1.25);
    if (event.key === '0') setMapViewBox(state.originalViewBox);
  });
}

function setupBase64() {
  qs('#encode-button').addEventListener('click', encodeBase64);
  qs('#decode-button').addEventListener('click', decodeBase64);
  qs('#swap-button').addEventListener('click', () => {
    qs('#base64-input').value = qs('#base64-output').value;
    qs('#base64-output').value = '';
    setBase64Status('Moved output into input.');
  });
  encodeBase64();
}

function setupSectors() {
  ['#sector-count', '#sector-radius', '#sector-start', '#sector-prefix'].forEach(selector => {
    qs(selector).addEventListener('input', renderSectors);
  });
  qs('#copy-sector-json').addEventListener('click', async () => {
    await navigator.clipboard.writeText(qs('#sector-json').value);
  });
  renderSectors();
}

setupNavigation();
setupMap();
setupBase64();
setupSectors();
