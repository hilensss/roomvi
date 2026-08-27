import { describe, expect, it } from 'vitest';
import { translateRussianText } from './translations';

describe('translateRussianText', () => {
  it('translates interface copy without leaving Cyrillic text', () => {
    const translated = translateRussianText(
      'Соберите интерьер, пока пьёте кофе',
    );

    expect(translated).toBe(
      'Design your interior, while you enjoy your coffee',
    );
    expect(translated).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('converts displayed ruble prices to dollars', () => {
    expect(translateRussianText('156 000 ₽')).toBe('$1,733');
  });

  it('translates the landing generation time', () => {
    expect(translateRussianText('Готовый проект за 3 минуты — бесплатно')).toBe(
      'A finished project in 3 minutes — free',
    );
    expect(translateRussianText('3 минуты — и готово')).toBe(
      'Ready in 3 minutes',
    );
  });

  it('translates dynamic generation progress as real English', () => {
    expect(
      translateRussianText(
        'Генерируем варианты интерьера: готово 0 из 4',
      ),
    ).toBe('Generating interior options: 0 of 4 complete');

    expect(translateRussianText('Вариант 2 ожидает в очереди')).toBe(
      'Option 2 is waiting in the queue',
    );
    expect(translateRussianText('Вариант 3 готов')).toBe(
      'Option 3 is ready',
    );
  });

  it('localizes units, accessibility text, and phone examples', () => {
    expect(translateRussianText('Ширина проёма 1, 120 см')).toBe(
      'Opening width 1, 120 cm',
    );
    expect(translateRussianText('+7 999 000-00-00')).toBe('+1 555 000-0000');
  });
});
