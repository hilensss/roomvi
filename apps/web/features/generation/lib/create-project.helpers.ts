import {
  BUDGET_MAX,
  BUDGET_MIN,
  CREATE_PROJECT_STEPS,
  ROOM_TYPE_OPTIONS,
  STYLE_OPTIONS,
  type CreateProjectStep,
} from '../model/create-project.data';
import type {
  CreateProjectFormState,
  ProjectBriefItem,
} from '../model/create-project.types';

export function getStepTitle(step: CreateProjectStep) {
  return CREATE_PROJECT_STEPS[step - 1];
}

export function getStepHeading(step: CreateProjectStep) {
  switch (step) {
    case 1:
      return 'Какую комнату оформляем?';
    case 2:
      return 'Расскажите про геометрию';
    case 3:
      return 'Какой стиль вам ближе?';
    case 4:
      return 'Сколько готовы вложить?';
    case 5:
      return 'Покажите комнату AI';
    case 6:
      return 'Всё готово к старту';
  }
}

export function getStepDescription(step: CreateProjectStep) {
  switch (step) {
    case 1:
      return 'AI настраивает мебельный сценарий под назначение помещения.';
    case 2:
      return 'Размеры в метрах — это критично для масштаба и расстановки.';
    case 3:
      return 'Можно выбрать один стиль — мы сгенерируем 3–5 вариантов внутри него.';
    case 4:
      return 'Бюджет ограничивает выбор товаров — без выхода за рамки.';
    case 5:
      return 'Необязательно, но фото улучшает реалистичность результата.';
    case 6:
      return 'Проверьте бриф и запустите генерацию. Это займёт около 2 минут.';
  }
}

export function canProceed(
  step: CreateProjectStep,
  form: CreateProjectFormState,
) {
  if (step === 1) return Boolean(form.roomType);
  if (step === 2) return Boolean(form.width && form.depth && form.height);
  if (step === 3) return Boolean(form.style);
  return true;
}

export function getBudgetPercent(value: number) {
  return ((value - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function getRoomTypeName(form: CreateProjectFormState) {
  return (
    ROOM_TYPE_OPTIONS.find((item) => item.id === form.roomType)?.name ?? '—'
  );
}

export function getStyleName(form: CreateProjectFormState) {
  return STYLE_OPTIONS.find((item) => item.id === form.style)?.name ?? '—';
}

export function getDimensionsLabel(form: CreateProjectFormState) {
  if (!form.width || !form.depth || !form.height) {
    return '—';
  }

  return `${form.width} × ${form.depth} × ${form.height} м`;
}

export function getRoomArea(form: CreateProjectFormState) {
  const width = Number(form.width);
  const depth = Number(form.depth);

  if (!width || !depth) {
    return null;
  }

  return (width * depth).toFixed(1);
}

export function getProjectBrief(
  form: CreateProjectFormState,
): ProjectBriefItem[] {
  return [
    {
      label: 'Комната',
      value: getRoomTypeName(form),
    },
    {
      label: 'Размеры',
      value: getDimensionsLabel(form),
    },
    {
      label: 'Стиль',
      value: getStyleName(form),
    },
    {
      label: 'Бюджет',
      value: `${form.budgetMax ? formatMoney(form.budgetMax) : '-'} ₽`,
    },
    {
      label: 'Фото',
      value: form.sourceImageFile ? 'Загружено' : 'Без фото',
    },
  ];
}

export function toCentimeters(value: string) {
  return Math.round(Number(value) * 100);
}
