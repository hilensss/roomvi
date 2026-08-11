export type YesAiNanoBananaConfig = {
  apiKey: string;
  baseUrl: string;
  version: 'v.2' | 'v.1.pro';
  style: string;
  dimensions: '9:16' | '16:9' | '1:1' | '3:4' | '4:3';
  resolution: '1k' | '2k' | '4k';
  initialPollDelayMs: number;
  pollIntervalMs: number;
  timeoutMs: number;
};

export function getYesAiNanoBananaConfig(): YesAiNanoBananaConfig {
  const apiKey = process.env.YESAI_API_KEY;

  if (!apiKey) {
    throw new Error('YESAI_API_KEY is not configured');
  }

  return {
    apiKey,
    baseUrl: process.env.YESAI_API_BASE_URL ?? 'https://api.yesai.su',
    version: (process.env.YESAI_NANO_BANANA_VERSION ?? 'v.2') as
      | 'v.2'
      | 'v.1.pro',
    style: process.env.YESAI_NANO_BANANA_STYLE ?? '7,16,43',
    dimensions: (process.env.YESAI_NANO_BANANA_DIMENSIONS ?? '16:9') as
      | '9:16'
      | '16:9'
      | '1:1'
      | '3:4'
      | '4:3',
    resolution: (process.env.YESAI_NANO_BANANA_RESOLUTION ?? '1k') as
      | '1k'
      | '2k'
      | '4k',
    initialPollDelayMs: Number(
      process.env.YESAI_NANO_BANANA_INITIAL_POLL_DELAY_MS ?? 18000,
    ),
    pollIntervalMs: Number(
      process.env.YESAI_NANO_BANANA_POLL_INTERVAL_MS ?? 10000,
    ),
    timeoutMs: Number(process.env.YESAI_NANO_BANANA_TIMEOUT_MS ?? 180000),
  };
}
