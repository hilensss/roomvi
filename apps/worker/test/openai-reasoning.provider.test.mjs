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
