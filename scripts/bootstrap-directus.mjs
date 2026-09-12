const baseUrl = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const token = process.env.DIRECTUS_TOKEN;
const initialBotKey = process.env.DIRECTUS_INITIAL_BOT_KEY ?? 'vk-content-bot';
const initialBotName = process.env.DIRECTUS_INITIAL_BOT_NAME ?? 'VK Content Bot';
const seedDemoContent = process.env.DIRECTUS_SEED_DEMO === 'true';

if (!token) throw new Error('DIRECTUS_TOKEN is required');

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${body}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

async function waitForDirectus() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(new URL('/server/health', baseUrl));
      if (response.ok) return;
    } catch {
      // Directus is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Directus did not become healthy in time');
}

async function ensureCollection(collection, meta) {
  try {
    const existing = await request(`/collections/${collection}`);
    if (existing.data.schema) {
      await request(`/collections/${collection}`, {
        method: 'PATCH',
        body: JSON.stringify({ meta: { accountability: 'all', ...meta } }),
      });
      return;
    }

    throw new Error(
      `Collection ${collection} has metadata but no physical table; repair it before retrying`,
    );
  } catch (error) {
    if (error.status !== 403 && error.status !== 404) throw error;
  }

  await request('/collections', {
    method: 'POST',
    body: JSON.stringify({
      collection,
      meta: { singleton: false, accountability: 'all', ...meta },
      schema: { name: collection },
      fields: [
        {
          field: 'id',
          type: 'integer',
          meta: { hidden: true, readonly: true, interface: 'input' },
          schema: { is_primary_key: true, has_auto_increment: true, is_nullable: false },
        },
      ],
    }),
  });
  console.log(`Created collection: ${collection}`);
}

async function ensureField(collection, definition) {
  try {
    await request(`/fields/${collection}/${definition.field}`);
    return;
  } catch (error) {
    if (error.status !== 403 && error.status !== 404) throw error;
  }

  await request(`/fields/${collection}`, {
    method: 'POST',
    body: JSON.stringify(definition),
  });
  console.log(`Created field: ${collection}.${definition.field}`);
}

async function ensureRelation(collection, field, relatedCollection, onDelete) {
  const existing = await request('/relations');
  const found = existing.data.some(
    (relation) => relation.collection === collection && relation.field === field,
  );
  if (found) return;

  await request('/relations', {
    method: 'POST',
    body: JSON.stringify({
      collection,
      field,
      related_collection: relatedCollection,
      schema: { on_delete: onDelete },
      meta: {
        many_collection: collection,
        many_field: field,
        one_collection: relatedCollection,
        one_field: null,
      },
    }),
  });
  console.log(`Created relation: ${collection}.${field}`);
}

function stringField(field, note, options = {}) {
  return {
    field,
    type: 'string',
    meta: {
      interface: options.interface ?? 'input',
      note,
      required: options.required ?? false,
      options: options.options,
      width: options.width ?? 'full',
    },
    schema: {
      is_nullable: !(options.required ?? false),
      is_unique: options.unique ?? false,
      max_length: options.maxLength ?? 255,
      default_value: options.defaultValue ?? null,
    },
  };
}

function textField(field, note) {
  return {
    field,
    type: 'text',
    meta: { interface: 'input-multiline', note, width: 'full' },
    schema: { is_nullable: true },
  };
}

function booleanField(field, note, defaultValue = true) {
  return {
    field,
    type: 'boolean',
    meta: { interface: 'boolean', note, width: 'half' },
    schema: { is_nullable: false, default_value: defaultValue },
  };
}

function integerField(field, note, defaultValue = null) {
  return {
    field,
    type: 'integer',
    meta: { interface: 'input', note, width: 'half' },
    schema: { is_nullable: defaultValue === null, default_value: defaultValue },
  };
}

function selectField(field, note, choices, defaultValue) {
  return stringField(field, note, {
    interface: 'select-dropdown',
    required: true,
    defaultValue,
    options: { choices: choices.map(([text, value]) => ({ text, value })) },
  });
}

function relationField(field, note, template, required = false) {
  return {
    field,
    type: 'integer',
    meta: {
      interface: 'select-dropdown-m2o',
      display: 'related-values',
      display_options: { template },
      note,
      required,
      width: 'full',
    },
    schema: { is_nullable: !required },
  };
}

