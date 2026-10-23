export function normalizeBrazilianPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  const national = [12, 13].includes(digits.length) && digits.startsWith('55') ? digits.slice(2) : digits;
  if (/^[1-9]\d\d{8}$/.test(national)) return national;
  if (/^[1-9]\d9\d{8}$/.test(national)) return national.slice(0, 2) + national.slice(-8);
  return null;
}
export function validCpf(raw: string | null | undefined): string | null {
  const cpf = (raw ?? '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const check = (sum * 10) % 11;
    if ((check === 10 ? 0 : check) !== Number(cpf[length])) return null;
  }
  return cpf;
}
export function resolvePaymentCpf(profileCpf: string | null | undefined, orderCpf: string | null | undefined): string | null {
  return validCpf(profileCpf) ?? validCpf(orderCpf);
}