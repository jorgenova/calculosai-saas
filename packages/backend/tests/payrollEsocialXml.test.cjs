const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, verify, X509Certificate } = require('node:crypto');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const {
  employeeAdmission, esocialEventId, partnerRegistration, payrollClosing, payrollPayments,
  payrollRemuneration, payrollReopening, signEsocialDocument, temporaryLeave,
} = require('../dist/domain/payrollEsocialXml');
const { esocialLot, esocialTransport, outcomeForQueuedEvent } = require('../dist/domain/payrollEsocialTransport');

const root = '04252011';
const receipt = '1.2.0000000000000000001';
const worker = { cpf: '52998224725', fullName: 'Ana & José', birthDate: '1990-03-23',
  details: { sex: 'F', raceColor: '1', education: '07', birthCountry: '105', nationality: '105',
    postalCode: '01310-100', street: 'Avenida Paulista', streetNumber: '10', municipalityCode: '3550308', state: 'SP' } };
const employment = { person: worker, registration: 'EMP-001', categoryCode: '101', startsOn: '2026-11-23',
  establishmentRegistration: '04252011000110', details: { admissionType: '1', admissionIndicator: '1', workRegime: '1',
    socialSecurityRegime: '1', jobTitle: 'Assistente & Analista', occupationCode: '411010', contractType: '1',
    unionRegistration: '04252011000110', workTimeRegime: '1', weeklyHours: '44', schedule: 'Segunda a sexta',
    journeyType: '3', partTimeType: '0', nightWork: 'N', activityNature: '1' } };
const partner = { ...employment, categoryCode: '723', registration: '', details: { registerWithEsocial: 'yes' } };

function header(sequence, environment = 'restricted', sourceReceipt) {
  return { root, environment, id: esocialEventId(root, new Date('2026-11-24T12:00:00Z'), sequence), receipt: sourceReceipt };
}

function sampleEvents() {
  const previous = { id: 'NOV_01', category: '101', registration: 'EMP-001', establishment: '04252011000110',
    allocation: 'GENERAL', harmfulExposure: '1', items: [{ code: 'SALARY', table: 'PAYROLL', amount: '3000.00' }] };
  return [
    employeeAdmission(header(1), employment, { amount: '3000.00', unit: 'month' }, []),
    temporaryLeave(header(2), employment, { startsOn: '2026-11-24', reason: '15', endsOn: '2026-12-08' }),
    partnerRegistration(header(3), partner, []),
    payrollRemuneration(header(4), '2026-11', worker, [previous, {
      ...previous, id: 'NOV_02', category: '723', registration: undefined,
      items: [{ code: 'PARTNER', table: 'PAYROLL', amount: '1800.00' }],
    }]),
    payrollPayments(header(5, 'restricted', receipt), '2026-12', worker.cpf, [
      { paidOn: '2026-12-04', sourceMonth: '2026-11', statementId: 'NOV_01', net: '2700.00' },
      { paidOn: '2026-12-22', sourceMonth: '2026-12', statementId: 'DEC_01', net: '450.00' },
    ]),
    payrollReopening(header(6), '2026-12'),
    payrollClosing(header(7, 'production'), '2026-12', {
      remuneration: true, payments: true, ruralProduction: false, unionWorkers: false, complementaryInformation: false,
    }),
  ];
}

test('eSocial generation separates periods, environments and source receipts', () => {
  const [admission, leave, partnerEvent, remuneration, payments, reopening, closing] = sampleEvents();
  assert.match(admission.xml, /<nmTrab>Ana &amp; José<\/nmTrab>/);
  assert.match(admission.xml, /<undSalFixo>5<\/undSalFixo>/);
  assert.doesNotMatch(admission.xml, /<perApur>/);
  assert.match(leave.xml, /<codMotAfast>15<\/codMotAfast>/);
  assert.match(partnerEvent.xml, /<cadIni>N<\/cadIni><codCateg>723<\/codCateg>/);
  assert.throws(() => partnerRegistration(header(3), { ...partner, details: {} }, []));
  assert.match(remuneration.xml, /<ideDmDev>NOV_01<\/ideDmDev>/);
  assert.match(remuneration.xml, /<ideDmDev>NOV_02<\/ideDmDev>/);
  assert.match(payments.xml, /<indRetif>2<\/indRetif><nrRecibo>1\.2\.0+1<\/nrRecibo>/);
  assert.match(payments.xml, /<perRef>2026-11<\/perRef><ideDmDev>NOV_01<\/ideDmDev>/);
  assert.match(payments.xml, /<perRef>2026-12<\/perRef><ideDmDev>DEC_01<\/ideDmDev>/);
  assert.doesNotMatch(reopening.xml, /<indRetif>/);
  assert.match(closing.xml, /<tpAmb>1<\/tpAmb>/);
  assert.doesNotMatch(closing.xml, /transDCTFWeb/);
  assert.throws(() => payrollReopening(header(6, 'restricted', receipt), '2026-12'));
  assert.throws(() => payrollPayments(header(5), '2026-12', worker.cpf, [
    { paidOn: '2026-11-20', sourceMonth: '2026-11', statementId: 'NOV_01', net: '2000.00' },
  ]));
});