async function findFirst(collection, filters) {
  const query = new URLSearchParams({ limit: '1' });
  for (const [field, value] of Object.entries(filters)) {
    query.set(`filter[${field}][_eq]`, String(value));
  }
  const result = await request(`/items/${collection}?${query.toString()}`);
  return result.data[0] ?? null;
}

async function createItem(collection, data) {
  const result = await request(`/items/${collection}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.data;
}

async function configureProject() {
  await request('/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      project_name: 'Bot Content CMS',
      project_descriptor: 'Единая CMS контента для ботов',
      auth_login_attempts: null,
    }),
  });
}

async function createSchema() {
  await ensureCollection('content_bots', {
    icon: 'smart_toy',
    note: 'Изолированные контентные пространства ботов',
    display_template: '{{name}}',
  });
  await ensureCollection('bot_settings', {
    icon: 'settings',
    note: 'Настройки и fallback каждого бота',
    display_template: '{{bot.name}}',
    singleton: false,
  });
  await ensureCollection('responses', {
    icon: 'forum',
    note: 'Готовые сценарии ответов',
    display_template: '{{name}}',
  });
  await ensureCollection('media_assets', {
    icon: 'perm_media',
    note: 'Исходники на Яндекс Диске и готовые идентификаторы платформ',
    display_template: '{{name}} — {{status}}',
  });
  await ensureCollection('keywords', {
    icon: 'key',
    note: 'Ключевые фразы конкретных ботов',
    display_template: '{{phrase}}',
  });
  await ensureCollection('response_blocks', {
    icon: 'view_agenda',
    note: 'Текстовые и медиаблоки ответов',
    display_template: '{{sort}}. {{kind}}',
    sort_field: 'sort',
  });
  await ensureCollection('response_buttons', {
    icon: 'smart_button',
    note: 'Кнопки под ответами',
    display_template: '{{label}}',
    sort_field: 'sort',
  });
  await ensureCollection('media_deliveries', {
    icon: 'cloud_done',
    note: 'Технические идентификаторы медиа после подготовки для каждой платформы',
    display_template: '{{platform}} — {{status}}',
    hidden: true,
  });

  const fields = {
    content_bots: [
      stringField('key', 'Технический ключ: латиница, цифры и дефисы', {
        required: true,
        unique: true,
      }),
      stringField('name', 'Понятное название бота', { required: true }),
      selectField(
        'platform',
        'Канал, в котором работает бот',
        [
          ['VK', 'vk'],
          ['Telegram', 'telegram'],
          ['Instagram', 'instagram'],
          ['Другое', 'other'],
        ],
        'other',
      ),
      selectField(
        'status',
        'Активный бот может читать контент',
        [
          ['Активен', 'active'],
          ['Приостановлен', 'paused'],
        ],
        'active',
      ),
      textField('description', 'Кратко: для чего этот бот'),
    ],
    bot_settings: [
      relationField('bot', 'Какому боту принадлежат настройки', '{{name}}'),
      textField('unknown_message', 'Короткий fallback-текст'),
      relationField(
        'fallback_response',
        'Необязательный полный fallback-ответ',
        '{{name}}',
      ),
    ],
    responses: [
      relationField('bot', 'Владелец ответа', '{{name}}'),
      stringField('name', 'Название для редактора', { required: true }),
      selectField(
        'status',
        'Выдаются только опубликованные ответы',
        [
          ['Черновик', 'draft'],
          ['Опубликован', 'published'],
        ],
        'draft',
      ),
      textField('fallback_text', 'Текст, если блоки ответа пусты'),
    ],
    media_assets: [
      relationField('bot', 'Для какого бота готовится вложение', '{{name}}'),
      stringField('name', 'Понятное название материала', { required: true }),
      selectField(
        'kind',
        'Как материал будет отправлен пользователю',
        [
          ['Фотография', 'photo'],
          ['Видео', 'video'],
          ['Аудиофайл', 'audio'],
          ['Документ', 'document'],
        ],
        'document',
      ),
      stringField('yandex_path', 'Полный путь на Яндекс Диске', { required: true }),
      selectField(
        'status',
        'Для подготовки выберите «В очереди»',
        [
          ['Черновик', 'draft'],
          ['В очереди', 'queued'],
          ['Обрабатывается', 'processing'],
          ['Готов', 'ready'],
          ['Ошибка', 'error'],
        ],
        'draft',
      ),
      stringField('vk_attachment', 'Готовый VK ID — только для VK-ботов'),
      stringField('telegram_file_id', 'Готовый Telegram file_id — только для Telegram-ботов', {
        maxLength: 1024,
      }),
      stringField(
        'telegram_file_unique_id',
        'Стабильный Telegram ID для диагностики; не используется для отправки',
      ),
      stringField('mime_type', 'MIME-тип', { width: 'half' }),
      {
        field: 'file_size',
        type: 'bigInteger',
        meta: { interface: 'input', note: 'Размер в байтах', width: 'half' },
        schema: { is_nullable: true },
      },
      textField('error_message', 'Последняя ошибка подготовки'),
    ],
    keywords: [
      relationField('bot', 'Бот, которому принадлежит правило', '{{name}}'),
      stringField('phrase', 'Ключевая фраза', { required: true }),
      selectField(
        'match_mode',
        'Как сравнивать сообщение с фразой',
        [
          ['Точно', 'exact'],
          ['Содержит фразу', 'contains'],
          ['Любое слово', 'any_word'],
          ['Все слова', 'all_words'],
        ],
        'contains',
      ),
      integerField('priority', 'Более высокий приоритет побеждает', 100),
      booleanField('enabled', 'Правило участвует в поиске', true),
      relationField('response', 'Какой ответ выдать', '{{name}}', true),
    ],
    response_blocks: [
      relationField('response', 'Ответ-владелец', '{{name}}', true),
      integerField('sort', 'Порядок: 10, 20, 30…', 10),
      selectField(
        'kind',
        'Тип блока',
        [
          ['Текст', 'text'],
          ['Фотография', 'photo'],
          ['Видео', 'video'],
          ['Аудиофайл', 'audio'],
          ['Документ', 'document'],
        ],
        'text',
      ),
      textField('body', 'Текст блока; для старого медиа без Media Asset — URL или file_id'),
      relationField('media', 'Подготовленный материал', '{{name}} — {{status}}'),
      booleanField('send_separately', 'Отправить отдельным сообщением', false),
      booleanField('enabled', 'Блок включён', true),
    ],
    response_buttons: [
      relationField('response', 'Ответ-владелец', '{{name}}', true),
      stringField('label', 'Подпись не больше 40 символов', { required: true, maxLength: 40 }),
      selectField(
        'action',
        'Команда бота или URL',
        [
          ['Команда', 'text'],
          ['Ссылка', 'open_link'],
        ],
        'text',
      ),
      stringField('target', 'Ключевая фраза или https:// URL', { required: true }),
      selectField(
        'color',
        'Цвет кнопки-команды',
        [
          ['Синий', 'primary'],
          ['Серый', 'secondary'],
          ['Зелёный', 'positive'],
          ['Красный', 'negative'],
        ],
        'primary',
      ),
      integerField('row_number', 'Ряд от 1 до 6', 1),
      integerField('sort', 'Порядок внутри ряда', 10),
      booleanField('enabled', 'Кнопка включена', true),
    ],
    media_deliveries: [
      relationField('media', 'Исходный материал', '{{name}}', true),
      selectField(
        'platform',
        'Платформа, для которой подготовлен материал',
        [
          ['VK', 'vk'],
          ['Telegram', 'telegram'],
          ['Instagram', 'instagram'],
          ['Другое', 'other'],
        ],
        'other',
      ),
      selectField(
        'status',
        'Состояние подготовки на платформе',
        [
          ['В очереди', 'queued'],
          ['Обрабатывается', 'processing'],
          ['Готов', 'ready'],
          ['Ошибка', 'error'],
        ],
        'queued',
      ),
      stringField('external_reference', 'Готовый ID вложения на платформе', {
        maxLength: 1024,
      }),
      textField('error_message', 'Последняя ошибка подготовки'),
      {
        field: 'prepared_at',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          note: 'Когда вложение было подготовлено',
          readonly: true,
          width: 'half',
        },
        schema: { is_nullable: true },
      },
      {
        field: 'expires_at',
        type: 'timestamp',
        meta: {
          interface: 'datetime',
          note: 'Когда ID нужно подготовить заново',
          readonly: true,
          width: 'half',
        },
        schema: { is_nullable: true },
      },
    ],
  };

  for (const [collection, definitions] of Object.entries(fields)) {
    for (const definition of definitions) await ensureField(collection, definition);
  }

  const relations = [
    ['bot_settings', 'bot', 'content_bots', 'CASCADE'],
    ['bot_settings', 'fallback_response', 'responses', 'SET NULL'],
    ['responses', 'bot', 'content_bots', 'CASCADE'],
    ['media_assets', 'bot', 'content_bots', 'CASCADE'],
    ['keywords', 'bot', 'content_bots', 'CASCADE'],
    ['keywords', 'response', 'responses', 'CASCADE'],
    ['response_blocks', 'response', 'responses', 'CASCADE'],
    ['response_blocks', 'media', 'media_assets', 'SET NULL'],
    ['response_buttons', 'response', 'responses', 'CASCADE'],
    ['media_deliveries', 'media', 'media_assets', 'CASCADE'],
  ];
  for (const relation of relations) await ensureRelation(...relation);
}

async function ensureInitialBot() {
  let bot = await findFirst('content_bots', { key: initialBotKey });
  if (!bot) {
    bot = await createItem('content_bots', {
      key: initialBotKey,
      name: initialBotName,
      status: 'active',
    });
    console.log(`Created bot registry entry: ${initialBotKey}`);
  }

  for (const collection of ['bot_settings', 'responses', 'media_assets', 'keywords']) {
    const result = await request(`/items/${collection}?filter[bot][_null]=true&fields=id&limit=-1`);
    for (const item of result.data) {
      await request(`/items/${collection}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ bot: bot.id }),
      });
    }
  }

  let settings = await findFirst('bot_settings', { bot: bot.id });
  if (!settings) {
    settings = await createItem('bot_settings', {
      bot: bot.id,
      unknown_message: 'Не нашёл подходящего материала. Попробуйте другое ключевое слово.',
    });
  }

  for (const collection of ['bot_settings', 'responses', 'media_assets', 'keywords']) {
    await request(`/fields/${collection}/bot`, {
      method: 'PATCH',
      body: JSON.stringify({ meta: { required: true }, schema: { is_nullable: false } }),
    });
  }

  return { bot, settings };
}

