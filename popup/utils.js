// Shared utilities: DOM helpers, colour math, toggle/position-picker wiring

export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function shortenUrl(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ── Colour conversion ─────────────────────────────────────────

export function hexToRgbStyle(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

export function hexToHsv(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h / 6 * 360;
  }
  return { h, s: max ? d / max * 100 : 0, v: max * 100 };
}

export function hsvToHex(h, s, v) {
  s /= 100; v /= 100;
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + toHex(f(5)) + toHex(f(3)) + toHex(f(1));
}

// ── Toggle helpers ────────────────────────────────────────────

export function setToggle(id, value) {
  document.getElementById(id).setAttribute('aria-checked', value ? 'true' : 'false');
}

export function getToggle(id) {
  return document.getElementById(id).getAttribute('aria-checked') === 'true';
}

export function wireToggle(id, positionWrapId) {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    setToggle(id, next);
    if (positionWrapId) setMarkerPositionWrap(positionWrapId, next);
  });
}

export function setMarkerPositionWrap(wrapId, visible) {
  document.getElementById(wrapId).classList.toggle('collapsed', !visible);
}

// ── Position-picker helpers ───────────────────────────────────

export function wirePositionGrid(gridId) {
  document.getElementById(gridId).querySelectorAll('.position-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectPosition(gridId, btn.dataset.pos));
  });
}

export function selectPosition(gridId, pos) {
  document.getElementById(gridId).querySelectorAll('.position-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.pos === pos);
  });
}

export function getSelectedPosition(gridId) {
  const sel = document.getElementById(gridId).querySelector('.position-btn.selected');
  return sel?.dataset.pos ?? 'top-left';
}
