import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import {
  mapOrderError,
  validateOrderForm,
  validateQty,
  type OrderItemRow,
} from './validation';

describe('validateQty', () => {
  it('rejects empty or whitespace-only strings', () => {
    expect(validateQty('')).toBe('Qty wajib diisi');
    expect(validateQty('   ')).toBe('Qty wajib diisi');
  });

  it('rejects non-integer input (decimals, letters, symbols)', () => {
    expect(validateQty('abc')).toBe('Qty harus bilangan bulat');
    expect(validateQty('12.5')).toBe('Qty harus bilangan bulat');
    expect(validateQty('10,5')).toBe('Qty harus bilangan bulat');
    expect(validateQty('-5')).toBe('Qty harus bilangan bulat');
    expect(validateQty('10e2')).toBe('Qty harus bilangan bulat');
    expect(validateQty('5 pcs')).toBe('Qty harus bilangan bulat');
  });

  it('rejects values less than or equal to 0', () => {
    expect(validateQty('0')).toBe('Qty harus lebih besar dari 0');
    expect(validateQty('00')).toBe('Qty harus lebih besar dari 0');
  });

  it('rejects values exceeding 1,000,000', () => {
    expect(validateQty('1000001')).toBe('Qty tidak boleh melebihi 1.000.000');
    expect(validateQty('999999999')).toBe('Qty tidak boleh melebihi 1.000.000');
  });

  it('accepts valid integers within range', () => {
    expect(validateQty('1')).toBeNull();
    expect(validateQty('5')).toBeNull();
    expect(validateQty('100')).toBeNull();
    expect(validateQty('1000000')).toBeNull();
    expect(validateQty('  42  ')).toBeNull();
  });
});

describe('validateOrderForm', () => {
  it('rejects empty customer name', () => {
    const rows: OrderItemRow[] = [{ key: '1', sku: 'ATK-001', qty: '2' }];
    const res = validateOrderForm('', rows);
    expect(res.isValid).toBe(false);
    expect(res.customerError).toBe('Nama pelanggan wajib diisi');
  });

  it('rejects empty items list', () => {
    const res = validateOrderForm('PT Customer', []);
    expect(res.isValid).toBe(false);
    expect(res.itemsError).toBe('Minimal harus ada 1 item pesanan');
  });

  it('detects duplicate SKUs after uppercase normalization', () => {
    const rows: OrderItemRow[] = [
      { key: '1', sku: 'atk-001', qty: '2' },
      { key: '2', sku: 'ATK-001', qty: '3' },
    ];
    const res = validateOrderForm('PT Customer', rows);
    expect(res.isValid).toBe(false);
    expect(res.rowErrors['2']?.sku).toBe("SKU 'ATK-001' duplikat");
  });

  it('validates invalid qty per row', () => {
    const rows: OrderItemRow[] = [
      { key: '1', sku: 'ATK-001', qty: '0' },
      { key: '2', sku: '', qty: 'abc' },
    ];
    const res = validateOrderForm('PT Customer', rows);
    expect(res.isValid).toBe(false);
    expect(res.rowErrors['1']?.qty).toBe('Qty harus lebih besar dari 0');
    expect(res.rowErrors['2']?.sku).toBe('SKU wajib diisi');
    expect(res.rowErrors['2']?.qty).toBe('Qty harus bilangan bulat');
  });

  it('passes on valid customer and items', () => {
    const rows: OrderItemRow[] = [
      { key: '1', sku: 'ATK-001', qty: '2' },
      { key: '2', sku: 'ATK-003', qty: '1' },
    ];
    const res = validateOrderForm('PT Customer', rows);
    expect(res.isValid).toBe(true);
    expect(res.customerError).toBeNull();
    expect(res.itemsError).toBeNull();
    expect(Object.keys(res.rowErrors).length).toBe(0);
  });
});

describe('mapOrderError', () => {
  it('maps 409 INSUFFICIENT_STOCK to the exact failing row case-insensitively', () => {
    const mixedCaseRows: OrderItemRow[] = [
      { key: 'row-1', sku: 'atk-001', qty: '1' },
      { key: 'row-2', sku: '  atk-016  ', qty: '99' },
    ];
    const apiErr = new ApiError(409, {
      code: 'INSUFFICIENT_STOCK',
      message: 'insufficient stock',
      sku: 'ATK-016',
      available: 3,
    });

    const mapped = mapOrderError(apiErr, mixedCaseRows);
    expect(mapped.rowErrors['row-2']?.server).toBe('Stok tidak mencukupi (tersedia 3)');
    expect(mapped.generalError).toContain("Stok untuk 'ATK-016' tidak mencukupi (tersedia 3)");
  });

  it('maps 400 unknown SKU to the failing row case-insensitively', () => {
    const rowsWithUnknown: OrderItemRow[] = [
      { key: 'row-1', sku: 'atk-999', qty: '1' },
    ];
    const apiErr = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: 'validation failed',
      details: ["unknown sku 'ATK-999'"],
    });

    const mapped = mapOrderError(apiErr, rowsWithUnknown);
    expect(mapped.rowErrors['row-1']?.server).toBe("SKU 'ATK-999' tidak ditemukan");
  });

  it('maps 400 inactive SKU to the failing row', () => {
    const rowsWithInactive: OrderItemRow[] = [
      { key: 'row-1', sku: 'ATK-007', qty: '1' },
    ];
    const apiErr = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: 'validation failed',
      details: ["sku 'ATK-007' is inactive"],
    });

    const mapped = mapOrderError(apiErr, rowsWithInactive);
    expect(mapped.rowErrors['row-1']?.server).toBe("Produk 'ATK-007' berstatus nonaktif");
  });

  it('maps 400 items[N] index-based error to corresponding row', () => {
    const testRows: OrderItemRow[] = [
      { key: 'row-0', sku: 'ATK-001', qty: '1' },
      { key: 'row-1', sku: 'ATK-002', qty: '0' },
    ];
    const apiErr = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: 'validation failed',
      details: ['items[1].qty must be greater than 0'],
    });

    const mapped = mapOrderError(apiErr, testRows);
    expect(mapped.rowErrors['row-1']?.server).toBe('items[1].qty must be greater than 0');
  });

  it('falls back to generalError when details cannot be mapped to any row', () => {
    const testRows: OrderItemRow[] = [
      { key: 'row-0', sku: 'ATK-001', qty: '1' },
    ];
    const apiErr = new ApiError(400, {
      code: 'VALIDATION_ERROR',
      message: 'validation failed',
      details: ['customer name cannot be empty'],
    });

    const mapped = mapOrderError(apiErr, testRows);
    expect(Object.keys(mapped.rowErrors).length).toBe(0);
    expect(mapped.generalError).toContain('customer name cannot be empty');
  });
});
