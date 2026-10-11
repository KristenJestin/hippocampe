#!/bin/sh
# Proves the packed tarballs before anything is published: installs both into a scratch npm
# prefix and a scratch HOME, checks that `hippo --version` prints the version, that `hippo service
# install` writes one unit and no PostgreSQL, then starts the installed `hippo serve` on a scratch
# PGlite folder, with no PostgreSQL server anywhere and no `DATABASE_URL`, checks that /health
# answers with that version, and that a command reaches the database through it. Any failure stops
# with its reason.
#
#   scripts/prove-package.sh <version> <folder of the tarballs>
set -eu
version=$1
packed=$(cd "$2" && pwd)
scratch=$(mktemp -d)
server_pid=""
cleanup() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  rm -rf "$scratch"
}
trap cleanup EXIT

npm install --global --prefix "$scratch/prefix" \
  "$packed/netsirk-hippocampe-linux-x64-$version.tgz" "$packed/netsirk-hippocampe-$version.tgz" >/dev/null
hippo="$scratch/prefix/bin/hippo"
said=$(HOME="$scratch/home" "$hippo" --version)
if [ "$said" != "hippo v$version" ]; then
  echo "hippo --version says \"$said\", not \"hippo v$version\"." >&2
  exit 1
fi

# `hippo service install` as the owner meets it, with a `systemctl` that refuses everything: it
# stops right after the unit is written, so nothing of the machine is touched and nothing is
# started. Run from the scratch folder, away from the packages of the repository.
mkdir "$scratch/stub"
printf '#!/bin/sh\necho "refused by the proof" >&2\nexit 1\n' >"$scratch/stub/systemctl"
chmod +x "$scratch/stub/systemctl"
installed=$(cd "$scratch" && env -u DATABASE_URL HOME="$scratch/home" \
  XDG_CONFIG_HOME="$scratch/home/.config" XDG_DATA_HOME="$scratch/home/.local/share" \
  PATH="$scratch/stub:$PATH" "$hippo" service install 2>&1) || true
case "$installed" in
  "systemctl --user daemon-reload failed: refused by the proof") ;;
  *)
    echo "hippo service install did not reach systemd: $installed" >&2
    exit 1
    ;;
esac
units=$(ls "$scratch/home/.config/systemd/user")
if [ "$units" != "hippocampe.service" ]; then
  echo "hippo service install wrote the units \"$units\", not hippocampe.service alone." >&2
  exit 1
fi
if ls "$scratch/home/.local/share/hippocampe" | grep -q postgres; then
  echo "hippo service install left PostgreSQL in the data folder." >&2
  exit 1
fi

port=$((40000 + $$ % 10000))
environment() {
  env -u DATABASE_URL HOME="$scratch/home" HIPPOCAMPE_INSTANCE=local PORT="$port" \
    HIPPOCAMPE_DATABASE_DIR="$scratch/pglite" \
    BETTER_AUTH_SECRET="proof-of-the-package-0123456789abcdef0123" MEDIA_DIR="$scratch/media" \
    "$@"
}
(cd "$scratch" && environment "$hippo" serve) >"$scratch/server.log" 2>&1 &
server_pid=$!

tries=0
until health=$(curl -sf "http://127.0.0.1:$port/health"); do
  tries=$((tries + 1))
  if [ "$tries" -gt 120 ]; then
    echo "hippo serve did not answer /health:" >&2
    cat "$scratch/server.log" >&2
    exit 1
  fi
  sleep 0.5
done
case "$health" in
  *"\"version\":\"$version\""*) ;;
  *)
    echo "/health answers $health, not the version $version." >&2
    exit 1
    ;;
esac
if ! created=$(cd "$scratch" && environment "$hippo" key:create --name proof --rights read \
  --owner owner@example.org 2>&1); then
  echo "hippo key:create did not reach the database through the server: $created" >&2
  exit 1
fi
echo "Proved: hippo v$version installs as one unit, and serves /health as $version on PGlite."
