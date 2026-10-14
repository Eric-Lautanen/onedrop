#!/usr/bin/env python3
"""
ONE DROP PINBALL  --  launch server
===================================
A zero-dependency static server for the game. Run it from the "Games"
folder (or anywhere) and it will locate the game root next to it
serve it on a free port and open your browser.

    python serve.py
    python serve.py --port 9000
    python serve.py --no-browser
    python serve.py --root somewhere/else

Only the Python standard library is used, so there is nothing to install.
"""

import argparse
import functools
import http.server
import mimetypes
import os
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))

# Python reads its MIME table from the OS, which on Windows comes from the
# registry and does not know every type the game ships -- .webp went out as
# application/octet-stream, which is not what a browser expects for an image
# it was told to PRELOAD as image/webp. Register the handful the game uses
# explicitly so this is the same on every platform.
for _ext, _ctype in (
    (".webp", "image/webp"),
    (".js", "text/javascript"),
    (".mjs", "text/javascript"),
    (".css", "text/css"),
    (".json", "application/json"),
    (".svg", "image/svg+xml"),
    (".ico", "image/x-icon"),
    (".woff2", "font/woff2"),
    (".wasm", "application/wasm"),
):
    mimetypes.add_type(_ctype, _ext)


def pick_root(explicit):
    """Find the folder that actually holds index.html."""
    if explicit:
        root = os.path.abspath(explicit)
        if not os.path.isfile(os.path.join(root, "index.html")):
            sys.exit("No index.html in %s" % root)
        return root

    candidates = [
        os.path.join(HERE, ".."),
        os.path.join(HERE, "..", "onedrop"),
        HERE,
    ]
    for c in candidates:
        c = os.path.abspath(c)
        if os.path.isfile(os.path.join(c, "index.html")):
            return c
    sys.exit(
        "Could not find index.html near %s.\n"
        "Point at it explicitly:  python serve.py --root path/to/onedrop" % HERE
    )


def free_port(preferred):
    """Return the first free TCP port at or after `preferred`."""
    for port in range(preferred, preferred + 40):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


class Handler(http.server.SimpleHTTPRequestHandler):
    """Revalidating cache headers, so edits show up on refresh.

    These said `no-store` -- which also forbade the browser from keeping a
    single byte, so every launch of the game re-sent all of it (1.35 MB of
    scripts + a 264 KB sheet) over a fresh connection. `no-cache` gives what
    the comment always wanted: the browser revalidates every time, and an
    unchanged file answers 304 Not Modified (handled by SimpleHTTPRequestHandler
    off the Last-Modified it sends) while an edited one comes down whole."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the console tidy: only report failures
        status = args[1] if len(args) > 1 else ""
        if isinstance(status, str) and status.startswith(("4", "5")):
            sys.stderr.write("  %s\n" % (fmt % args))

    def do_GET(self):
        if self.path in ("/favicon.ico",):
            self.send_response(204)
            self.end_headers()
            return
        if self.path in ("/ping", "/ping?"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        super().do_GET()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


BANNER = r"""
   ___  _  _ ___    ___  ___  ___  ___
  / _ \| \| | __|  |   \| _ \/ _ \| _ \
 | (_) | .` | _|   | |) |   / (_) |  _/
  \___/|_|\_|___|  |___/|_|_\\___/|_|
   R O O T S   *   D U B   *   S K A N K
"""


def main():
    ap = argparse.ArgumentParser(description="Serve the One Drop Pinball table.")
    ap.add_argument("--port", type=int, default=8080, help="preferred port (default 8080)")
    ap.add_argument("--root", default=None, help="folder containing index.html")
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser")
    ap.add_argument(
        "--app-window",
        action="store_true",
        help="open as a chromeless app window and exit when it closes "
        "(desktop-icon mode; needs Edge, falls back to a normal browser)",
    )
    args = ap.parse_args()

    root = pick_root(args.root)
    port = free_port(args.port)
    if port == 0:
        sys.exit("No free port found near %d" % args.port)

    handler = functools.partial(Handler, directory=root)
    httpd = Server(("127.0.0.1", port), handler)

    url = "http://127.0.0.1:%d/" % port
    if not args.app_window:
        print(BANNER)
        print("  serving : %s" % root)
        print("  address : %s" % url)
        print("  stop    : Ctrl+C\n")
        print("  Controls:  Z / LEFT  = left flipper     / / RIGHT = right flipper")
        print("             SPACE hold + release = plunge     A / D   = nudge")
        print("             M = sound    P = pause    F = fullscreen\n")
    else:
        print("  one drop: app window at %s" % url)

    if args.app_window:
        # Edge's --app mode: a chromeless window that looks like a desktop
        # game. msedge.exe is found through its App Paths registration, which
        # survives even when it is not on PATH -- Windows always has Edge.
        edge = shutil.which("msedge")
        if not edge:
            try:
                import winreg

                k = winreg.QueryValueEx(
                    winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                   r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"),
                    "",
                )[0]
                edge = k
            except Exception:
                edge = None
        closed = False
        if edge:
            proc = subprocess.Popen(
                [edge, "--app=" + url, "--start-maximized",
                 "--user-data-dir=" + os.path.join(tempfile.gettempdir(), "onedrop-edge-profile")],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            # Edge returns immediately (it hands off to a running browser);
            # watch the page's /ping heartbeat instead: the game pings every
            # 5 s while its window lives. Two misses in a row (= ~10 s of
            # silence) means the window is closed.
            misses = 0
            try:
                while not closed:
                    time.sleep(5)
                    try:
                        c = urllib.request.urlopen(url + "ping", timeout=4)
                        c.close()
                        misses = 0
                    except Exception:
                        misses += 1
                        try:
                            proc.wait(timeout=1)
                            closed = True       # edge process itself ended
                        except Exception:
                            closed = misses >= 2
            except KeyboardInterrupt:
                pass
        else:
            webbrowser.open(url)
            misses = 0
            try:
                while not closed:
                    time.sleep(5)
                    try:
                        c = urllib.request.urlopen(url + "ping", timeout=4)
                        c.close()
                        misses = 0
                    except Exception:
                        misses += 1
                        closed = misses >= 2
            except KeyboardInterrupt:
                pass
        # window closed (or Ctrl+C): stop the server and exit
        httpd.shutdown()
        httpd.server_close()
        print("\n  window closed -- server down. later, dread. one love.")
        return
    elif not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  later, dread. one love.")
        finally:
            httpd.server_close()
        return
    else:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  later, dread. one love.")
        finally:
            httpd.server_close()
        return

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  later, dread. one love.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
