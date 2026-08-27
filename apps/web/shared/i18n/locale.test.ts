import { describe, expect, it } from 'vitest';
import {
  getDisplayCurrencyAmount,
  getRublesFromDisplayCurrency,
  USD_BUDGET_STEP,
} from './locale';

describe('localized currency controls', () => {
  it('converts editable dollar amounts to and from the ruble source value', () => {
    expect(getDisplayCurrencyAmount(9_000, 'en')).toBe(100);
    expect(getRublesFromDisplayCurrency(100, 'en')).toBe(9_000);
  });

  it('uses a clean configurable dollar step', () => {
    expect(USD_BUDGET_STEP).toBe(50);
  });
});
