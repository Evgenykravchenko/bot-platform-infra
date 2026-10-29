# Production operations

## Проверка

```bash
cd /opt/bot-platform-infra
./scripts/status.sh
curl --fail --silent https://bot-content-cms.tailcc0b45.ts.net/server/health
```

Нормальное состояние:

- `database`, `cache`, `directus` — `healthy`;
- `cms-bootstrap` — `Exited (0)`;
- `tailscale` — `Up`;
- health endpoint отвечает `ok`.

## Обновление

```bash
cd /opt/bot-platform-infra
git fetch --tags origin
git checkout v1.2.3
./scripts/deploy.sh
```

`deploy.sh` сначала проверяет Compose, затем получает образы и ожидает healthchecks. Другие Compose-проекты не затрагиваются.

## BotCRM через существующий runner

Если локальный SSH недоступен, готовый релиз BotCRM можно выкатить workflow **Deploy BotCRM release** в этом репозитории. Он использует уже установленный `bot-platform-prod` runner на Raspberry и не применяет Compose общей инфраструктуры.

1. Откройте опубликованный релиз `Evgenykravchenko/botcrm` и получите его полный SHA коммита.
2. В Actions → **Deploy BotCRM release** → **Run workflow** укажите версию без `v` и этот SHA.
3. Дождитесь успешных проверок выкатки. Публикация образов или релиза VK-бота сама по себе его не обновляет; для VK используется отдельный workflow его репозитория.

Workflow работает только с `/opt/botcrm`, требует чистую `main` и существующий `.env.production`, сверяет тег с утверждённым SHA и проверяет, что коммит входит в `origin/main`. Переход допускается только fast-forward. Секреты не выводятся и не перезаписываются.

Проверки готовности, блокировка параллельной выкатки, blue/green-переключение и откат остаются в штатном `infra/scripts/deploy.mjs` BotCRM. Directus, общая БД, Tailscale и остальные боты этим workflow не перезапускаются. Конфигурация runner и его права остаются прежними.

## Rollback общей инфраструктуры

```bash
cd /opt/bot-platform-infra
git checkout v1.2.2
./scripts/deploy.sh
```

Для rollback не нужно и нельзя удалять volumes.

## Секреты

Production env хранится в `/etc/bot-platform/infra.env`, имеет права `600` и не копируется в runner workspace.

После изменения env:

```bash
cd /opt/bot-platform-infra
./scripts/deploy.sh
```

## Чего не делать

- Не запускать `docker compose down -v`.
- Не менять Compose project name `bot-content-platform`: он связан с именами volumes.
- Не публиковать PostgreSQL, Redis и Directus на host ports.
- Не подключать BotCRM к `bot_platform_backend`.
- Не хранить `.env`, database dumps и Tailscale state в Git.

## Резервные копии

Автоматический backup в этом репозитории намеренно не настроен. Яндекс Диск используется только для контента.

