export type AuthMode = 'login' | 'register';

export type AuthReason =
  | 'guest-generation-limit'
  | 'checkout-required'
  | 'save-project'
  | 'default';
