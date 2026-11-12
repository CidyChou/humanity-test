#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${1:-8765}"
IP=$(python3 - <<'PY'
import socket
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
try:
    s.connect(('8.8.8.8',80)); print(s.getsockname()[0])
except OSError:
    print('127.0.0.1')
finally:
    s.close()
PY
)
echo "Local: http://localhost:$PORT"
echo "LAN:   http://$IP:$PORT (phone must be on the same network)"
python3 -m http.server "$PORT" --bind 0.0.0.0
