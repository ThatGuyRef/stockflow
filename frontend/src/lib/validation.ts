export function validateQty(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 'Qty wajib diisi';
  }

  if (!/^\d+$/.test(trimmed)) {
    return 'Qty harus bilangan bulat';
  }

  const num = Number(trimmed);
  if (num <= 0) {
    return 'Qty harus lebih besar dari 0';
  }

  if (num > 1000000) {
    return 'Qty tidak boleh melebihi 1.000.000';
  }

  return null;
}
