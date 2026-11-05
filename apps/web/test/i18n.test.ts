import { describe, expect, it } from 'vitest';
import { hasEnglish, interpolate, localize, translate } from '../src/i18n/core';

describe('i18n', () => {
  it('returns the Chinese source unchanged in zh', () => {
    expect(translate('工作台', 'zh')).toBe('工作台');
    expect(localize('另有 3 条问题未展开。', 'zh')).toBe('另有 3 条问题未展开。');
  });

  it('translates exact UI copy and interpolates parameters', () => {
    expect(translate('工作台', 'en')).toBe('Workbench');
    expect(translate('自定义 · {title}', 'en', { title: 'My scenario' })).toBe('Custom · My scenario');
  });

  it('matches placeholder templates in domain messages', () => {
    expect(localize('另有 3 条问题未展开。', 'en')).toBe('3 more issues not shown.');
  });

  it('falls back to the source when no translation exists', () => {
    expect(localize('未翻译的领域文本', 'en')).toBe('未翻译的领域文本');
    expect(interpolate('{a} + {b}', { a: 1, b: 2 })).toBe('1 + 2');
  });

  it('localizes English domain enums in zh without changing the source enum', () => {
    expect(localize('WAITING', 'zh')).toBe('等待');
    expect(translate('WAITING', 'zh')).toBe('等待');
    expect(localize('RUNNING', 'zh')).toBe('运行中');
    expect(localize('WAITING', 'en')).toBe('WAITING');
  });

  it('reports whether a source string has English copy', () => {
    expect(hasEnglish('工作台')).toBe(true);
    expect(hasEnglish('未翻译的领域文本')).toBe(false);
  });
});
