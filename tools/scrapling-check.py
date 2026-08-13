#!/usr/bin/env python3
"""Жива перевірка scrapling-MCP: піднімає сервер по stdio і викликає інструменти.

Запуск:  python3 tools/scrapling-check.py            # повна перевірка
         python3 tools/scrapling-check.py URL        # get на свій URL

Перевіряє три речі:
  1. сервер стартує і віддає перелік інструментів;
  2. HTTP-інструмент get дістає сторінку СРМ (потрібен impersonate=safari*,
     див. SCRAPLING.md — на chrome/firefox SalesDrive рве зʼєднання);
  3. браузерний fetch працює (тобто CA проксі є в NSS — tools/scrapling-setup.sh).
Нічого не зберігає і не змінює: тільки GET.
"""
import json
import subprocess
import sys
import time

SERVER = ["uvx", "--from", "scrapling[ai]>=0.4.14,<0.5", "scrapling-mcp",
          "--executable-path", "/opt/pw-browsers/chromium"]
SD_URL = "https://komplektom.salesdrive.me/auth/login/"
BROWSER_URL = "https://github.com/robots.txt"


class Client:
    def __init__(self):
        self.p = subprocess.Popen(SERVER, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.id = 0

    def _send(self, obj):
        self.p.stdin.write(json.dumps(obj) + "\n")
        self.p.stdin.flush()

    def call(self, method, params=None, timeout=240):
        self.id += 1
        mid = self.id
        self._send({"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            line = self.p.stdout.readline()
            if not line:
                raise SystemExit("✗ сервер закрив stdout (не стартував?)")
            if line.strip():
                msg = json.loads(line)
                if msg.get("id") == mid:
                    if msg.get("error"):
                        raise SystemExit("✗ RPC: " + json.dumps(msg["error"], ensure_ascii=False))
                    return msg["result"]
        raise SystemExit("✗ таймаут на %s" % method)

    def tool(self, name, args, timeout=240):
        r = self.call("tools/call", {"name": name, "arguments": args}, timeout)
        text = (r.get("content") or [{}])[0].get("text", "")
        return bool(r.get("isError")), text

    def notify(self, method):
        self._send({"jsonrpc": "2.0", "method": method})


def status_of(text):
    try:
        return json.loads(text).get("status")
    except Exception:
        return None


def main():
    c = Client()
    info = c.call("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                 "clientInfo": {"name": "scrapling-check", "version": "1"}})
    c.notify("notifications/initialized")
    si = info.get("serverInfo", {})
    print("✓ сервер: %s %s" % (si.get("name"), si.get("version")))

    tools = [t["name"] for t in c.call("tools/list")["tools"]]
    print("✓ інструменти (%d): %s" % (len(tools), ", ".join(tools)))

    if len(sys.argv) > 1:
        bad, text = c.tool("get", {"url": sys.argv[1], "impersonate": "safari18_0", "retries": 1})
        print(("✗ " if bad else "✓ ") + sys.argv[1] + " → " + text[:400])
        return

    bad, text = c.tool("get", {"url": SD_URL, "impersonate": "safari18_0",
                               "main_content_only": True, "retries": 1})
    print(("✗ get СРМ: " + text[:300]) if bad else "✓ get СРМ: HTTP %s" % status_of(text))

    bad, text = c.tool("fetch", {"url": BROWSER_URL, "timeout": 60000}, timeout=300)
    if bad and "ERR_CERT_AUTHORITY_INVALID" in text:
        print("✗ браузерний fetch: немає CA проксі — запусти bash tools/scrapling-setup.sh")
    elif bad:
        print("✗ браузерний fetch: " + text[:300])
    else:
        # 403 від GitHub-шлюзу сесії — норма: важливо, що TLS пройшов і сторінка відкрилась
        print("✓ браузерний fetch: сторінка відкрилась (HTTP %s)" % status_of(text))

    c.p.terminate()


if __name__ == "__main__":
    main()
