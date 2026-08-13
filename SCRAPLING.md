# Scrapling як MCP-сервер

[Scrapling](https://github.com/D4Vinci/Scrapling) 0.4.x підключено у `.mcp.json`
як MCP-сервер `scrapling`. Це інструмент для **Claude у сесіях над цим репозиторієм**:
читати зовнішні сторінки (сайти постачальників, документація) без ручного curl.
На сам юзерскрипт і на СРМ він НЕ впливає — це Python-збоку, поза браузером.

Запуск описано декларативно, ставити нічого не треба: `uvx` сам тягне
`scrapling[ai]` у кеш при першому старті (~10 с), потім миттєво.
Єдина вимога — щоб на машині був `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`).

## Інструменти (10)

| Інструмент | Що робить |
|---|---|
| `get`, `bulk_get` | HTTP-запит через curl_cffi з TLS-імперсонацією браузера. Швидко, без браузера |
| `fetch`, `bulk_fetch` | Сторінка у справжньому Chromium (JS виконується) |
| `stealthy_fetch`, `bulk_stealthy_fetch` | Те саме + антибот-режим (Cloudflare, фінгерпринти) |
| `open_session`, `close_session`, `list_sessions` | Сесія браузера з кукі між викликами |
| `screenshot` | Знімок сторінки (потрібен `session_id`) |

Корисні аргументи: `css_selector` (віддати лише потрібний шматок), `main_content_only`
(викинути меню/футер), `extraction_type` (`html`/`markdown`/`text`), `impersonate`,
`cookies`, `headers`, `proxy`, `timeout`, `retries`.

## Перевірка

```bash
bash tools/scrapling-setup.sh      # один раз на контейнер (див. нижче)
python3 tools/scrapling-check.py   # жива перевірка: сервер + get + браузерний fetch
python3 tools/scrapling-check.py https://якийсь.сайт/  # get на свій URL
```

## Три граблі, перевірені наживо (13.08.2026)

**1. Egress-політика середовища ріже майже все.** У віддаленому контейнері Claude Code
дозволений лише вузький список хостів. `example.com`, `rozetka.com.ua`, `novaposhta.ua`,
`readthedocs.io` — усі дають `CONNECT tunnel failed, response 403` від проксі. Це політика
мережі, а не поламаний scrapling; обходити її не можна.
**Висновок:** щоб реально парсити сайти постачальників, потрібно або розширити мережеву
політику середовища (див. https://code.claude.com/docs/en/claude-code-on-the-web),
або запускати Claude Code локально, де ліміту немає. Перевірити хост:
`python3 tools/scrapling-check.py https://хост/`.

**2. Браузерні інструменти без CA проксі падають з `ERR_CERT_AUTHORITY_INVALID`.**
Увесь HTTPS іде через проксі з перевипуском TLS; `get`/`bulk_get` (curl_cffi) читають
`CURL_CA_BUNDLE` і працюють одразу, а Chromium має власне сховище NSS і CA там немає.
Лікується `bash tools/scrapling-setup.sh` — він ставить `certutil` і **додає** CA у
`~/.pki/nssdb` (перевірку сертифікатів НЕ вимикаємо). Контейнер ефемерний, тож після
кожного нового старту сесії скрипт треба прогнати ще раз — коли потрібні саме
`fetch`/`stealthy_fetch`/`screenshot`.

**3. Для самої СРМ обовʼязково `impersonate: "safari18_0"`.** Та сама відома
несумісність TLS SalesDrive, через яку e2e-стенд ганяє трафік Node-мостом:
Chromium і `impersonate` chrome*/firefox* отримують `Connection reset by peer`,
а Safari-фінгерпринт проходить — `get` на `komplektom.salesdrive.me` віддає HTTP 200.
Браузерний `fetch` на СРМ так само рветься (`ERR_CONNECTION_RESET`).

```jsonc
// приклад виклику get для СРМ
{ "url": "https://komplektom.salesdrive.me/...", "impersonate": "safari18_0" }
```

**Але для роботи зі СРМ це не заміна e2e-стенду.** `e2e/bridge.js` дає авторизовану
сесію (`sd-session.json`), інжекцію юзерскрипта і кліки — scrapling цього не робить.
Тестування версій скрипта — як і раніше через `e2e/smoke.js`. Ліміт публічного API
СРМ (100 запитів/год) поширюється й на запити з scrapling — правила з `CLAUDE.md`
діють без змін.
