import { isValidCpf, normalizeTaxId } from './taxIdentification';

export type EngagementKind = 'employee' | 'partner';
export type Details = Record<string, string>;

const personKeys = [
  'sex', 'raceColor', 'education', 'birthCountry', 'nationality', 'socialName', 'maritalStatus',
  'email', 'phone', 'postalCode', 'streetType', 'street', 'streetNumber', 'addressComplement',
  'neighborhood', 'municipalityCode', 'state',
];
const employeeKeys = [
  'admissionType', 'admissionIndicator', 'workRegime', 'socialSecurityRegime', 'jobTitle', 'occupationCode',
  'contractType', 'contractEndDate', 'contractEndCondition', 'terminationClause', 'unionRegistration',
  'collectiveBargainingMonth', 'workTimeRegime', 'weeklyHours', 'schedule', 'activityNature',
  'journeyType', 'partTimeType', 'nightWork', 'variableSalaryDescription', 'monthlyHoursDivisor',
];

export function asPayrollRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function payrollText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function details(value: unknown, keys: string[]): Details {
  const input = asPayrollRecord(value);
  return Object.fromEntries(keys.map(key => [key, payrollText(input[key])]).filter(([, value]) => value));
}

export function isCivilDate(date: string): boolean {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function readEngagement(value: unknown, kind: EngagementKind) {
  const input = asPayrollRecord(value);
  const person = asPayrollRecord(input.person);
  return {
    person: {
      cpf: normalizeTaxId(payrollText(person.cpf)), fullName: payrollText(person.fullName), birthDate: payrollText(person.birthDate),
      details: details(person.details, personKeys),
    },
    registration: payrollText(input.registration),
    categoryCode: payrollText(input.categoryCode) || (kind === 'partner' ? '723' : ''),
    establishmentRegistration: payrollText(input.establishmentRegistration).replace(/[.\/-]/g, '').toUpperCase(),
    taxAllocationCode: payrollText(input.taxAllocationCode),
    startsOn: payrollText(input.startsOn),
    endsOn: payrollText(input.endsOn),
    details: details(input.details, kind === 'employee' ? employeeKeys : ['role', 'paymentRule', 'registerWithEsocial']),
  };
}

export type EngagementInput = ReturnType<typeof readEngagement>;

export function validateEngagementDraft(draft: EngagementInput) {
  const fields: Record<string, string> = {};
  if (!isValidCpf(draft.person.cpf)) fields['person.cpf'] = 'Informe um CPF válido.';
  if (draft.person.fullName.length < 2 || draft.person.fullName.length > 70) fields['person.fullName'] = 'Informe de 2 a 70 caracteres.';
  if (draft.person.birthDate && !isCivilDate(draft.person.birthDate)) fields['person.birthDate'] = 'Informe uma data válida.';
  if (draft.startsOn && !isCivilDate(draft.startsOn)) fields.startsOn = 'Informe uma data válida.';
  if (draft.endsOn && (!isCivilDate(draft.endsOn) || !draft.startsOn || draft.endsOn < draft.startsOn)) {
    fields.endsOn = 'A data de término deve ser posterior ou igual ao início.';
  }
  if (draft.registration.length > 30) fields.registration = 'Use até 30 caracteres.';
  if (draft.categoryCode && !/^[1-9]\d{2}$/.test(draft.categoryCode)) fields.categoryCode = 'Informe um código de três dígitos.';
  for (const [prefix, entries] of [['person.details', draft.person.details], ['details', draft.details]] as const) {
    for (const [key, value] of Object.entries(entries)) {
      if (value.length > 999) fields[prefix + '.' + key] = 'Use até 999 caracteres.';
    }
  }
  return fields;
}

export function admissionIssues(draft: EngagementInput, kind: EngagementKind, hasCompensation: boolean) {
  const fields = validateEngagementDraft(draft);
  function requireFields(prefix: string, source: Details, keys: string[]) {
    for (const key of keys) if (!source[key]) fields[prefix + key] = 'Campo obrigatório para esta etapa.';
  }
  if (!draft.person.birthDate) fields['person.birthDate'] = 'Informe a data de nascimento.';
  if (!draft.startsOn) fields.startsOn = 'Informe a data de início.';
  if (!hasCompensation) fields.compensation = 'Cadastre uma remuneração vigente na data de início.';
  if (kind === 'employee') {
    if (!draft.registration) fields.registration = 'Informe a matrícula.';
    if (!draft.categoryCode) fields.categoryCode = 'Informe a categoria do eSocial.';
    if (!draft.establishmentRegistration) fields.establishmentRegistration = 'Informe a inscrição do estabelecimento.';
    if (!draft.taxAllocationCode) fields.taxAllocationCode = 'Informe a lotação tributária.';
    requireFields('person.details.', draft.person.details, [
      'sex', 'raceColor', 'education', 'birthCountry', 'nationality', 'postalCode', 'street',
      'streetNumber', 'municipalityCode', 'state',
    ]);
    requireFields('details.', draft.details, [
      'admissionType', 'admissionIndicator', 'workRegime', 'socialSecurityRegime', 'jobTitle',
      'occupationCode', 'contractType', 'unionRegistration', 'workTimeRegime', 'activityNature',
    ]);
    if (draft.details.contractType === '2' && !isCivilDate(draft.details.contractEndDate ?? '')) {
      fields['details.contractEndDate'] = 'Informe o término do contrato determinado.';
    }
    if (draft.details.contractEndDate && draft.details.contractEndDate < draft.startsOn) {
      fields['details.contractEndDate'] = 'O término deve ser posterior ou igual à admissão.';
    }
    if (['2', '3'].includes(draft.details.contractType)) {
      requireFields('details.', draft.details, ['terminationClause']);
    }
    if (draft.details.contractType === '3') requireFields('details.', draft.details, ['contractEndCondition']);
    if (draft.details.workTimeRegime === '1') {
      requireFields('details.', draft.details, ['journeyType', 'schedule', 'partTimeType']);
      if (draft.categoryCode !== '111') requireFields('details.', draft.details, ['weeklyHours', 'nightWork']);
    }
    if (draft.person.details.raceColor === '6' && draft.startsOn >= '2024-04-22') {
      fields['person.details.raceColor'] = 'Informe a raça ou cor autodeclarada para esta data de admissão.';
    }
  } else {
    requireFields('details.', draft.details, ['role', 'paymentRule']);
    if (draft.details.registerWithEsocial === 'yes') {
      requireFields('person.details.', draft.person.details, ['sex', 'raceColor', 'education', 'birthCountry', 'nationality']);
    }
  }

  const formats = [
    ['person.details.sex', draft.person.details.sex, /^[MF]$/],
    ['person.details.raceColor', draft.person.details.raceColor, /^[1-6]$/],
    ['person.details.education', draft.person.details.education, /^\d{2}$/],
    ['person.details.birthCountry', draft.person.details.birthCountry, /^\d{3}$/],
    ['person.details.nationality', draft.person.details.nationality, /^\d{3}$/],
    ['person.details.postalCode', draft.person.details.postalCode, /^\d{5}-?\d{3}$/],
    ['person.details.municipalityCode', draft.person.details.municipalityCode, /^\d{7}$/],
    ['person.details.state', draft.person.details.state, /^[A-Z]{2}$/],
    ['details.occupationCode', draft.details.occupationCode, /^\d{6}$/],
    ['details.unionRegistration', draft.details.unionRegistration, /^[0-9A-Z./-]{14,18}$/],
    ['details.contractType', draft.details.contractType, /^[123]$/],
    ['details.collectiveBargainingMonth', draft.details.collectiveBargainingMonth, /^(0?[1-9]|1[0-2])$/],
    ['establishmentRegistration', draft.establishmentRegistration, /^(?:\d{12}|[0-9A-Z]{12}\d{2})$/],
    ['details.journeyType', draft.details.journeyType, /^[2-79]$/],
  ] as const;
  for (const [key, value, pattern] of formats) if (value && !pattern.test(value)) fields[key] = 'Revise o formato do campo.';
  return fields;
}

export function readCompensation(value: unknown, kind: EngagementKind) {
  const input = asPayrollRecord(value);
  const startsOn = payrollText(input.startsOn);
  const amount = payrollText(input.amount).replace(',', '.');
  const unit = payrollText(input.unit);
  const fields: Record<string, string> = {};
  if (!isCivilDate(startsOn)) fields.startsOn = 'Informe o início da vigência.';
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) fields.amount = 'Informe um valor em reais com até duas casas decimais.';
  const units = kind === 'partner' ? ['month'] : ['month', 'hour', 'day', 'week', 'fortnight', 'task', 'variable'];
  if (!units.includes(unit)) fields.unit = 'Selecione a unidade de remuneração.';
  return { startsOn, amount, unit, fields };
}
