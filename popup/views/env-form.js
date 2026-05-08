// Screen 2 — Add / Edit environment form (including colour picker)

import { getStorage, saveEnvironment, deleteEnvironment } from '../../shared/storage.js';
import {
  hexToHsv, hsvToHex, hexToRgbStyle,
  setToggle, getToggle, wireToggle,
  setMarkerPositionWrap, wirePositionGrid, selectPosition, getSelectedPosition,
} from '../utils.js';

const PRESETS = [
  '#0f6cbd', '#107c41', '#ca5010', '#c50f1f',
  '#8764b8', '#d4a017', '#038387', '#5c2e91',
  '#117865', '#a4262c', '#3a96dd', '#69797e',
  '#5c5c5c', '#e3008c', '#0078d4', '#1f1f1f',
];

// DOM refs
const colorSwatch = document.getElementById('color-swatch');
const colorPicker = document.getElementById('color-picker');
const svSquare    = document.getElementById('sv-square');
const svCursor    = document.getElementById('sv-cursor');
const hueWrap     = document.getElementById('hue-slider-wrap');
const hueThumb    = document.getElementById('hue-thumb');
const hexInput    = document.getElementById('hex-input');
const hexSwatch   = document.getElementById('hex-swatch');
const presetGrid  = document.getElementById('preset-grid');

let editingId  = null;
let pickerColor = { h: 211, s: 86, v: 74 };

/** Wire up the form view.
 *  @param {{ onBack: () => void, onSaved: () => void }} callbacks
 */
export function init({ onBack, onSaved }) {
  document.getElementById('btn-form-back').addEventListener('click', onBack);
  document.getElementById('btn-cancel').addEventListener('click', onBack);

  document.getElementById('env-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveForm(onBack, onSaved);
  });
  document.getElementById('btn-save').addEventListener('click', () => saveForm(onBack, onSaved));

  document.getElementById('btn-delete').addEventListener('click', async () => {
    if (!editingId) return;
    await deleteEnvironment(editingId);
    onSaved();
    onBack();
  });

  wireToggle('toggle-marker', 'marker-position-wrap');
  wireToggle('toggle-table-browser');
  wireToggle('toggle-control-names');
  wireToggle('toggle-class-runner');
  wirePositionGrid('position-grid');
  selectPosition('position-grid', 'top-left');

  initColorPicker();
}

/** Populate and show the form for a new or existing environment. */
export async function open(env) {
  editingId = env?.id ?? null;
  document.getElementById('form-title').textContent = env ? 'Edit environment' : 'Add environment';
  document.getElementById('btn-delete').style.display = env ? '' : 'none';
  document.getElementById('input-name').value = env?.name ?? '';
  document.getElementById('input-url').value  = env?.url  ?? '';

  const color = env?.color ?? await pickUnusedColor();
  setSwatchColor(color);
  pickerColor = hexToHsv(color);
  updatePickerUI();

  setToggle('toggle-marker', env?.markerEnabled ?? false);
  setMarkerPositionWrap('marker-position-wrap', env?.markerEnabled ?? false);
  selectPosition('position-grid', env?.markerPosition ?? 'top-left');
  setToggle('toggle-table-browser', env?.tableBrowser ?? false);
  setToggle('toggle-control-names', env?.showControlNames ?? false);
  setToggle('toggle-class-runner',  env?.classRunner    ?? false);
}

async function saveForm(onBack, onSaved) {
  const name = document.getElementById('input-name').value.trim();
  const url  = document.getElementById('input-url').value.trim();
  if (!name || !url) return;

  await saveEnvironment({
    id:             editingId ?? crypto.randomUUID(),
    name,
    url,
    color:          hsvToHex(pickerColor.h, pickerColor.s, pickerColor.v),
    markerEnabled:  getToggle('toggle-marker'),
    markerPosition: getSelectedPosition('position-grid'),
    tableBrowser:   getToggle('toggle-table-browser'),
    showControlNames: getToggle('toggle-control-names'),
    classRunner:    getToggle('toggle-class-runner'),
  });

  onSaved();
  onBack();
}

// ── Colour selection ──────────────────────────────────────────

async function pickUnusedColor() {
  const { environments } = await getStorage();
  const usedColors = new Set(environments.map((e) => e.color?.toLowerCase()));
  const unused = PRESETS.find((hex) => !usedColors.has(hex.toLowerCase()));
  return unused ?? PRESETS[0];
}

// ── Colour picker ─────────────────────────────────────────────

function initColorPicker() {
  colorSwatch.addEventListener('click', (e) => {
    e.stopPropagation();
    colorPicker.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!colorPicker.contains(e.target) && e.target !== colorSwatch) {
      colorPicker.classList.add('hidden');
    }
  });

  PRESETS.forEach((hex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-swatch';
    btn.style.background = hex;
    btn.title = hex;
    btn.addEventListener('click', () => {
      pickerColor = hexToHsv(hex);
      updatePickerUI();
      applyColor();
    });
    presetGrid.appendChild(btn);
  });

  // SV square drag
  let svDragging = false;
  svSquare.addEventListener('pointerdown', (e) => {
    svDragging = true;
    svSquare.setPointerCapture(e.pointerId);
    updateSV(e);
  });
  svSquare.addEventListener('pointermove', (e) => { if (svDragging) updateSV(e); });
  svSquare.addEventListener('pointerup', () => { svDragging = false; });

  // Hue slider drag
  let hueDragging = false;
  hueWrap.addEventListener('pointerdown', (e) => {
    hueDragging = true;
    hueWrap.setPointerCapture(e.pointerId);
    updateHue(e);
  });
  hueWrap.addEventListener('pointermove', (e) => { if (hueDragging) updateHue(e); });
  hueWrap.addEventListener('pointerup', () => { hueDragging = false; });

  // Hex input
  hexInput.addEventListener('input', () => {
    const raw = hexInput.value.replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(raw)) {
      pickerColor = hexToHsv('#' + raw);
      updatePickerUI();
      applyColor();
    }
  });
}

function updateSV(e) {
  const r = svSquare.getBoundingClientRect();
  pickerColor.s = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
  pickerColor.v = Math.max(0, Math.min(100, (1 - (e.clientY - r.top) / r.height) * 100));
  updatePickerUI();
  applyColor();
}

function updateHue(e) {
  const r = hueWrap.getBoundingClientRect();
  pickerColor.h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360));
  updatePickerUI();
  applyColor();
}

function updatePickerUI() {
  const { h, s, v } = pickerColor;
  svSquare.style.background = `hsl(${h}, 100%, 50%)`;
  svCursor.style.left = s + '%';
  svCursor.style.top  = (100 - v) + '%';
  hueThumb.style.left = (h / 360 * 100) + '%';
  const hex = hsvToHex(h, s, v);
  hexInput.value = hex;
  hexSwatch.style.background = hex;
}

function applyColor() {
  const hex = hsvToHex(pickerColor.h, pickerColor.s, pickerColor.v);
  setSwatchColor(hex);
  updatePresetSelection(hex);
}

function setSwatchColor(hex) {
  colorSwatch.style.background = hex;
}

function updatePresetSelection(hex) {
  presetGrid.querySelectorAll('.preset-swatch').forEach((btn) => {
    btn.classList.toggle('selected',
      btn.style.background === hexToRgbStyle(hex) || btn.title === hex);
  });
}
