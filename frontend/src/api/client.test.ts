import { describe, expect, it } from 'vitest';
import { ApiError, isApiErrorEnvelope } from './client';

describe('isApiErrorEnvelope', () => {
  it('identifies valid error envelope structure', () => {
    const valid = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'invalid input',
        details: ['field is required'],
      },
    };
    expect(isApiErrorEnvelope(valid)).toBe(true);
  });

  it('rejects invalid or nullish inputs', () => {
    expect(isApiErrorEnvelope(null)).toBe(false);
    expect(isApiErrorEnvelope(undefined)).toBe(false);
    expect(isApiErrorEnvelope({})).toBe(false);
    expect(isApiErrorEnvelope({ error: null })).toBe(false);
    expect(isApiErrorEnvelope({ error: { code: 123 } })).toBe(false);
    expect(isApiErrorEnvelope({ error: { message: 'no code' } })).toBe(false);
  });
});

describe('ApiError', () => {
  it('constructs with correct status, code, and message', () => {
    const err = new ApiError(409, {
      code: 'INSUFFICIENT_STOCK',
      message: 'not enough stock',
      sku: 'ATK-001',
      available: 2,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.message).toBe('not enough stock');
    expect(err.sku).toBe('ATK-001');
    expect(err.available).toBe(2);
  });
});
