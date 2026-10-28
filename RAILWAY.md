# Деплой на Railway

Проект уже готов: в корне есть `Dockerfile` (режим `HH_MODE=multi`, порт берётся из `PORT`) и `railway.json`
(сборка из Dockerfile, healthcheck `/api/status`, одна реплика, перезапуск при падении).

## Шаги

1. Залей эту папку в свой GitHub-репозиторий (или сделай fork `KrasimirKralev/harvest-hollow`).
2. Railway → **New Project → Deploy from GitHub repo** → выбери репозиторий. Railway сам найдёт `railway.json` и `Dockerfile`.
3. Открой сервис → **Volumes → New Volume**, **Mount Path: `/data`** (1 GB хватит). Без тома фермы пропадут при каждом деплое.
4. **Settings → Networking → Generate Domain**: получишь публичную ссылку `https://<имя>.up.railway.app`.
5. Убедись, что **Replicas = 1** (фермы живут в памяти одного процесса и на одном томе).

Переменные окружения обязательны не нужны. Необязательные:

| Переменная | Значение по умолчанию | Зачем |
|---|---|---|
| `HH_MAX_FARMS` | `500` | сколько ферм хранить |
| `HH_FARM_TTL_DAYS` | `7` | через сколько дней без заходов ферма удаляется |
| `HH_TZ` | UTC | часовой пояс ферм по умолчанию, например `Asia/Tashkent` |
| `HH_MAX_LOADED` | `64` | ферм в памяти одновременно (при 1 GB RAM можно 200–300) |
| `HH_ADMIN_TOKEN` | не задан | токен для админ-маршрутов (идеи игроков), минимум 24 символа |

`HH_HELPER` (помощник Harvey) на публичном хосте выключен: ему нужны вход через Claude/ChatGPT и условия провайдеров.

## Проверка

После деплоя открой `https://<твой-домен>/api/status`, должен прийти JSON с `ok: true`.
Полная инструкция автора: `deploy/cloud.md`.
