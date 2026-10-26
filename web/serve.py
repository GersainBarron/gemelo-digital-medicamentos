# Gemelo digital del abasto de medicamentos · © 2026 Gersain Barron · Licencia MIT
"""
Servidor local para el visor 3D del almacén.
Uso:  python serve.py [puerto]      (por defecto 8080)
Sirve esta carpeta en toda la red local para abrirla desde el iPad
(misma red Wi-Fi) con los tipos MIME correctos para módulos JS y .glb.
"""
import http.server, socketserver, socket, sys, os, functools

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".css": "text/css",
        ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    }
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # silencioso

def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))   # no envía datos; solo elige la interfaz de red
        ips.add(s.getsockname()[0]); s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except OSError:
        pass
    return sorted(ips)

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    with Server(("0.0.0.0", PORT), handler) as httpd:
        print("=" * 60)
        print("  CEDIS Medicamentos · Visor 3D")
        print("=" * 60)
        print(f"  En esta PC:   http://localhost:{PORT}")
        for ip in lan_ips():
            print(f"  En el iPad:   http://{ip}:{PORT}")
        print("\n  (El iPad debe estar en la misma red Wi-Fi.)")
        print("  Cierra esta ventana o presiona Ctrl+C para detener.")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
