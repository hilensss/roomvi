export const ROOM_IMAGE_UPLOAD_FIELD = 'file';

export const ROOM_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ROOM_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const FILE_PURPOSES = {
  ROOM_SOURCE_IMAGE: 'ROOM_SOURCE_IMAGE',
} as const;
