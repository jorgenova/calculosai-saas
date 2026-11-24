import { createHash, createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { EngagementInput, isCivilDate } from './payrollPeople';

const eventNames = {
  'S-2200': 'evtAdmissao', 'S-2230': 'evtAfastTemp', 'S-2300': 'evtTSVInicio',
  'S-1200': 'evtRemun', 'S-1210': 'evtPgtos', 'S-1298': 'evtReabreEvPer', 'S-1299': 'evtFechaEvPer',
} as const;
export type EsocialEventType = keyof typeof eventNames;
export type EsocialEnvironment = 'restricted' | 'production';
export type EsocialHeader = { root: string; environment: EsocialEnvironment; id: string; receipt?: string };
export type EsocialDocument = { xml: string; schema: string; id: string };
type Field = [string, string | number | undefined | null];
const c14n = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ds = 'http://www.w3.org/2000/09/xmldsig#';

function escapeText(value: string) {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(value)) throw new Error('Invalid XML text');
  return value.replace(/[&<>\r]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\r': '&#xD;' })[char]!);
}

function group(name: string, body: string) { return '<' + name + '>' + body + '</' + name + '>'; }
function fields(...entries: Field[]) {
  return entries.filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => group(name, escapeText(String(value)))).join('');
}

export function esocialEventId(root: string, at: Date, sequence: number) {
  if (!/^[0-9A-Z]{8}$/.test(root) || !Number.isInteger(sequence) || sequence < 1 || sequence > 99999) {
    throw new Error('Invalid eSocial event identity');
  }
  const time = at.toISOString().slice(0, 19).replace(/\D/g, '');
  return 'ID1' + root.padEnd(14, '0') + time + String(sequence).padStart(5, '0');
}

function event(type: EsocialEventType, header: EsocialHeader, content: string, month?: string): EsocialDocument {
  const { root, environment, id, receipt } = header;
  const name = eventNames[type];
  if (!/^[0-9A-Z]{8}$/.test(root) || !new RegExp('^ID1' + root + '0{6}\\d{19}$').test(id)) throw new Error('Invalid employer event ID');
  if (month && !isCivilDate(month + '-01')) throw new Error('Invalid assessment period');
  const canAmend = type !== 'S-1298' && type !== 'S-1299';
  if (receipt && (!canAmend || !/^1\.\d\.\d{19}$/.test(receipt))) throw new Error('Invalid source receipt');
  const identification = group('ideEvento', fields(
    ['indRetif', canAmend ? receipt ? 2 : 1 : undefined], ['nrRecibo', receipt],
    ['indApuracao', month && type !== 'S-1210' ? 1 : undefined], ['perApur', month],
    ['tpAmb', environment === 'restricted' ? 2 : 1], ['procEmi', 1], ['verProc', '1.0'],
  ));
  const employer = group('ideEmpregador', fields(['tpInsc', 1], ['nrInsc', root]));
  const namespace = 'http://www.esocial.gov.br/schema/evt/' + name + '/v_S_01_03_00';
  return { id, schema: name + '.xsd', xml: `<eSocial xmlns="${namespace}"><${name} Id="${id}">${identification}${employer}${content}</${name}></eSocial>` };
}

export type EsocialDependent = {
  cpf: string | null; fullName: string; birthDate: string; relationship: string; relationshipDescription?: string;
  sex?: string; unableToWork?: boolean; incomeTax: boolean; familyAllowance: boolean;
};

function worker(person: EngagementInput['person'], dependents: EsocialDependent[], employment: boolean) {
  const d = person.details;
  const address = d.postalCode ? group('endereco', group('brasil', fields(
    ['tpLograd', d.streetType], ['dscLograd', d.street], ['nrLograd', d.streetNumber], ['complemento', d.addressComplement],
    ['bairro', d.neighborhood], ['cep', d.postalCode.replace(/-/g, '')], ['codMunic', d.municipalityCode], ['uf', d.state],
  ))) : '';
  const contact = fields(['fonePrinc', d.phone?.replace(/\D/g, '')], ['emailPrinc', d.email]);
  return group('trabalhador',
    fields(['cpfTrab', person.cpf], ['nmTrab', person.fullName], ['sexo', d.sex], ['racaCor', d.raceColor],
      ['estCiv', d.maritalStatus], ['grauInstr', d.education], ['nmSoc', d.socialName])
    + group('nascimento', fields(['dtNascto', person.birthDate], ['paisNascto', d.birthCountry], ['paisNac', d.nationality]))
    + address + dependents.map(dependent => group('dependente', fields(
      ['tpDep', dependent.relationship], ['nmDep', dependent.fullName], ['dtNascto', dependent.birthDate],
      ['cpfDep', dependent.cpf], ['sexoDep', dependent.sex], ['depIRRF', dependent.incomeTax ? 'S' : 'N'],
      ['depSF', dependent.familyAllowance ? 'S' : 'N'],
      ['incTrab', employment && dependent.unableToWork === undefined ? undefined : dependent.unableToWork ? 'S' : 'N'],
      ['descrDep', dependent.relationshipDescription],
    ))).join('') + (contact ? group('contato', contact) : ''));
}

