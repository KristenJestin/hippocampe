#!/bin/sh
# Proves the packed tarballs before anything is published: installs both into a scratch npm
# prefix and a scratch HOME, checks that `hippo --version` prints the version, then starts the
# installed `hippo serve` on a scratch database run by the PostgreSQL the package carries, and
# checks that /health answers with that version. Any failure stops with its reason.
#
#   scripts/prove-package.sh <version> <folder of the tarballs>
set -eu
version=$1
packed=$(cd "$2" && pwd)
scratch=$(mktemp -d)
database_pid=""
server_pid=""
cleanup() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  [ -n "$database_pid" ] && kill "$database_pid" 2>/dev/null || true
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

# The PostgreSQL the installed launcher hands the executable, as the owner meets it: `hippo
# service install` copies the binaries into the data folder before it asks systemd for anything.
# A `systemctl` that refuses everything stops it right after the copy and the initdb, so nothing
# of the machine is touched and nothing is started; `HIPPOCAMPE_POSTGRES_BINARIES` is not set here.
# Run from the scratch folder: from the repository, the executable would find the PostgreSQL
# package of the workspace by itself, and the proof would not see the launcher fail.
mkdir "$scratch/stub"
printf '#!/bin/sh\necho "refused by the proof" >&2\nexit 1\n' >"$scratch/stub/systemctl"
chmod +x "$scratch/stub/systemctl"
installed=$(cd "$scratch" && env -u HIPPOCAMPE_POSTGRES_BINARIES HOME="$scratch/home" \
  XDG_CONFIG_HOME="$scratch/home/.config" XDG_DATA_HOME="$scratch/home/.local/share" \
  PATH="$scratch/stub:$PATH" "$hippo" service install 2>&1) || true
postgresql="$scratch/home/.local/share/hippocampe/postgresql"
case "$installed" in
  "systemctl --user daemon-reload failed: refused by the proof") ;;
  *)
    echo "hippo service install did not reach systemd: $installed" >&2
    exit 1
    ;;
esac
cp -r "$postgresql" "$scratch/postgresql"
printf 'proof\n' >"$scratch/password"
"$scratch/postgresql/bin/initdb" -D "$scratch/database" -U hippocampe --pwfile="$scratch/password" \
  -A scram-sha-256 -E UTF8 --locale=C >/dev/null
port=$((40000 + $$ % 10000))
"$scratch/postgresql/bin/postgres" -D "$scratch/database" -p "$port" -k "$scratch" \
  -c listen_addresses=127.0.0.1 >"$scratch/postgres.log" 2>&1 &
database_pid=$!

server_port=$((port + 1))
HOME="$scratch/home" HIPPOCAMPE_INSTANCE=local PORT="$server_port" \
  DATABASE_URL="postgres://hippocampe:proof@127.0.0.1:$port/postgres" \
  BETTER_AUTH_SECRET="proof-of-the-package-0123456789abcdef0123" MEDIA_DIR="$scratch/media" \
  "$hippo" serve >"$scratch/server.log" 2>&1 &
server_pid=$!

tries=0
until health=$(curl -sf "http://127.0.0.1:$server_port/health"); do
  tries=$((tries + 1))
  if [ "$tries" -gt 120 ]; then
    echo "hippo serve did not answer /health:" >&2
    cat "$scratch/server.log" "$scratch/postgres.log" >&2
    exit 1
  fi
  sleep 0.5
done
case "$health" in
  *"\"version\":\"$version\""*) echo "Proved: hippo v$version installs, and serves /health as $version." ;;
  *)
    echo "/health answers $health, not the version $version." >&2
    exit 1
    ;;
esac
