export interface NumberInputOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  optional?: boolean;
}

export type NumberInputResult =
  | { kind: 'valid'; value: number | undefined }
  | { kind: 'invalid' };

export function parseNumberInput(raw: string, options: NumberInputOptions = {}): NumberInputResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return options.optional ? { kind: 'valid', value: undefined } : { kind: 'invalid' };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { kind: 'invalid' };

  let value = options.integer === false ? parsed : Math.round(parsed);
  if (options.min !== undefined) value = Math.max(options.min, value);
  if (options.max !== undefined) value = Math.min(options.max, value);
  return { kind: 'valid', value };
}