const salaryUnits: Record<string, number> = { hour: 1, day: 2, week: 3, fortnight: 4, month: 5, task: 6, variable: 7 };

export function employeeAdmission(header: EsocialHeader, link: EngagementInput, compensation: { amount: string; unit: string },
  dependents: EsocialDependent[]) {
  const d = link.details;
  const unit = salaryUnits[compensation.unit];
  if (d.workRegime !== '1' || d.socialSecurityRegime !== '1' || d.admissionType !== '1'
    || !['101', '105', '111'].includes(link.categoryCode) || !unit) throw new Error('Unsupported admission regime');
  const contract = group('infoContrato',
    fields(['nmCargo', d.jobTitle], ['CBOCargo', d.occupationCode], ['codCateg', link.categoryCode])
    + group('remuneracao', fields(['vrSalFx', compensation.amount], ['undSalFixo', unit], ['dscSalVar', d.variableSalaryDescription]))
    + group('duracao', fields(['tpContr', d.contractType], ['dtTerm', d.contractEndDate],
      ['clauAssec', d.terminationClause], ['objDet', d.contractEndCondition]))
    + group('localTrabalho', group('localTrabGeral', fields(
      ['tpInsc', link.establishmentRegistration.length === 12 ? 4 : 1], ['nrInsc', link.establishmentRegistration],
    )))
    + (d.workTimeRegime === '1' ? group('horContratual', fields(
      ['qtdHrsSem', d.weeklyHours], ['tpJornada', d.journeyType], ['tmpParc', d.partTimeType],
      ['horNoturno', d.nightWork], ['dscJorn', d.schedule],
    )) : ''));
  const employment = group('vinculo',
    fields(['matricula', link.registration], ['tpRegTrab', d.workRegime], ['tpRegPrev', d.socialSecurityRegime], ['cadIni', 'N'])
    + group('infoRegimeTrab', group('infoCeletista', fields(
      ['dtAdm', link.startsOn], ['tpAdmissao', d.admissionType], ['indAdmissao', d.admissionIndicator],
      ['tpRegJor', d.workTimeRegime], ['natAtividade', d.activityNature],
      ['dtBase', d.collectiveBargainingMonth], ['cnpjSindCategProf', d.unionRegistration.replace(/[.\/-]/g, '')],
    ))) + contract);
  return event('S-2200', header, worker(link.person, dependents, true) + employment);
}

export function partnerRegistration(header: EsocialHeader, link: EngagementInput, dependents: EsocialDependent[]) {
  if (link.categoryCode !== '723' || link.details.registerWithEsocial !== 'yes') throw new Error('Partner registration is not enabled');
  return event('S-2300', header, worker(link.person, dependents, false)
    + group('infoTSVInicio', fields(['cadIni', 'N'], ['matricula', link.registration],
      ['codCateg', link.categoryCode], ['dtInicio', link.startsOn])));
}

export function temporaryLeave(header: EsocialHeader, link: EngagementInput, leave: {
  startsOn?: string; reason?: string; endsOn?: string; acquisitionStartsOn?: string; acquisitionEndsOn?: string;
}) {
  const start = leave.startsOn ? group('iniAfastamento', fields(['dtIniAfast', leave.startsOn], ['codMotAfast', leave.reason])
    + (leave.acquisitionStartsOn ? group('perAquis', fields(
      ['dtInicio', leave.acquisitionStartsOn], ['dtFim', leave.acquisitionEndsOn],
    )) : '')) : '';
  const end = leave.endsOn ? group('fimAfastamento', fields(['dtTermAfast', leave.endsOn])) : '';
  if (!link.registration || (!start && !end)) throw new Error('Missing temporary leave identity or dates');
  return event('S-2230', header, group('ideVinculo', fields(['cpfTrab', link.person.cpf], ['matricula', link.registration]))
    + group('infoAfastamento', start + end));
}

type Demonstrative = {
  id: string; category: string; registration?: string; establishment: string; allocation: string;
  incomeTaxSimpleIndicator?: string; harmfulExposure?: string;
  items: { code: string; table: string; amount: string }[];
};