const xsd = process.env.ESOCIAL_XSD_DIRECTORY;
test('signed eSocial events validate against the official S-1.3 XSD and verify independently', { skip: !xsd }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'esocial-test-'));
  try {
    const key = join(directory, 'key.pem');
    const certificate = join(directory, 'certificate.pem');
    const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', certificate, '-subj', '/CN=Local eSocial fixture', '-days', '1']);
    assert.equal(result.status, 0, result.stderr?.toString());
    const credential = { key: readFileSync(key, 'utf8'), certificate: readFileSync(certificate, 'utf8') };
    const publicKey = new X509Certificate(credential.certificate).publicKey;
    const canonical = xml => {
      const output = spawnSync('xmllint', ['--nonet', '--c14n', '-'], { input: xml, encoding: 'utf8' });
      assert.equal(output.status, 0, output.stderr);
      return output.stdout;
    };
    const signedEvents = [];
    for (const event of sampleEvents()) {
      const signed = signEsocialDocument(event, credential);
      signedEvents.push(signed);
      const validation = spawnSync('xmllint', ['--nonet', '--noout', '--schema', join(xsd, event.schema), '-'],
        { input: signed.xml, encoding: 'utf8' });
      assert.equal(validation.status, 0, validation.stderr);
      const digest = /<DigestValue>([^<]+)/.exec(signed.xml)[1];
      const signature = Buffer.from(/<SignatureValue>([^<]+)/.exec(signed.xml)[1], 'base64');
      const signedInfo = /<SignedInfo>(.*?)<\/SignedInfo>/.exec(signed.xml)[1];
      assert.equal(createHash('sha256').update(canonical(event.xml)).digest('base64'), digest);
      const content = canonical('<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">' + signedInfo + '</SignedInfo>');
      assert.equal(verify('RSA-SHA256', Buffer.from(content), publicKey, signature), true);
      assert.equal(verify('RSA-SHA256', Buffer.from(content + ' '), publicKey, signature), false);
    }
    const communicationXsd = process.env.ESOCIAL_COMMUNICATION_XSD_DIRECTORY;
    if (communicationXsd) {
      const lot = esocialLot(root, '04252011000110', 2, signedEvents.slice(0, 3));
      const verification = spawnSync('xmllint', ['--nonet', '--noout', '--schema',
        join(communicationXsd, 'EnvioLoteEventos-v1_1_1.xsd'), '-'], { input: lot, encoding: 'utf8' });
      assert.equal(verification.status, 0, verification.stderr);
    }
    const protocol = '1.2.202611.0000000000000000001';
    const soapNs = 'http://schemas.xmlsoap.org/soap/envelope/';
    const service = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio';
    const schema = 'http://www.esocial.gov.br/schema/lote/eventos/envio';
    const eventNs = 'http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0';
    const wrap = (method, ns, payload) => `<Envelope xmlns="${soapNs}"><Body>
      <${method}Response xmlns="${ns}"><${method}Result>${payload}</${method}Result></${method}Response>
      </Body></Envelope>`;
    let fail = true;
    const transport = esocialTransport('restricted', credential, async (url, body, action, passed) => {
      assert.equal(url.hostname, 'webservices.producaorestrita.esocial.gov.br');
      assert.equal(passed, credential);
      if (action.endsWith('/EnviarLoteEventos')) {
        assert.ok(body.includes(signedEvents[0].id));
        if (fail) throw new Error('simulated timeout');
        return wrap('EnviarLoteEventos', service + '/v1_1_0', `<eSocial xmlns="${schema}/retornoEnvio/v1_1_0">
          <retornoEnvioLoteEventos><status><cdResposta>201</cdResposta><descResposta>Recebido</descResposta></status>
          <dadosRecepcaoLote><protocoloEnvio>${protocol}</protocoloEnvio></dadosRecepcaoLote></retornoEnvioLoteEventos></eSocial>`);
      }
      assert.ok(body.includes(protocol));
      const [accepted, rejected] = signedEvents;
      return wrap('ConsultarLoteEventos', service + '/consulta/retornoProcessamento/v1_1_0', `<eSocial xmlns="${schema}/retornoProcessamento/v1_3_0">
        <retornoProcessamentoLoteEventos><status><cdResposta>202</cdResposta></status><retornoEventos>
          <evento Id="${accepted.id}" evtDupl="true"><retornoEvento><eSocial xmlns="${eventNs}">
            <retornoEvento Id="${accepted.id}"><processamento><cdResposta>201</cdResposta></processamento>
              <recibo><nrRecibo>${receipt}</nrRecibo></recibo></retornoEvento></eSocial></retornoEvento>
              <tot tipo="S-5001"><summary xmlns="urn:local-test">123</summary></tot></evento>
          <evento Id="${rejected.id}"><retornoEvento><eSocial xmlns="${eventNs}">
            <retornoEvento Id="${rejected.id}"><processamento><cdResposta>401</cdResposta>
              <ocorrencias><ocorrencia><codigo>999</codigo><tipo>1</tipo><descricao>Teste</descricao></ocorrencia></ocorrencias>
            </processamento></retornoEvento></eSocial></retornoEvento></evento>
        </retornoEventos></retornoProcessamentoLoteEventos></eSocial>`);
    });
    await assert.rejects(transport.submit(root, '04252011000110', 2, signedEvents.slice(0, 3)), /simulated timeout/);
    fail = false;
    const submitted = await transport.submit(root, '04252011000110', 2, signedEvents.slice(0, 3));
    assert.equal(outcomeForQueuedEvent(signedEvents[0].id, submitted, 'submit').protocol, protocol);
    const processed = await transport.query(protocol);
    const accepted = outcomeForQueuedEvent(signedEvents[0].id, processed, 'query');
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.receipt, receipt);
    assert.equal(accepted.result.duplicate, true);
    assert.equal(accepted.result.totalizers[0].type, 'S-5001');
    const rejected = outcomeForQueuedEvent(signedEvents[1].id, processed, 'query');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.result.occurrences[0].code, '999');
    assert.equal(outcomeForQueuedEvent(signedEvents[2].id, processed, 'query').status, 'sent');
    assert.throws(() => transport.submit(root, '04252011000110', 3, signedEvents.slice(-1)), /environment/);
    assert.throws(() => esocialTransport('production', credential).query(protocol), /environment/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
