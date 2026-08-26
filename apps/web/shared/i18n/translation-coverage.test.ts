import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { translateRussianText } from './translations';

const UI_SOURCE_DIRECTORIES = ['app', 'features', 'shared/ui', 'widgets'];
const SOURCE_EXTENSION_PATTERN = /\.(?:ts|tsx)$/;
const EXCLUDED_FILE_PATTERN =
  /(?:\.test\.|\/shared\/i18n\/|\/features\/generation\/lib\/generation\.helpers\.ts$)/;

const DYNAMIC_UI_MESSAGES = [
  'Генерируем варианты интерьера: готово 0 из 4',
  'Генерируем варианты интерьера: готово 3 из 4',
  'Вариант 1 ожидает в очереди',
  'YES AI генерирует вариант 2',
  'Вариант 3 готов',
  'Вариант 4 отклонён по таймауту',
  'Создаём AI-задачу для варианта 1',
  'YES AI поставил вариант 1 в очередь',
  'Обрабатываем вариант 2',
  'Комната 1 отброшена: неверный формат.',
  'Комната 2 отброшена: нераспознаваемый контур.',
  'Комната 3 отброшена как дубликат контура.',
  'У комнаты 1 отброшен неправдоподобный размер.',
  'У комнаты 2 площадь требует ручной проверки.',
  'У комнаты 3 отброшен некорректный проём.',
  'Тип комнаты требует ручной проверки.',
  'Один или несколько размеров требуют ручной проверки.',
  'Площадь не согласуется с распознанными размерами.',
  'Часть проёмов требует ручной проверки.',
  'Подготавливаем планировку',
  'Распознаём комнаты, размеры и окна',
  'Комнаты готовы к проверке',
  'Повторяем анализ',
  'Анализ не выполнен',
  'Ожидает анализа',
  'Не удалось поставить анализ в очередь',
  'Проверяем выбранные товары',
  'Подбираем товары из каталога',
  'Готовим AI-промпты',
  'Сохраняем варианты дизайна',
  'Связываем дизайн с товарами',
  'Готово',
  'Ошибка генерации',
  'Готовим геометрию комнаты',
  'Подбираем товары для комнаты',
  'Готовим меблировку комнаты',
  'Меблируем подтверждённую геометрию',
  'Ошибка генерации комнаты',
  'Готовим запрос к YES AI',
  'Вариант 1',
  'AI-вариант 2',
  'Mock-дизайн комнаты в стиле MODERN.',
  'AI-дизайн комнаты в стиле MODERN.',
  'Комната 4',
];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!SOURCE_EXTENSION_PATTERN.test(entry.name)) return [];
    if (EXCLUDED_FILE_PATTERN.test(path)) return [];

    return [path];
  });
}

function collectRussianText(filePath: string) {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values: string[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isJsxText(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      const value = node.getText(source).replace(/^['"`]|['"`]$/g, '');
      const normalized = value.replace(/\s+/g, ' ').trim();
      if (/[А-Яа-яЁё]/.test(normalized)) values.push(normalized);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return values;
}

describe('English translation coverage', () => {
  it('does not leave Russian UI source strings untranslated', () => {
    const untranslated = UI_SOURCE_DIRECTORIES.flatMap((directory) =>
      collectSourceFiles(join(process.cwd(), directory)).flatMap((filePath) =>
        collectRussianText(filePath).map((source) => ({ filePath, source })),
      ),
    )
      .filter(({ source }) => /[А-Яа-яЁё]/.test(translateRussianText(source)))
      .map(({ filePath, source }) => `${filePath}: ${source}`);

    expect(untranslated).toEqual([]);
  });

  it('fully translates dynamic worker messages shown in the UI', () => {
    const untranslated = DYNAMIC_UI_MESSAGES.filter((message) =>
      /[А-Яа-яЁё]/.test(translateRussianText(message)),
    );

    expect(untranslated).toEqual([]);
  });
});
