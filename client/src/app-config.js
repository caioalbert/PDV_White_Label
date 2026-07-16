const DEFAULT_COMPANY_NAME = 'Sistema de Gest\u00e3o';

let appConfig = {
  nome_empresa: DEFAULT_COMPANY_NAME,
};
let loadPromise = null;

function normalizeCompanyName(value) {
  const name = String(value || '').trim();
  return name || DEFAULT_COMPANY_NAME;
}

export function getCompanyName() {
  return normalizeCompanyName(appConfig.nome_empresa);
}

export function getCompanyLogoAlt() {
  return `${getCompanyName()} logo`;
}

export function applyCompanyMetadata() {
  const name = getCompanyName();
  document.title = `${name} - ERP`;
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    `Sistema de Gest\u00e3o - ${name}`
  );
}

export async function loadAppConfig({ force = false } = {}) {
  if (!force && loadPromise) return loadPromise;

  loadPromise = fetch('/api/configuracoes/public')
    .then(async (response) => {
      if (!response.ok) throw new Error('N\u00e3o foi poss\u00edvel carregar as configura\u00e7\u00f5es da aplica\u00e7\u00e3o');
      return response.json();
    })
    .then((data) => {
      appConfig = {
        ...appConfig,
        ...data,
        nome_empresa: normalizeCompanyName(data?.nome_empresa),
      };
      applyCompanyMetadata();
      window.dispatchEvent(new CustomEvent('appConfigChanged', { detail: appConfig }));
      return appConfig;
    })
    .catch(() => {
      applyCompanyMetadata();
      return appConfig;
    });

  return loadPromise;
}

export function updateCachedAppConfig(config) {
  appConfig = {
    ...appConfig,
    ...config,
    nome_empresa: normalizeCompanyName(config?.nome_empresa ?? appConfig.nome_empresa),
  };
  applyCompanyMetadata();
  window.dispatchEvent(new CustomEvent('appConfigChanged', { detail: appConfig }));
  return appConfig;
}
