# Как добавить бота

## 1. Выберите ключ

`key` — это стабильный технический идентификатор. Используйте латиницу, цифры и дефисы:

```text
vk-content-bot
fitness-club
course-support
```

Ключ не меняется после запуска: его хранит `CONTENT_BOT_KEY` в окружении приложения.

## 2. Создайте запись

В Directus:

1. Откройте **Content Bots**.
2. Заполните `Name`, `Key`, выберите платформу и `Active`.
3. Откройте **Bot Settings**.
4. Создайте ровно одну запись настроек для нового бота.
5. Задайте текст для неизвестной команды.

## 3. Настройте приложение

В env-файле конкретного бота:

```dotenv
CONTENT_BOT_KEY=fitness-club
DIRECTUS_URL=http://directus:8055
DIRECTUS_TOKEN=replace-on-server
```

Один Directus и одна база обслуживают всех ботов. Каждый процесс фильтрует данные по `CONTENT_BOT_KEY`.

Автоматизированный вариант для администратора:

```shell
BOT_KEY=fitness-club \
BOT_NAME='Fitness Club' \
BOT_PLATFORM=instagram \
DIRECTUS_URL=https://cms.example.ts.net \
DIRECTUS_TOKEN=replace-on-server \
node scripts/create-bot.mjs
```

`BOT_PLATFORM` принимает `vk`, `telegram`, `instagram` или `other`. Главным ключом
изоляции остаётся уникальный `BOT_KEY`.

Для Telegram-бота с подготовкой файлов также задаются:

```dotenv
YANDEX_DISK_TOKEN=replace-on-server
TELEGRAM_MEDIA_CHAT_ID=
```

Если `TELEGRAM_MEDIA_CHAT_ID` пуст, worker использует закрытую группу заявок из `TELEGRAM_ADMIN_CHAT_ID`: один раз загружает файл, сохраняет постоянный `file_id` и удаляет техническое сообщение. Отдельная группа не требуется.

## 4. Заполните контент

При создании `Responses`, `Keywords` и `Media Assets` всегда выбирайте нужного бота. Блоки и кнопки получают владельца через связанный ответ.

## 5. Smoke test

Перед публикацией проверьте:

- точное ключевое слово;
- неизвестную фразу и fallback;
- кнопку-команду;
- кнопку-ссылку;
- каждый используемый тип медиа;
- что другой бот не видит эти ключевые слова.

Для Telegram-медиа дополнительно проверьте цепочку:

```text
Яндекс Диск → queued → processing → ready → telegram_file_id
```

Для Instagram-медиа:

```text
Яндекс Диск → queued → Meta Attachment Upload → media_deliveries → ready
```

`media_deliveries` — техническая коллекция. Редактор контента её не заполняет.