export function payrollRemuneration(header: EsocialHeader, month: string, person: {
  cpf: string; name?: string; birthDate?: string;
  multipleEmployers?: { indicator: string; sources: { type: number; registration: string; category: string; amount: string }[] };
}, statements: Demonstrative[]) {
  if (!statements.length || statements.some(row => !row.items.length)
    || new Set(statements.map(row => row.id)).size !== statements.length) throw new Error('Invalid remuneration statements');
  const sources = person.multipleEmployers;
  const workerData = group('ideTrabalhador', fields(['cpfTrab', person.cpf])
    + (sources ? group('infoMV', fields(['indMV', sources.indicator])
      + sources.sources.map(source => group('remunOutrEmpr', fields(['tpInsc', source.type], ['nrInsc', source.registration],
        ['codCateg', source.category], ['vlrRemunOE', source.amount]))).join('')) : '')
    + (person.name && person.birthDate ? group('infoComplem', fields(['nmTrab', person.name], ['dtNascto', person.birthDate])) : ''));
  const demonstratives = statements.map(row => group('dmDev', fields(['ideDmDev', row.id], ['codCateg', row.category])
    + group('infoPerApur', group('ideEstabLot', fields(
      ['tpInsc', row.establishment.length === 12 ? 4 : 1], ['nrInsc', row.establishment], ['codLotacao', row.allocation],
    ) + group('remunPerApur', fields(['matricula', row.registration], ['indSimples', row.incomeTaxSimpleIndicator])
      + row.items.map(item => group('itensRemun', fields(['codRubr', item.code], ['ideTabRubr', item.table],
        ['vrRubr', item.amount]))).join('')
      + (row.harmfulExposure ? group('infoAgNocivo', fields(['grauExp', row.harmfulExposure])) : '')))))).join('');
  return event('S-1200', header, workerData + demonstratives, month);
}

export function payrollPayments(header: EsocialHeader, month: string, cpf: string, payments: {
  paidOn: string; sourceMonth: string; statementId: string; net: string;
}[]) {
  if (!payments.length || payments.some(row => !isCivilDate(row.paidOn) || !row.paidOn.startsWith(month + '-')
    || !isCivilDate(row.sourceMonth + '-01') || !/^[0-9]+(?:\.\d{1,2})?$/.test(row.net))) throw new Error('Invalid actual payment');
  const keys = payments.map(row => JSON.stringify([row.sourceMonth, row.statementId]));
  if (new Set(keys).size !== keys.length) throw new Error('Each payment requires its own remuneration statement');
  return event('S-1210', header, group('ideBenef', fields(['cpfBenef', cpf])
    + payments.map(row => group('infoPgto', fields(['dtPgto', row.paidOn], ['tpPgto', 1],
      ['perRef', row.sourceMonth], ['ideDmDev', row.statementId], ['vrLiq', row.net]))).join('')), month);
}

export function payrollReopening(header: EsocialHeader, month: string) { return event('S-1298', header, '', month); }

export function payrollClosing(header: EsocialHeader, month: string, included: {
  remuneration: boolean; payments: boolean; ruralProduction: boolean; unionWorkers: boolean; complementaryInformation: boolean;
}) {
  const flag = (value: boolean) => value ? 'S' : 'N';
  return event('S-1299', header, group('infoFech', fields(
    ['evtRemun', flag(included.remuneration)], ['evtPgtos', flag(included.payments)],
    ['evtComProd', flag(included.ruralProduction)], ['evtContratAvNP', flag(included.unionWorkers)],
    ['evtInfoComplPer', flag(included.complementaryInformation)], ['naoValid', 'N'],
  )), month);
}

export function signEsocialDocument(document: EsocialDocument, credential: { certificate: string; key: string; passphrase?: string }) {
  const certificate = new X509Certificate(credential.certificate);
  const key = createPrivateKey({ key: credential.key, passphrase: credential.passphrase });
  if (key.asymmetricKeyType !== 'rsa' || !certificate.checkPrivateKey(key)) throw new Error('Invalid eSocial signing credential');
  const algorithm = (element: string, value: string) => `<${element} Algorithm="${value}"></${element}>`;
  const digest = createHash('sha256').update(document.xml, 'utf8').digest('base64');
  const body = algorithm('CanonicalizationMethod', c14n)
    + algorithm('SignatureMethod', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')
    + '<Reference URI="">' + group('Transforms', algorithm('Transform', ds + 'enveloped-signature') + algorithm('Transform', c14n))
    + algorithm('DigestMethod', 'http://www.w3.org/2001/04/xmlenc#sha256') + fields(['DigestValue', digest]) + '</Reference>';
  const signature = sign('RSA-SHA256', Buffer.from(`<SignedInfo xmlns="${ds}">${body}</SignedInfo>`, 'utf8'), key).toString('base64');
  const signatureXml = `<Signature xmlns="${ds}">` + group('SignedInfo', body) + fields(['SignatureValue', signature])
    + group('KeyInfo', group('X509Data', fields(['X509Certificate', certificate.raw.toString('base64')]))) + '</Signature>';
  return { ...document, xml: document.xml.slice(0, -'</eSocial>'.length) + signatureXml + '</eSocial>' };
}
