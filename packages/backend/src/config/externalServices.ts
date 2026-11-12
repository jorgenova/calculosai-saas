export type ExternalServicesMode = 'live' | 'mock';

const configuredMode = process.env.EXTERNAL_SERVICES_MODE ?? 'live';
const nodeEnvironment = process.env.NODE_ENV;
const localDatabaseHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (configuredMode !== 'live' && configuredMode !== 'mock') {
  throw new Error(
    `EXTERNAL_SERVICES_MODE invalido: ${configuredMode}. Use "live" ou "mock".`
  );
}

export const externalServicesMode: ExternalServicesMode = configuredMode;
export const externalServicesMocked = externalServicesMode === 'mock';

if (externalServicesMocked) {
  if (nodeEnvironment !== 'test' && nodeEnvironment !== 'development') {
    throw new Error(
      'EXTERNAL_SERVICES_MODE=mock so pode ser usado com NODE_ENV=test ou development.'
    );
  }

  const databaseUrl = process.env.DATABASE_URL_APP;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL_APP e obrigatoria no modo mock.');
  }

  let databaseHost: string;
  try {
    databaseHost = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL_APP invalida no modo mock.');
  }

  if (!localDatabaseHosts.has(databaseHost)) {
    throw new Error(
      `Modo mock recusado para banco nao local (${databaseHost}).`
    );
  }
}

export const exposeMockInviteToken =
  externalServicesMocked && process.env.MOCK_EXPOSE_INVITE_TOKEN === 'true';
