import { ApiError } from '../api/client';

export interface OrderItemRow {
  key: string;
  sku: string;
  qty: string;
}

export interface RowError {
  sku?: string;
  qty?: string;
  server?: string;
}

export interface OrderFormValidation {
  customerError: string | null;
  itemsError: string | null;
  rowErrors: Record<string, RowError>;
  isValid: boolean;
}

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

export function validateOrderForm(
  customer: string,
  rows: OrderItemRow[],
): OrderFormValidation {
  let isValid = true;
  let customerError: string | null = null;
  let itemsError: string | null = null;
  const rowErrors: Record<string, RowError> = {};

  if (!customer.trim()) {
    customerError = 'Nama pelanggan wajib diisi';
    isValid = false;
  }

  if (rows.length === 0) {
    itemsError = 'Minimal harus ada 1 item pesanan';
    isValid = false;
    return { customerError, itemsError, rowErrors, isValid };
  }

  const seenSKUs = new Set<string>();

  for (const item of rows) {
    const normalizedSKU = item.sku.trim().toUpperCase();
    let skuErr: string | undefined;

    if (!normalizedSKU) {
      skuErr = 'SKU wajib diisi';
    } else if (seenSKUs.has(normalizedSKU)) {
      skuErr = `SKU '${normalizedSKU}' duplikat`;
    } else {
      seenSKUs.add(normalizedSKU);
    }

    const qtyErr = validateQty(item.qty);

    if (skuErr || qtyErr) {
      rowErrors[item.key] = {
        sku: skuErr,
        qty: qtyErr ?? undefined,
      };
      isValid = false;
    }
  }

  return { customerError, itemsError, rowErrors, isValid };
}

export interface MappedOrderErrors {
  generalError: string | null;
  rowErrors: Record<string, RowError>;
}

export function mapOrderError(
  err: unknown,
  rows: OrderItemRow[],
): MappedOrderErrors {
  const rowErrors: Record<string, RowError> = {};
  let generalError: string | null;

  if (err instanceof ApiError) {
    if (err.code === 'INSUFFICIENT_STOCK' && err.sku) {
      const targetSKU = err.sku.toUpperCase();
      const matchedRow = rows.find(
        (r) => r.sku.trim().toUpperCase() === targetSKU,
      );
      const msg = `Stok tidak mencukupi (tersedia ${err.available ?? 0})`;
      if (matchedRow) {
        rowErrors[matchedRow.key] = { server: msg };
      }
      generalError = `Stok untuk '${err.sku}' tidak mencukupi (tersedia ${err.available ?? 0}).`;
    } else if (err.code === 'VALIDATION_ERROR' && err.details?.length) {
      const unmapped: string[] = [];

      for (const detail of err.details) {
        let mapped = false;

        // 1. Cek pola unknown sku '...'
        const unknownMatch = detail.match(/unknown sku '([^']+)'/i);
        if (unknownMatch) {
          const sku = unknownMatch[1].toUpperCase();
          const matchedRow = rows.find(
            (r) => r.sku.trim().toUpperCase() === sku,
          );
          if (matchedRow) {
            rowErrors[matchedRow.key] = {
              server: `SKU '${sku}' tidak ditemukan`,
            };
            mapped = true;
          }
        }

        // 2. Cek pola sku '...' is inactive
        const inactiveMatch = detail.match(/sku '([^']+)' is inactive/i);
        if (inactiveMatch) {
          const sku = inactiveMatch[1].toUpperCase();
          const matchedRow = rows.find(
            (r) => r.sku.trim().toUpperCase() === sku,
          );
          if (matchedRow) {
            rowErrors[matchedRow.key] = {
              server: `Produk '${sku}' berstatus nonaktif`,
            };
            mapped = true;
          }
        }

        // 3. Cek pola items[X]
        const indexMatch = detail.match(/items\[(\d+)\]/i);
        if (indexMatch) {
          const idx = parseInt(indexMatch[1], 10);
          if (rows[idx]) {
            rowErrors[rows[idx].key] = { server: detail };
            mapped = true;
          }
        }

        if (!mapped) {
          unmapped.push(detail);
        }
      }

      if (unmapped.length > 0) {
        generalError = `${err.message}: ${unmapped.join(', ')}`;
      } else {
        generalError = 'Terdapat kesalahan pada isian item pesanan.';
      }
    } else {
      generalError = err.message;
    }
  } else if (err instanceof Error) {
    generalError = err.message;
  } else {
    generalError = 'Terjadi kesalahan sistem saat membuat pesanan.';
  }

  return { generalError, rowErrors };
}
