const baseUrl = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const token = process.env.DIRECTUS_TOKEN;
const key = process.env.BOT_KEY;
const name = process.env.BOT_NAME;
const platform = process.env.BOT_PLATFORM ?? 'other';

if (!token) throw new Error('DIRECTUS_TOKEN is required');
if (!key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
  throw new Error('BOT_KEY must contain lowercase letters, digits and single hyphens');
}
if (!name?.trim()) throw new Error('BOT_NAME is required');
if (!['vk', 'telegram', 'instagram', 'other'].includes(platform)) {
  throw new Error('BOT_PLATFORM must be vk, telegram, instagram or other');
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

const query = new URLSearchParams({ 'filter[key][_eq]': key, limit: '1' });
const existing = await request(`/items/content_bots?${query.toString()}`);

if (existing.data[0]) {
  console.log(`Bot already exists: ${key}`);
  process.exit(0);
}

const created = await request('/items/content_bots', {
  method: 'POST',
  body: JSON.stringify({ key, name: name.trim(), platform, status: 'active' }),
});

await request('/items/bot_settings', {
  method: 'POST',
  body: JSON.stringify({
    bot: created.data.id,
    unknown_message: 'Не нашёл подходящего материала. Попробуйте другое ключевое слово.',
  }),
});

console.log(`Created bot: ${key} (${created.data.id})`);
