# E2E-стенд: тестування скрипта на живій CRM

Обхід несумісності TLS SalesDrive із Chromium: браузер малює сторінку,
а весь трафік іде через Node-міст (`bridge.js`). Скрипт інжектиться в
сторінку з шимом GM_* (`gm-shim-page.js`) — як у Tampermonkey.

## Використання (у сесії Claude Code)
1. Вхід (одноразово на сесію; логін/пароль тестового акаунта НЕ комітити):
   `SD_LOGIN=... SD_PASS=... NODE_PATH=$(npm root -g) node e2e/login.js`
2. Димовий тест ТЕСТ-версії:
   `NODE_PATH=$(npm root -g) node e2e/smoke.js` (список заявок)
   `NODE_PATH=$(npm root -g) node e2e/smoke.js "#/order/update/304551"` (картка)

Дані таблиць/сервера каси можна підкладати фікстурами через route
(див. історію: sd-test3.js) — Google-таблиці читаються через Drive-MCP.

⚠️ Тести read-only: нічого не клікати, що зберігає зміни у заявках.
`sd-session.json` — секрет, у .gitignore.
