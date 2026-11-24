import { asPayrollRecord, isCivilDate, payrollText } from './payrollPeople';
import { isValidCpf, normalizeTaxId } from './taxIdentification';

export type ConditionKind = 'dependent' | 'transport_voucher' | 'meal_voucher' | 'other_source';

const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/;

export function readPayrollCondition(body: unknown, kind: ConditionKind) {
  const input = asPayrollRecord(body);
  const startsOn = payrollText(input.startsOn);
  const endsOn = payrollText(input.endsOn) || null;
  const fields: Record<string, string> = {};
  if (!isCivilDate(startsOn)) fields.startsOn = 'Informe o início da vigência.';
  if (endsOn && (!isCivilDate(endsOn) || endsOn < startsOn)) fields.endsOn = 'Informe uma data final válida.';

  let data: Record<string, string | boolean | null>;
  if (kind === 'dependent') {
    const fullName = payrollText(input.fullName);
    const cpf = normalizeTaxId(payrollText(input.cpf));
    const birthDate = payrollText(input.birthDate);
    const relationship = payrollText(input.relationship);
    const relationshipDescription = payrollText(input.relationshipDescription);
    const incomeTax = input.incomeTax === true;
    const familyAllowance = input.familyAllowance === true;
    if (fullName.length < 2 || fullName.length > 70) fields.fullName = 'Informe de 2 a 70 caracteres.';
    if ((cpf || incomeTax) && !isValidCpf(cpf)) fields.cpf = 'Informe um CPF válido para o dependente.';
    if (!isCivilDate(birthDate) || birthDate > startsOn) fields.birthDate = 'Informe a data de nascimento.';
    if (!/^\d{2}$/.test(relationship)) fields.relationship = 'Informe o código de dependência do eSocial.';
    if (relationship === '99' && (!relationshipDescription || relationshipDescription.length > 100)) {
      fields.relationshipDescription = 'Descreva o vínculo em até 100 caracteres.';
    }
    data = { fullName, cpf: cpf || null, birthDate, relationship, incomeTax, familyAllowance,
      relationshipDescription: relationship === '99' ? relationshipDescription : null };
  } else if (kind === 'other_source') {
    const registrationType = payrollText(input.registrationType);
    const registration = payrollText(input.registration).replace(/[.\/-]/g, '').toUpperCase();
    const categoryCode = payrollText(input.categoryCode);
    const remuneration = payrollText(input.remuneration).replace(',', '.');
    const contribution = payrollText(input.contribution).replace(',', '.');
    if (registrationType !== 'cpf' && registrationType !== 'cnpj') fields.registrationType = 'Selecione o tipo da inscrição.';
    if (!(registrationType === 'cpf' ? isValidCpf(registration) : /^[0-9A-Z]{12}\d{2}$/.test(registration))) {
      fields.registration = 'Informe a inscrição da outra fonte pagadora.';
    }
    if (!/^[1-9]\d{2}$/.test(categoryCode)) fields.categoryCode = 'Informe a categoria do trabalhador na outra fonte.';
    if (!moneyPattern.test(remuneration)) fields.remuneration = 'Informe a remuneração na outra fonte.';
    if (contribution && !moneyPattern.test(contribution)) fields.contribution = 'Informe o valor da contribuição com até duas casas decimais.';
    data = { registrationType, registration, categoryCode, remuneration, contribution: contribution || null };
  } else {
    const amount = payrollText(input.amount).replace(',', '.');
    const discount = payrollText(input.discount).replace(',', '.');
    const discountRule = payrollText(input.discountRule);
    const mealType = payrollText(input.mealType);
    if (!moneyPattern.test(amount)) fields.amount = 'Informe o valor do benefício.';
    if (!['none', 'fixed', 'percentage'].includes(discountRule)) fields.discountRule = 'Selecione a regra de desconto.';
    if (discountRule !== 'none' && (!moneyPattern.test(discount) || (discountRule === 'percentage' && Number(discount) > 100))) {
      fields.discount = 'Informe o valor ou percentual de desconto.';
    }
    if (kind === 'meal_voucher' && !['cash', 'card_pat', 'card_other', 'meal_pat', 'meal_other'].includes(mealType)) {
      fields.mealType = 'Selecione a forma de concessão e o vínculo com o PAT.';
    }
    data = { amount, discountRule, discount: discountRule === 'none' ? '0' : discount,
      ...(kind === 'meal_voucher' ? { mealType } : {}) };
  }

  return { startsOn, endsOn, fields, data };
}
