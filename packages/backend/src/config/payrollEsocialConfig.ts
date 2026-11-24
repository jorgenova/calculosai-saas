import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EsocialDocument, EsocialEnvironment } from '../domain/payrollEsocialXml';

function environmentValue(environment: EsocialEnvironment, key: string) {
  return process.env['ESOCIAL_' + environment.toUpperCase() + '_' + key];
}

export async function esocialConfiguration(environment: EsocialEnvironment) {
  const certificatePath = environmentValue(environment, 'CERTIFICATE_PEM');
  const keyPath = environmentValue(environment, 'KEY_PEM');
  const transmitter = environmentValue(environment, 'TRANSMITTER');
  const schemas = environmentValue(environment, 'XSD_DIRECTORY');
  if (!certificatePath || !keyPath || !transmitter || !schemas
    || !/^(?:\d{11}|[0-9A-Z]{12}\d{2})$/.test(transmitter)) return null;
  const [certificate, key] = await Promise.all([readFile(certificatePath, 'utf8'), readFile(keyPath, 'utf8')]);
  return { credential: { certificate, key, passphrase: environmentValue(environment, 'KEY_PASSPHRASE') }, transmitter, schemas };
}

export function esocialTransmissionEnabled(environment: EsocialEnvironment) {
  return environmentValue(environment, 'TRANSMISSION') === 'enabled';
}

export function validateEsocialDocument(document: EsocialDocument, schemas: string) {
  return new Promise<void>((resolve, reject) => {
    const command = spawn('xmllint', ['--nonet', '--noout', '--schema', join(schemas, document.schema), '-'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 10000,
    });
    command.on('error', reject);
    command.on('exit', exit => exit === 0 ? resolve() : reject(new Error('eSocial XSD validation failed')));
    command.stdin.on('error', reject);
    command.stdin.end(document.xml);
  });
}
