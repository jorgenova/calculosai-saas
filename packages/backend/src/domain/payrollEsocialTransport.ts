import { DOMParser, Element, XMLSerializer } from '@xmldom/xmldom';
import { request as httpsRequest } from 'node:https';
import { EsocialDocument, EsocialEnvironment } from './payrollEsocialXml';

const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const schema = 'http://www.esocial.gov.br/schema/lote/eventos/envio';
const service = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio';
const returnEventNamespace = 'http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0';
const operations = {
  submit: { method: 'EnviarLoteEventos', parameter: 'loteEventos', namespace: service + '/v1_1_0',
    host: 'webservices.envio.esocial.gov.br', path: 'enviarloteeventos/WsEnviarLoteEventos.svc',
    resultElement: 'retornoEnvioLoteEventos', resultNamespace: schema + '/retornoEnvio/v1_1_0' },
  query: { method: 'ConsultarLoteEventos', parameter: 'consulta', namespace: service + '/consulta/retornoProcessamento/v1_1_0',
    host: 'webservices.consulta.esocial.gov.br', path: 'consultarloteeventos/WsConsultarLoteEventos.svc',
    resultElement: 'retornoProcessamentoLoteEventos', resultNamespace: schema + '/retornoProcessamento/v1_3_0' },
} as const;

export type Operation = keyof typeof operations;
type Credential = { certificate: string; key: string; passphrase?: string };
type Status = { code: number; description: string; occurrences: { code: string; type: string; detail: string; location: string }[] };
export type EventOutcome = Status & { id: string; receipt: string | null; duplicate: boolean;
  totalizers: { type: string; xml: string }[] };
export type BatchOutcome = Status & { protocol: string | null; estimatedSeconds: number; events: EventOutcome[] };

export const esocialProtocol = /^[12]\.[1236789]\.\d{6}\.\d{19}$/;
const esocialReceipt = /^1\.\d\.\d{19}$/;

function protocolFor(environment: EsocialEnvironment, protocol: string) {
  return esocialProtocol.test(protocol) && (environment === 'production' ? protocol[2] === '1' : ['2', '3'].includes(protocol[2]));
}

export function outcomeForQueuedEvent(key: string, batch: BatchOutcome, operation: Operation) {
  if (operation === 'submit') {
    const acknowledged = [201, 202, 203].includes(batch.code) && batch.protocol;
    return { status: acknowledged ? 'sent' : batch.code >= 401 && batch.code <= 407 ? 'rejected' : 'indeterminate',
      receipt: null, protocol: acknowledged ? batch.protocol : null, result: null } as const;
  }
  const result = batch.events.find(event => event.id === key) ?? null;
  return {
    status: result?.receipt && [201, 202].includes(result.code) ? 'accepted' : result && result.code >= 400 ? 'rejected' : 'sent',
    receipt: result?.receipt ?? null, protocol: batch.protocol, result,
  } as const;
}

function child(parent: Element, name: string, namespace = parent.namespaceURI) {
  const result = children(parent, name, namespace);
  if (result.length > 1) throw new Error('Unexpected repeated eSocial element');
  return result[0];
}

function children(parent: Element, name: string, namespace = parent.namespaceURI) {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.localName === name && element.namespaceURI === namespace) result.push(element);
  }
  return result;
}

function content(parent: Element, name: string) { return child(parent, name)?.textContent?.trim() ?? ''; }

function status(element: Element | undefined): Status {
  if (!element) throw new Error('Missing eSocial response status');
  const code = content(element, 'cdResposta');
  if (!/^\d{3}$/.test(code)) throw new Error('Invalid eSocial response status');
  const detail = child(element, 'ocorrencias');
  return { code: Number(code), description: content(element, 'descResposta'),
    occurrences: detail ? children(detail, 'ocorrencia').map(row => ({
      code: content(row, 'codigo'), type: content(row, 'tipo'), detail: content(row, 'descricao'), location: content(row, 'localizacao'),
    })) : [] };
}

