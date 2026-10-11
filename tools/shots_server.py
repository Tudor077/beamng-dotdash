"""Serve the project for tools/shots.html and save the PNGs it posts.

    python tools/shots_server.py        then open http://127.0.0.1:8767/tools/shots.html

/ui/... is served from the installed game, so the shots use exactly the fonts
the public build uses (BeamNG's own Overpass / Overpass Mono). POST /save
with {"name": "...", "png": "data:image/png;base64,..."} writes docs/img/<name>.png.
"""

import base64
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME_UI = os.environ.get("BEAMNG_UI", r"C:\Users\Steam\steamapps\common\BeamNG.drive\ui")
OUT = os.path.join(HERE, "docs", "img")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def translate_path(self, path):
        if path.startswith("/ui/"):
            return os.path.join(GAME_UI, *path.split("?")[0][4:].split("/"))
        return super().translate_path(path)

    def do_POST(self):
        if self.path != "/save":
            self.send_error(404)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        name = re.sub(r"[^\w-]", "", body["name"])
        data = base64.b64decode(body["png"].split(",", 1)[1])
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, name + ".png"), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8767), Handler).serve_forever()
