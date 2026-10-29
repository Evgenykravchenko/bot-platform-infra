# Changelog

Notable changes are recorded in GitHub Releases generated from Conventional Commits.

## 0.3.0 — 2026-10-29

- Ручная выкатка утверждённых релизов BotCRM через существующий infrastructure runner, без зависимости от локального SSH.
- Проверка полного SHA, тега и принадлежности main перед штатным blue/green-развёртыванием BotCRM. Общий Compose и другие боты не перезапускаются.
- Тесты отказа при изменённом checkout, неверной версии, несовпадающем SHA и теге вне main.
