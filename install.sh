#!/bin/sh
set -eu

REPO="sylophi/port-pool"
DEST="${PORT_POOL_INSTALL_DIR:-$HOME/.local/bin}"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ASSET="port-pool-${OS}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

mkdir -p "$DEST"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

echo "Downloading $URL..." >&2
curl -fsSL "$URL" -o "$TMP"
chmod +x "$TMP"
mv "$TMP" "$DEST/port-pool"
echo "Installed port-pool to $DEST/port-pool" >&2

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/port-pool"
CONFIG_FILE="$CONFIG_DIR/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  mkdir -p "$CONFIG_DIR"
  cat > "$CONFIG_FILE" <<'EOF'
{
  "schemaVersion": 1,
  "portRangeStart": 3000,
  "portRangeEnd": 9999,
  "excludedPorts": [
    3000, 3001, 3306,
    4000, 4200,
    5000, 5173, 5432, 5500,
    6379,
    8000, 8080, 8081, 8443, 8888,
    9000, 9090, 9200
  ]
}
EOF
  echo "Created starter config at $CONFIG_FILE" >&2
else
  echo "Config already exists at $CONFIG_FILE (left untouched)" >&2
fi

case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "Note: $DEST is not in \$PATH. Add it to your shell profile to use port-pool." >&2 ;;
esac
