export type GuestSessionResponse = {
  isGuest: true;
  anonymousId: string;
  previewGenerationsUsed: number;
  previewGenerationsLimit: number;
  canGeneratePreview: boolean;
  expiresAt: Date;
};
