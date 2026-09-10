# Bot Platform Infrastructure

Общая контентная платформа для VK-, Telegram- и других ботов. Одна CMS обслуживает несколько ботов, но ключевые слова, ответы, fallback и медиа не смешиваются.

> BotCRM не входит в этот Compose-проект. У него остаются свои PostgreSQL, Redis, MinIO и свой цикл обновлений.

## Что здесь живёт

```text
Internet
   │
   ▼
Tailscale Funnel ──► Directus
                         ├── PostgreSQL
                         └── Redis

vk-content-bot ────────▲
future-bot ──────────▲  закрытая Docker-сеть bot_platform_backend
```

| Сервис | Назначение | Доступ снаружи |
| --- | --- | --- |
| Directus | Единый редактор контента | HTTPS через Funnel |
| PostgreSQL | Постоянные данные CMS | нет |
| Redis | Кеш и rate limiting Directus | нет |
| Schema bootstrap | Идемпотентно обновляет схему | нет |

Яндекс Диск не является backup-хранилищем. Он используется ботами только как источник тяжёлых медиа.

## Границы репозиториев

- `bot-platform-infra` владеет CMS, её базой, Redis, сетями и Tailscale.
- `vk-content-bot` содержит только код бота, тесты, Docker image и application Compose.
- Новая тематика в том же движке — это новая запись `content_bots`, а не новая база.
- Новый репозиторий бота нужен только при другой бизнес-логике.

## Локальный запуск

```bash
cp .env.example .env
docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d
```

CMS: <http://localhost:8055/admin>

Остановка без удаления данных:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local.yaml down
```

Не добавляйте `-v`: этот флаг удаляет volume базы.

## Production

На Raspberry Pi checkout лежит в `/opt/bot-platform-infra`, а секреты — в `/etc/bot-platform/infra.env`.

```bash
sudo install -d -m 750 -o "$USER" /opt/bot-platform-infra
sudo install -d -m 750 -o "$USER" /etc/bot-platform
sudo install -m 600 -o "$USER" .env.example /etc/bot-platform/infra.env
ENV_FILE=/etc/bot-platform/infra.env ./scripts/deploy.sh
```

Production Compose не публикует `5432`, `6379` и `8055`. Боты обращаются к `http://directus:8055` по сети `bot_platform_backend`.

## Добавление бота

```bash
docker compose \
  --env-file /etc/bot-platform/infra.env \
  -f compose.yaml \
  -f compose.production.yaml run --rm \
  -e BOT_KEY=catalog-bot \
  -e BOT_NAME="Каталог" \
  cms-bootstrap node /app/create-bot.mjs
```

Для обычной работы проще создать запись в `Content Bots` и связанную запись в `Bot Settings`. Полная инструкция: [docs/ADD_BOT.md](docs/ADD_BOT.md).

## CI и релизы

- PR и `main` проверяют Compose и JavaScript bootstrap.
- Workflow `Release` создаёт SemVer tag и GitHub Release с автоматическими notes.
- Production deployment запускается вручную из GitHub Environment `production`.
- Self-hosted runner копирует релиз в `/opt`; Compose не запускается из `_work` runner.

Операции, rollback и обновления описаны в [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Правила

- Секреты не хранятся в Git.
- Не используются `latest` для образов ботов.
- Каждый бот получает уникальный `CONTENT_BOT_KEY`.
- Порты stateful-сервисов не открываются на хосте.
- BotCRM и сторонние Compose-проекты не подключаются к сетям CMS.
- Коммиты следуюют Conventional Commits.

MIT License.
