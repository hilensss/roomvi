import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const response = await fetch(
  'https://api.yesai.su/v2/google/nanobanana/generations',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.YESAI_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      version: 'v.2',
      prompt: 'test prompt room interior',
      style: '7',
      dimensions: '16:9',
      resolution: '1k',
      customer_id: `test_${Date.now()}`,
    }),
  },
);

console.log(response.status);
console.log(await response.text());
