import type { InteriorStyle, RoomType } from '@/shared/api/types';

export type CreateProjectStep = 1 | 2 | 3 | 4 | 5 | 6;

export type RoomTypeOption = {
  id: RoomType;
  name: string;
  icon: string;
  hint: string;
};

export type StyleOption = {
  id: InteriorStyle;
  name: string;
  description: string;
  image: string;
};

export const CREATE_PROJECT_STEPS = [
  'Тип помещения',
  'Геометрия',
  'Стиль',
  'Бюджет',
  'Фото комнаты',
  'Финал',
] as const;

export const ROOM_TYPE_OPTIONS: RoomTypeOption[] = [
  {
    id: 'LIVING_ROOM',
    name: 'Гостиная',
    icon: '🛋️',
    hint: 'для приёма гостей и отдыха',
  },
  {
    id: 'BEDROOM',
    name: 'Спальня',
    icon: '🛏️',
    hint: 'тишина и расслабление',
  },
  {
    id: 'KITCHEN',
    name: 'Кухня',
    icon: '🍳',
    hint: 'функциональная зона',
  },
  {
    id: 'OFFICE',
    name: 'Кабинет',
    icon: '💼',
    hint: 'для работы и фокуса',
  },
  {
    id: 'KIDS_ROOM',
    name: 'Детская',
    icon: '🧸',
    hint: 'безопасность и игра',
  },
  {
    id: 'BATHROOM',
    name: 'Ванная',
    icon: '🚿',
    hint: 'спа на каждый день',
  },
];

export const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'MINIMALISM',
    name: 'Минимализм',
    description: 'чистые линии, спокойная палитра',
    image: 'https://images.unsplash.com/photo-1771888703723-01d85da1dae1?w=900',
  },
  {
    id: 'SCANDI',
    name: 'Скандинавский',
    description: 'светлое дерево, уют, простота',
    image: 'https://images.unsplash.com/photo-1600494448655-ae58f58bb945?w=900',
  },
  {
    id: 'MODERN',
    name: 'Современный',
    description: 'смелые формы, контрасты',
    image: 'https://images.unsplash.com/photo-1768144092684-c1a5dd6c7aad?w=900',
  },
  {
    id: 'LOFT',
    name: 'Лофт',
    description: 'кирпич, металл, индустриальный',
    image: 'https://images.unsplash.com/photo-1772442364639-20fe5e5438a1?w=900',
  },
  {
    id: 'CLASSIC',
    name: 'Классический',
    description: 'строгие пропорции, благородство',
    image: 'https://images.unsplash.com/photo-1724582586413-6b69e1c94a17?w=900',
  },
  {
    id: 'ECO',
    name: 'Эко-стиль',
    description: 'натуральные материалы, зелень',
    image: 'https://images.unsplash.com/photo-1610307522657-8c0304960189?w=900',
  },
];

export const QUICK_BUDGETS = [
  { value: 100_000, label: 'Скромно' },
  { value: 200_000, label: 'Стандарт' },
  { value: 350_000, label: 'Премиум' },
  { value: 500_000, label: 'Лакшери' },
];

export const BUDGET_MIN = 50_000;
export const BUDGET_MAX = 500_000;
