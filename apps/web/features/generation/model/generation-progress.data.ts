import {
  CheckCircle,
  ImageIcon,
  Package,
  Palette,
  Sparkles,
} from 'lucide-react';

export const GENERATION_PROGRESS_STEPS = [
  {
    icon: Package,
    title: 'Подбираем мебель из живого каталога',
    detail: 'Проверяем товары, цены и наличие',
  },
  {
    icon: Palette,
    title: 'Анализируем ваш стиль и палитру',
    detail: 'Учитываем выбранный стиль, бюджет и размеры',
  },
  {
    icon: Sparkles,
    title: 'Генерируем фотореалистичные варианты',
    detail: 'AI собирает интерьерные сцены',
  },
  {
    icon: ImageIcon,
    title: 'Связываем дизайн с реальными товарами',
    detail: 'Сохраняем товары и снапшоты цен',
  },
  {
    icon: CheckCircle,
    title: 'Финализируем сцены',
    detail: 'Готовим варианты к просмотру',
  },
];

export const GENERATION_PREVIEW_IMAGES = [
  'https://images.unsplash.com/photo-1600494448655-ae58f58bb945?w=1200',
  'https://images.unsplash.com/photo-1768144092684-c1a5dd6c7aad?w=1200',
  'https://images.unsplash.com/photo-1772442364639-20fe5e5438a1?w=1200',
  'https://images.unsplash.com/photo-1771888703723-01d85da1dae1?w=1200',
];
