#!/usr/bin/env bash
# demo.sh is the old name of xray.sh. It is kept so existing links and articles keep working.
echo "demo.sh is now xray.sh - running ./xray.sh" >&2
exec "$(dirname "$0")/xray.sh" "$@"
