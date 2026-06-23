export function normalizeCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, '');
}

function calculateDigit(baseDigits: string, weights: number[]) {
  const sum = baseDigits
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * weights[index]!, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string) {
  const digits = normalizeCnpj(value);

  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const weightsForFirstDigit = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weightsForSecondDigit = [6, ...weightsForFirstDigit];
  const firstDigit = calculateDigit(digits.slice(0, 12), weightsForFirstDigit);
  const secondDigit = calculateDigit(`${digits.slice(0, 12)}${firstDigit}`, weightsForSecondDigit);

  return firstDigit === Number(digits[12]) && secondDigit === Number(digits[13]);
}