async function backfillBotPlatforms() {
  const result = await request('/items/content_bots?fields=id,key,platform&limit=-1');
  for (const bot of result.data) {
    if (bot.platform && bot.platform !== 'other') continue;
    const platform = bot.key.startsWith('vk-')
      ? 'vk'
      : bot.key.startsWith('telegram-')
        ? 'telegram'
        : bot.key.startsWith('instagram-')
          ? 'instagram'
          : null;
    if (!platform) continue;
    await request(`/items/content_bots/${bot.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ platform }),
    });
    console.log(`Set platform for ${bot.key}: ${platform}`);
  }
}

async function seedDemo(bot) {
  let response = await findFirst('responses', { bot: bot.id, name: 'Справка по боту' });
  if (!response) {
    response = await createItem('responses', {
      bot: bot.id,
      name: 'Справка по боту',
      status: 'published',
      fallback_text: 'Напишите ключевое слово.',
    });
  }

  if (!(await findFirst('response_blocks', { response: response.id, sort: 10 }))) {
    await createItem('response_blocks', {
      response: response.id,
      sort: 10,
      kind: 'text',
      body: 'Бот работает. Контент настраивается в Directus.',
      send_separately: false,
      enabled: true,
    });
  }

  if (!(await findFirst('keywords', { bot: bot.id, phrase: 'помощь' }))) {
    await createItem('keywords', {
      bot: bot.id,
      phrase: 'помощь',
      match_mode: 'exact',
      priority: 1000,
      response: response.id,
      enabled: true,
    });
  }
}

await waitForDirectus();
await configureProject();
await createSchema();
await backfillBotPlatforms();
const { bot } = await ensureInitialBot();
if (seedDemoContent) await seedDemo(bot);
console.log('Directus multi-bot schema is ready.');
