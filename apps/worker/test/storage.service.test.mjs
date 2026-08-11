import assert from 'node:assert/strict';
import test from 'node:test';

import { StorageService } from '../dist/modules/storage/storage.service.js';

test('uploadBuffer retries a transient S3 HTML deserialization failure', async () => {
  process.env.S3_ACCESS_KEY_ID = 'test-access-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';

  const storage = new StorageService();
  let attempts = 0;
  storage.client = {
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error(
          "Expected closing tag 'hr' instead of closing tag 'body'. Deserialization error: to see the raw response",
        );
      }
      return {};
    },
  };

  const result = await storage.uploadBuffer({
    buffer: Buffer.from('image'),
    contentType: 'image/png',
    folder: 'test',
    key: 'test/reference.png',
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, {
    key: 'test/reference.png',
    url: 'https://cdn.example.com/test/reference.png',
  });
});
