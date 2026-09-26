#!/usr/bin/env bash
# One-time toolchain setup for the Aegis demo operator on Ubuntu 24.04 (WSL2 or a VPS).
# Run as your normal user: `bash ops/wsl-setup.sh`. Only the apt/Docker part asks for sudo.
set -euo pipefail

GO_VERSION=1.24.7
TINYGO_VERSION=0.39.0
NODE_MAJOR=22

echo "==> System packages + Docker Engine (sudo)"
sudo apt-get update
sudo apt-get install -y build-essential curl git ca-certificates jq docker.io docker-compose-v2
sudo usermod -aG docker "$USER"

mkdir -p "$HOME/.local/opt" "$HOME/.local/bin"

echo "==> Go ${GO_VERSION} (user-local)"
if ! "$HOME/.local/opt/go/bin/go" version 2>/dev/null | grep -q "go${GO_VERSION}"; then
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -xz -C "$HOME/.local/opt"
fi

echo "==> TinyGo ${TINYGO_VERSION} (user-local)"
if [ ! -x "$HOME/.local/opt/tinygo/bin/tinygo" ]; then
  curl -fsSL "https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo${TINYGO_VERSION}.linux-amd64.tar.gz" \
    | tar -xz -C "$HOME/.local/opt"
fi

echo "==> Node ${NODE_MAJOR} via nvm"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_MAJOR"

echo "==> Foundry"
[ -x "$HOME/.foundry/bin/forge" ] || curl -fsSL https://foundry.paradigm.xyz | bash
"$HOME/.foundry/bin/foundryup"

PROFILE_LINE='export PATH="$HOME/.local/opt/go/bin:$HOME/.local/opt/tinygo/bin:$HOME/go/bin:$HOME/.foundry/bin:$PATH"'
grep -qxF "$PROFILE_LINE" "$HOME/.bashrc" || echo "$PROFILE_LINE" >> "$HOME/.bashrc"

echo
echo "Done. Open a NEW shell (Docker group + PATH), then check:"
echo "  go version && tinygo version && node -v && forge --version && docker run --rm hello-world"