export function decodeEsocialBatch(operation: Operation, xml: string): BatchOutcome {
  if (Buffer.byteLength(xml) > 16 * 1024 * 1024 || /<!DOCTYPE/i.test(xml)) throw new Error('Invalid eSocial response');
  const document = new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (!root || root.localName !== 'Envelope' || root.namespaceURI !== soap) throw new Error('Invalid eSocial SOAP envelope');
  const { method, namespace, resultElement, resultNamespace } = operations[operation];
  const body = child(root, 'Body');
  const response = body && child(body, method + 'Response', namespace);
  const result = response && child(response, method + 'Result', namespace);
  const esocial = result && child(result, 'eSocial', resultNamespace);
  const batch = esocial && child(esocial, resultElement);
  if (!batch) throw new Error('Missing eSocial SOAP result');
  const batchStatus = child(batch, 'status');
  const batchData = status(batchStatus);
  const received = child(batch, 'dadosRecepcaoLote');
  const protocol = received ? content(received, 'protocoloEnvio') : '';
  if (protocol && !esocialProtocol.test(protocol)) throw new Error('Invalid eSocial lot protocol');
  const estimated = batchStatus && content(batchStatus, 'tempoEstimadoConclusao');
  const events = child(batch, 'retornoEventos');
  const serializer = new XMLSerializer();
  const outcomes = events ? children(events, 'evento').map(row => {
    const wrapper = child(row, 'retornoEvento');
    const resultRoot = wrapper && child(wrapper, 'eSocial', returnEventNamespace);
    const result = resultRoot && child(resultRoot, 'retornoEvento');
    const id = row.getAttribute('Id');
    if (!result || !id || !/^ID[12][0-9A-Z]{12}\d{21}$/.test(id) || result.getAttribute('Id') !== id) {
      throw new Error('Invalid event result identity');
    }
    const receiptGroup = child(result, 'recibo');
    const receipt = receiptGroup ? content(receiptGroup, 'nrRecibo') : '';
    if (receipt && !esocialReceipt.test(receipt)) throw new Error('Invalid event receipt');
    const totalizers = children(row, 'tot').map(total => ({ type: total.getAttribute('tipo') ?? '', xml: serializer.serializeToString(total) }));
    return { ...status(child(result, 'processamento')), id, receipt: receipt || null,
      duplicate: ['1', 'true'].includes(row.getAttribute('evtDupl') ?? ''), totalizers };
  }) : [];
  if (new Set(outcomes.map(outcome => outcome.id)).size !== outcomes.length) throw new Error('Repeated eSocial event result');
  return { ...batchData, protocol: protocol || null, estimatedSeconds: estimated && /^\d+$/.test(estimated) ? Number(estimated) : 0,
    events: outcomes };
}

export function esocialLot(root: string, transmitter: string, group: 2 | 3, documents: EsocialDocument[]) {
  if (!/^[0-9A-Z]{8}$/.test(root) || !/^(?:\d{11}|[0-9A-Z]{12}\d{2})$/.test(transmitter)
    || documents.length < 1 || documents.length > 50 || new Set(documents.map(row => row.id)).size !== documents.length) {
    throw new Error('Invalid eSocial lot');
  }
  const identity = (name: string, type: number, registration: string) =>
    `<${name}><tpInsc>${type}</tpInsc><nrInsc>${registration}</nrInsc></${name}>`;
  const events = documents.map(event => {
    if (!new RegExp('^ID1' + root + '0{6}\\d{19}$').test(event.id) || !event.xml.includes('Id="' + event.id + '"')
      || !event.xml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')) throw new Error('Invalid signed event');
    return `<evento Id="${event.id}">${event.xml}</evento>`;
  });
  return `<eSocial xmlns="${schema}/v1_1_1"><envioLoteEventos grupo="${group}">`
    + identity('ideEmpregador', 1, root) + identity('ideTransmissor', transmitter.length === 11 ? 2 : 1, transmitter)
    + '<eventos>' + events.join('') + '</eventos></envioLoteEventos></eSocial>';
}

function queryXml(protocol: string) {
  return `<eSocial xmlns="${schema}/consulta/retornoProcessamento/v1_0_0"><consultaLoteEventos>`
    + '<protocoloEnvio>' + protocol + '</protocoloEnvio></consultaLoteEventos></eSocial>';
}

type Exchange = (url: URL, body: string, action: string, credential: Credential) => Promise<string>;

function exchangeHttps(url: URL, body: string, action: string, credential: Credential): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: 'POST', minVersion: 'TLSv1.2', cert: credential.certificate,
      key: credential.key, passphrase: credential.passphrase, headers: {
        'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body), SOAPAction: '"' + action + '"',
      } }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('Unexpected eSocial HTTP status ' + response.statusCode));
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) request.destroy(new Error('eSocial response exceeds limit'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    const timeout = setTimeout(() => request.destroy(new Error('eSocial service timed out')), 30_000).unref();
    request.on('close', () => clearTimeout(timeout));
    request.on('error', reject);
    request.end(body);
  });
}

export function esocialTransport(environment: EsocialEnvironment, credential: Credential, exchange: Exchange = exchangeHttps) {
  async function call(operation: Operation, payload: string) {
    const endpoint = operations[operation];
    const hostname = environment === 'restricted' ? 'webservices.producaorestrita.esocial.gov.br' : endpoint.host;
    const url = new URL('https://' + hostname + '/servicos/empregador/' + endpoint.path);
    const action = endpoint.namespace + '/Servico' + endpoint.method + '/' + endpoint.method;
    const body = `<Envelope xmlns="${soap}"><Body><${endpoint.method} xmlns="${endpoint.namespace}">`
      + `<${endpoint.parameter}>${payload}</${endpoint.parameter}></${endpoint.method}></Body></Envelope>`;
    const result = decodeEsocialBatch(operation, await exchange(url, body, action, credential));
    if (result.protocol && !protocolFor(environment, result.protocol)) throw new Error('Inconsistent eSocial response environment');
    return result;
  }
  return {
    submit: (root: string, transmitter: string, group: 2 | 3, documents: EsocialDocument[]) => {
      const marker = '<tpAmb>' + (environment === 'restricted' ? 2 : 1) + '</tpAmb>';
      if (documents.some(event => !event.xml.includes(marker))) throw new Error('Inconsistent eSocial event environment');
      return call('submit', esocialLot(root, transmitter, group, documents));
    },
    query: (protocol: string) => {
      if (!protocolFor(environment, protocol)) throw new Error('Inconsistent eSocial protocol environment');
      return call('query', queryXml(protocol));
    },
  };
}
