// Screen 1 — Environment list

import { getStorage } from '../../shared/storage.js';
import { escHtml, shortenUrl } from '../utils.js';

const searchInput = document.getElementById('search-input');
const envList     = document.getElementById('env-list');

/** Wire up the environment list view.
 *  @param {{ onEdit: (env) => void, onAdd: () => void, onSettings: () => void }} callbacks
 */
export function init({ onEdit, onAdd, onSettings }) {
  document.getElementById('btn-settings').addEventListener('click', onSettings);
  document.getElementById('btn-add').addEventListener('click', onAdd);
  searchInput.addEventListener('input', () => renderList(searchInput.value));
  chrome.storage.onChanged.addListener(() => renderList(searchInput.value));

  renderList();

  // expose onEdit so renderList can call it per-row
  envList._onEdit = onEdit;
}

export async function renderList(filter = '') {
  const { environments } = await getStorage();
  const lower = filter.toLowerCase();
  const filtered = filter
    ? environments.filter((e) =>
        e.name.toLowerCase().includes(lower) || e.url.toLowerCase().includes(lower))
    : environments;

  envList.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.style.cssText = 'padding:16px 10px;text-align:center;color:var(--text-secondary);font-size:12px;';
    empty.textContent = filter ? 'No environments match.' : 'No environments yet. Add one below.';
    envList.appendChild(empty);
    return;
  }

  filtered.forEach((env) => {
    const li = document.createElement('li');
    li.className = 'env-row';
    li.dataset.id = env.id;

    li.innerHTML = `
      <div class="env-row-main" role="button" tabindex="0" aria-expanded="false">
        <span class="env-name">${escHtml(env.name)}</span>
        <span class="env-url">${escHtml(shortenUrl(env.url))}</span>
        <span class="env-dot" style="background:${escHtml(env.color)};"></span>
        <svg class="env-chevron" viewBox="0 0 10 10" width="10" height="10" fill="none" aria-hidden="true">
          <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="env-quick-links">
        <a class="quick-link" href="${escHtml(env.url)}/?mi=SysUserSetup" target="_blank">User options</a>
        ${env.tableBrowser ? `<a class="quick-link" href="${escHtml(env.url)}/?mi=SysTableBrowser" target="_blank">Table browser</a>` : ''}
        <a class="quick-link" href="${escHtml(env.url)}/?mi=EventTracking" target="_blank">DB log</a>
        <button class="quick-link edit-btn" data-id="${escHtml(env.id)}">Edit ✎</button>
      </div>
    `;

    const main = li.querySelector('.env-row-main');

    main.addEventListener('click', (e) => {
      if (e.target.closest('.env-chevron')) {
        e.stopPropagation();
        const expanded = li.classList.toggle('expanded');
        main.setAttribute('aria-expanded', expanded);
        return;
      }
      navigateTo(env.url, e);
    });

    main.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateTo(env.url, e);
      }
    });

    li.querySelector('.edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      envList._onEdit?.(env);
    });

    envList.appendChild(li);
  });
}

function navigateTo(url, e) {
  if (e.ctrlKey) {
    chrome.tabs.create({ url });
  } else if (e.shiftKey) {
    chrome.windows.create({ url });
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.update(tab.id, { url });
    });
    window.close();
  }
}
