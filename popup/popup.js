// popup.js — theme, view routing, and view wiring

import { init as initList, renderList } from './views/env-list.js';
import { init as initForm, open as openForm } from './views/env-form.js';
import { init as initSettings, load as loadSettings } from './views/settings.js';

// ── Theme ─────────────────────────────────────────────────────
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  document.documentElement.dataset.theme = prefersDark.matches ? 'dark' : 'light';
}
applyTheme();
prefersDark.addEventListener('change', applyTheme);

// ── View routing ──────────────────────────────────────────────
const viewEls = {
  list:     document.getElementById('view-list'),
  form:     document.getElementById('view-form'),
  settings: document.getElementById('view-settings'),
};

function showView(name) {
  Object.values(viewEls).forEach((v) => v.classList.add('hidden'));
  viewEls[name].classList.remove('hidden');
}

// ── Wire views ────────────────────────────────────────────────
initList({
  onEdit:     async (env) => { await openForm(env);   showView('form'); },
  onAdd:      async ()    => { await openForm(null);  showView('form'); },
  onSettings: ()    => { loadSettings(); showView('settings'); },
});

initForm({
  onBack:  () => showView('list'),
  onSaved: () => renderList(),
});

initSettings({
  onBack:     () => showView('list'),
  onImported: () => renderList(),
});

showView('list');
