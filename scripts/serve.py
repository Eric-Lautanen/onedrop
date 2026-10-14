#!/usr/bin/env python3
"""
ONE DROP PINBALL  --  launch server
===================================
A zero-dependency static server for the game. Run it from the "Games"
folder (or anywhere) and it will locate the Pinball folder next to it,
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
import os
import socket
import socketserver
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))


def pick_root(explicit):
    """Find the folder that actually holds index.html."""
    if explicit:
        root = os.path.abspath(explicit)
        if not os.path.isfile(os.path.join(root, "index.html")):
            sys.exit("No index.html in %s" % root)
        return root

    candidates = [
        os.path.join(HERE, "Pinball"),
        HERE,
        os.path.join(HERE, "..", "Pinball"),
    ]
    for c in candidates:
        c = os.path.abspath(c)
        if os.path.isfile(os.path.join(c, "index.html")):
            return c
    sys.exit(
        "Could not find index.html near %s.\n"
        "Point at it explicitly:  python serve.py --root path/to/Pinball" % HERE
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
    """Adds no-cache headers so edits to the game show up on refresh."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
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
    args = ap.parse_args()

    root = pick_root(args.root)
    port = free_port(args.port)
    if port == 0:
        sys.exit("No free port found near %d" % args.port)

    handler = functools.partial(Handler, directory=root)
    httpd = Server(("127.0.0.1", port), handler)

    url = "http://127.0.0.1:%d/" % port
    print(BANNER)
    print("  serving : %s" % root)
    print("  address : %s" % url)
    print("  stop    : Ctrl+C\n")
    print("  Controls:  Z / LEFT  = left flipper     / / RIGHT = right flipper")
    print("             SPACE hold + release = plunge     A / D   = nudge")
    print("             M = sound    P = pause    F = fullscreen\n")

    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  later, dread. one love.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
