import assert from 'node:assert/strict';
import test from 'node:test';

const { OpenAiReasoningProvider } = await import(
  '../dist/modules/reasoning-ai/openai-reasoning.provider.js'
);

function config(values = {}) {
  const resolved = {
    OPENAI_API_KEY: 'test-openai-key',
    REASONING_AI_MODEL: 'gpt-5.6-luna',
    REASONING_AI_REASONING_EFFORT: 'low',
    REASONING_AI_TIMEOUT_MS: '60000',
    ...values,
  };
  return { get: (key) => resolved[key] };
}

function request() {
  return {
    taskName: 'floor_plan_analysis',
    systemPrompt: 'Extract floor-plan geometry.',
    userPrompt: 'Return rooms and openings.',
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { rooms: { type: 'array', items: { type: 'object' } } },
      required: ['rooms'],
    },
    attachments: [
      {
        name: 'plan.jpg',
        mimeType: 'image/jpeg',
        bytes: Buffer.from('plan-image'),
      },
    ],
  };
}

test('OpenAI reasoning provider sends a low-cost strict multimodal Responses request', async () => {
  let captured;
  const provider = new OpenAiReasoningProvider(
    config(),
    async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(
        JSON.stringify({
          output_text: '{"rooms":[]}',
          usage: { input_tokens: 1800, output_tokens: 120 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  );

  const result = await provider.generateStructured(request());

  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.init.headers.authorization, 'Bearer test-openai-key');
  assert.equal(captured.body.model, 'gpt-5.6-luna');
  assert.deepEqual(captured.body.reasoning, { effort: 'low' });
  assert.equal(captured.body.store, false);
  assert.deepEqual(captured.body.text.format, {
    type: 'json_schema',
    name: 'floor_plan_analysis',
    strict: true,
    schema: request().jsonSchema,
  });
  const image = captured.body.input[1].content.find(
    (item) => item.type === 'input_image',
  );
  assert.match(image.image_url, /^data:image\/jpeg;base64,/);
  assert.deepEqual(result, {
    data: { rooms: [] },
    provider: 'openai',
    model: 'gpt-5.6-luna',
    usage: { inputTokens: 1800, outputTokens: 120 },
  });
});

test('OpenAI reasoning provider sends requests through a configured compatible API base URL', async () => {
  let capturedUrl;
  const provider = new OpenAiReasoningProvider(
    config({ REASONING_AI_BASE_URL: 'https://api.aitunnel.ru/v1/' }),
    async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ output_text: '{"rooms":[]}' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  await provider.generateStructured(request());

  assert.equal(capturedUrl, 'https://api.aitunnel.ru/v1/responses');
});

test('OpenAI reasoning provider uses request-level Chat Completions structured transport', async () => {
  let captured;
  const provider = new OpenAiReasoningProvider(
    config({ REASONING_AI_BASE_URL: 'https://api.aitunnel.ru/v1/' }),
    async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return new Response(
        JSON.stringify({
          output_text: '{"plans":[{"variantIndex":1}]}',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '{"plans":[{"variantIndex":1}]}',
              },
            },
          ],
          usage: { prompt_tokens: 400, completion_tokens: 80 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  );

  const result = await provider.generateStructured({
    ...request(),
    attachments: [],
    apiMode: 'chat_completions',
    model: 'gpt-4.1-mini',
    maxOutputTokens: 1_600,
  });

  assert.equal(captured.url, 'https://api.aitunnel.ru/v1/chat/completions');
  assert.deepEqual(captured.body.messages, [
    { role: 'system', content: 'Extract floor-plan geometry.' },
    { role: 'user', content: 'Return rooms and openings.' },
  ]);
  assert.deepEqual(captured.body.response_format, {
    type: 'json_schema',
    json_schema: {
      name: 'floor_plan_analysis',
      strict: true,
      schema: request().jsonSchema,
    },
  });
  assert.equal(captured.body.max_tokens, 1_600);
  assert.equal(captured.body.reasoning, undefined);
  assert.equal(captured.body.text, undefined);
  assert.deepEqual(result.data, { plans: [{ variantIndex: 1 }] });
  assert.deepEqual(result.usage, { inputTokens: 400, outputTokens: 80 });
});

test('OpenAI reasoning provider prefers the provider-neutral API key', async () => {
  let authorization;
  const provider = new OpenAiReasoningProvider(
    config({
      REASONING_AI_API_KEY: 'test-aitunnel-key',
      OPENAI_API_KEY: 'legacy-openai-key',
    }),
    async (_url, init) => {
      authorization = init.headers.authorization;
      return new Response(JSON.stringify({ output_text: '{"rooms":[]}' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  await provider.generateStructured(request());

  assert.equal(authorization, 'Bearer test-aitunnel-key');
});

test('OpenAI reasoning provider retries one transient failure', async () => {
  let attempts = 0;
  const provider = new OpenAiReasoningProvider(config(), async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response('temporary', { status: 503 });
    }
    return new Response(JSON.stringify({ output_text: '{"rooms":[]}' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  await provider.generateStructured(request());

  assert.equal(attempts, 2);
});

test('request-level curator limits override provider defaults without retrying', async () => {
  let attempts = 0;
  let body;
  const provider = new OpenAiReasoningProvider(config(), async (_url, init) => {
    attempts += 1;
    body = JSON.parse(init.body);
    return new Response('temporary', { status: 503 });
  });

  await assert.rejects(
    provider.generateStructured({
      ...request(),
      model: 'cheap-curator-model',
      reasoningEffort: 'low',
      timeoutMs: 5_000,
      maxOutputTokens: 3_000,
      maxAttempts: 1,
    }),
    /status 503/i,
  );

  assert.equal(attempts, 1);
  assert.equal(body.model, 'cheap-curator-model');
  assert.equal(body.max_output_tokens, 3_000);
  assert.deepEqual(body.reasoning, { effort: 'low' });
});

test('OpenAI reasoning provider reports exhausted quota without retrying', async () => {
  let attempts = 0;
  const provider = new OpenAiReasoningProvider(config(), async () => {
    attempts += 1;
    return new Response(
      JSON.stringify({
        error: {
          message: 'You exceeded your current quota.',
          type: 'insufficient_quota',
          code: 'insufficient_quota',
        },
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json' },
      },
    );
  });

  await assert.rejects(
    provider.generateStructured(request()),
    (error) =>
      error instanceof Error &&
      error.message ===
        'OpenAI API quota is exhausted. Configure API billing or add credits.' &&
      error.status === 429 &&
      error.code === 'insufficient_quota',
  );
  assert.equal(attempts, 1);
});

test('OpenAI reasoning provider rejects invalid structured output without leaking secrets', async () => {
  const provider = new OpenAiReasoningProvider(config(), async () =>
    new Response(JSON.stringify({ output_text: 'not json' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

  await assert.rejects(
    provider.generateStructured(request()),
    (error) =>
      error instanceof Error &&
      /invalid structured output/i.test(error.message) &&
      !error.message.includes('test-openai-key') &&
      !error.message.includes('plan-image'),
  );
});

test('OpenAI reasoning provider does not retry an invalid HTTP JSON body', async () => {
  let attempts = 0;
  const provider = new OpenAiReasoningProvider(config(), async () => {
    attempts += 1;
    return new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  await assert.rejects(
    provider.generateStructured(request()),
    /invalid response body/i,
  );
  assert.equal(attempts, 1);
});
