export type UploadFileInput = {
  buffer: Buffer;
  key: string;
  mimeType: string;
};

export type UploadedFileResult = {
  key: string;
  url: string;
};

export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<UploadedFileResult>;
}
