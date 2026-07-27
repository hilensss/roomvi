export type UploadFileInput = {
  buffer: Buffer;
  key: string;
  mimeType: string;
};

export type UploadedFileResult = {
  key: string;
  url: string;
};

export type DownloadedFileResult = {
  buffer: Buffer;
  contentType?: string;
  contentLength?: number;
};

export interface StorageProvider {
  uploadFile(input: UploadFileInput): Promise<UploadedFileResult>;
  downloadFile(
    key: string,
    maxBytes: number,
    timeoutMs?: number,
  ): Promise<DownloadedFileResult>;
}
