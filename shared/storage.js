// Typed helpers around chrome.storage.local
// Schema: { environments: Environment[], defaults: DefaultSettings, customCommands: CustomCommands, version: number }

const STORAGE_VERSION = 1;

/** @returns {Promise<{environments: Environment[], defaults: DefaultSettings, version: number}>} */
export async function getStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['environments', 'defaults', 'version'], (data) => {
      resolve({
        environments: data.environments ?? [],
        defaults: data.defaults ?? defaultSettings(),
        version: data.version ?? STORAGE_VERSION,
      });
    });
  });
}

export async function saveEnvironment(env) {
  const { environments } = await getStorage();
  const idx = environments.findIndex((e) => e.id === env.id);
  if (idx >= 0) {
    environments[idx] = env;
  } else {
    environments.push({ ...env, id: env.id ?? crypto.randomUUID() });
  }
  return chrome.storage.local.set({ environments });
}

export async function deleteEnvironment(id) {
  const { environments } = await getStorage();
  return chrome.storage.local.set({ environments: environments.filter((e) => e.id !== id) });
}

export async function getDefaults() {
  const { defaults } = await getStorage();
  return defaults;
}

export async function saveDefaults(defaults) {
  return chrome.storage.local.set({ defaults });
}

export async function getCustomCommands() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customCommands'], (data) => {
      resolve(data.customCommands ?? { menuItems: [], odataEntities: [] });
    });
  });
}

export async function saveCustomCommands(customCommands) {
  return chrome.storage.local.set({ customCommands });
}

function defaultSettings() {
  return {
    tableBrowser: false,
    showControlNames: false,
    classRunner: false,
    markerEnabled: false,
    markerPosition: 'top-left',
  };
}
