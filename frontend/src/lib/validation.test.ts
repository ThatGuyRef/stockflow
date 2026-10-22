import { describe, expect, it } from 'vitest';
import { validateQty } from './validation';

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
