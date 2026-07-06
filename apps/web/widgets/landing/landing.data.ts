import {
  CheckCircle,
  Package,
  Palette,
  ShoppingCart,
  Sparkles,
  Truck,
  Upload,
} from 'lucide-react';

export const heroAvatars = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop',
];

export const howItWorksSteps = [
  {
    number: '01',
    icon: Upload,
    title: 'Опишите комнату',
    description:
      'Тип, размеры, фото — сколько хотите данных, столько и AI учтёт',
  },
  {
    number: '02',
    icon: Palette,
    title: 'Выберите стиль',
    description: 'Минимализм, скандинавия, лофт — и ограничение по бюджету',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'AI рисует дизайн',
    description: '3–5 фотореалистичных вариантов с реальной мебелью',
  },
  {
    number: '04',
    icon: ShoppingCart,
    title: 'Один клик — корзина',
    description: 'Вся обстановка отправляется в чек-аут к партнёру',
  },
];

export const previewGalleryItems = [
  {
    image: 'https://images.unsplash.com/photo-1768144092684-c1a5dd6c7aad?w=900',
    style: 'Минимализм',
    price: '156 000 ₽',
    area: 'Гостиная 24 м²',
  },
  {
    image: 'https://images.unsplash.com/photo-1600494448655-ae58f58bb945?w=900',
    style: 'Скандинавский',
    price: '198 000 ₽',
    area: 'Спальня 18 м²',
  },
  {
    image: 'https://images.unsplash.com/photo-1772442364639-20fe5e5438a1?w=900',
    style: 'Современный',
    price: '224 000 ₽',
    area: 'Студия 32 м²',
  },
];

export const comparisonRows = [
  {
    bad: 'Дизайнер за 80 000 ₽ и 3 недели',
    good: 'Готовый проект за 2 минуты — бесплатно',
  },
  {
    bad: 'Картинки из Pinterest, которые не купить',
    good: 'Только мебель, которая сейчас в наличии',
  },
  {
    bad: '12 закладок и хаос в голове',
    good: 'Один клик — всё в корзине партнёра',
  },
  {
    bad: '«А подойдёт ли по размеру?»',
    good: 'AI рассчитывает под ваши метры',
  },
];

export const partnerFeatures = [
  {
    icon: CheckCircle,
    title: 'В наличии прямо сейчас',
    description: 'Каталог синхронизируется с партнёрами каждый час',
  },
  {
    icon: Package,
    title: 'Цены, как на витрине',
    description: 'Никаких скрытых наценок — платите ровно столько же',
  },
  {
    icon: Truck,
    title: 'Доставка одной посылкой',
    description: 'Партнёры собирают весь интерьер и привозят вместе',
  },
];

export const footerColumns = [
  {
    title: 'Продукт',
    links: [
      { label: 'Как это работает', href: '#how-it-works' },
      { label: 'Примеры', href: '#examples' },
      { label: 'Партнёры', href: '#products' },
    ],
  },
  {
    title: 'Компания',
    links: [
      { label: 'О нас', href: '#' },
      { label: 'Партнёрам', href: '#' },
      { label: 'Контакты', href: '#' },
    ],
  },
  {
    title: 'Поддержка',
    links: [
      { label: 'Помощь', href: '#' },
      { label: 'Доставка', href: '#' },
      { label: 'Возврат', href: '#' },
    ],
  },
];
