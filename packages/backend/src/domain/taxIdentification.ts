export type IdentificationType = 'cpf' | 'cnpj';

export function normalizeTaxId(value: string): string {
  return value.replace(/\D/g, '');
}

function hasRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeTaxId(value);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9])
    && calculateDigit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeTaxId(value);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;

  const calculateDigit = (length: 12 | 13) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = cnpj
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(cnpj[12])
    && calculateDigit(13) === Number(cnpj[13]);
}

export function isValidTaxId(type: IdentificationType, value: string): boolean {
  return type === 'cpf' ? isValidCpf(value) : isValidCnpj(value);
}
