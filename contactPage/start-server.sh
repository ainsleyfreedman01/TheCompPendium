#!/bin/bash
set -euo pipefail

# Safely decrypt and run the server once. The decrypted file is removed when the
# process exits. This avoids starting multiple server instances or removing the
# file while the server is still running.

if [ ! -f server.js.gpg ]; then
	echo "Encrypted server.js.gpg not found in $(pwd)" >&2
	exit 1
fi

TMP_JS="server.js.$$"
gpg --decrypt --output "$TMP_JS" server.js.gpg

cleanup() {
	rm -f "$TMP_JS"
}
trap cleanup EXIT

echo "Starting server from decrypted temp file $TMP_JS"
node "$TMP_JS"
