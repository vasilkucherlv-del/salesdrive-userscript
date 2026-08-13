#!/usr/bin/env bash
# Готує браузерні інструменти scrapling-MCP (fetch / stealthy_fetch / screenshot)
# у контейнері Claude Code: додає CA агент-проксі у сховище NSS, яке читає Chromium.
#
# Навіщо: увесь HTTPS іде через проксі з перевипуском TLS. curl_cffi (інструменти
# get/bulk_get) бере CA з CURL_CA_BUNDLE і працює одразу, а Chromium його не бачить
# і падає з ERR_CERT_AUTHORITY_INVALID. Ми ДОДАЄМО довіру до CA, а не вимикаємо
# перевірку сертифікатів.
#
# Запуск (один раз на контейнер): bash tools/scrapling-setup.sh
set -euo pipefail

CA="${CCR_PROXY_CA:-$HOME/.ccr/agent-proxy-ca.crt}"
NSSDB="$HOME/.pki/nssdb"
NICK="ccr-agent-proxy"

command -v uvx >/dev/null || {
  echo "✗ немає uvx (uv). Постав: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
echo "✓ uvx: $(command -v uvx)"

[ -f "$CA" ] || { echo "ℹ CA проксі не знайдено ($CA) — локальна машина без проксі, нічого робити"; exit 0; }

if ! command -v certutil >/dev/null; then
  echo "… ставлю certutil (libnss3-tools)"
  SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq libnss3-tools
fi

mkdir -p "$NSSDB"
[ -f "$NSSDB/cert9.db" ] || certutil -d "sql:$NSSDB" -N --empty-password

if certutil -d "sql:$NSSDB" -L | grep -q "^$NICK "; then
  echo "✓ CA вже у NSS ($NSSDB)"
else
  certutil -d "sql:$NSSDB" -A -t "C,," -n "$NICK" -i "$CA"
  echo "✓ CA додано у NSS ($NSSDB)"
fi

echo "Готово. Перевірка: python3 tools/scrapling-check.py"
