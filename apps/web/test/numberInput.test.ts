import { describe, expect, it } from 'vitest';
import { parseNumberInput } from '../src/lib/numberInput';

describe('parseNumberInput', () => {
  it('rejects an empty required field and clears an optional field', () => {
    expect(parseNumberInput('')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('   ')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('', { optional: true })).toEqual({ kind: 'valid', value: undefined });
  });

  it('rejects non-finite and malformed values', () => {
    expect(parseNumberInput('not-a-number')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('NaN')).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('Infinity')).toEqual({ kind: 'invalid' });
  });

  it('clamps values to the supported boundaries', () => {
    expect(parseNumberInput('-4', { min: 0 })).toEqual({ kind: 'valid', value: 0 });
    expect(parseNumberInput('12', { max: 8 })).toEqual({ kind: 'valid', value: 8 });
    expect(parseNumberInput('6', { min: 0, max: 8 })).toEqual({ kind: 'valid', value: 6 });
  });

  it('rounds integer fields and preserves fractional fields', () => {
    expect(parseNumberInput('2.6')).toEqual({ kind: 'valid', value: 3 });
    expect(parseNumberInput('2.4')).toEqual({ kind: 'valid', value: 2 });
    expect(parseNumberInput('2.5', { integer: false })).toEqual({ kind: 'valid', value: 2.5 });
  });
});
