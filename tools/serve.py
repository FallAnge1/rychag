"""Локальный сервер для разработки: отдаёт файлы проекта без кэширования.

Запуск из корня проекта:  python tools/serve.py   → http://localhost:5173
"""
import http.server
import socketserver
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 5173


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), partial(NoCache, directory=str(ROOT))) as httpd:
        print(f"http://localhost:{PORT}")
        httpd.serve_forever()
