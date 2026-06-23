export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}
