#!/bin/sh
# Proves the packed tarballs before anything is published: installs both into a scratch npm
# prefix and a scratch HOME, checks that `hippo --version` prints the version and that `hippo
# service install` writes one unit, then starts the installed `hippo serve` in local mode on a
# scratch database, which it runs with the PostgreSQL the package carries, and checks that /health
# answers with that version, that the database has no TCP port, and that a command reaches it.
# Any failure stops with its reason.
#
#   scripts/prove-package.sh <version> <folder of the tarballs>
set -eu
version=$1
packed=$(cd "$2" && pwd)
scratch=$(mktemp -d)
server_pid=""
cleanup() {
  # The launcher waits for the executable, which stops its PostgreSQL before it exits: the
  # executable is stopped, and both are waited for before their folder is removed.
  if [ -n "$server_pid" ]; then
    kill $(pgrep -P "$server_pid") 2>/dev/null || kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
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

# The unit `hippo service install` writes, as the owner meets it: one, `hippocampe.service`, whose
# environment names the PostgreSQL the installed launcher found. A `systemctl` that refuses
# everything stops the install at its first call to systemd, right after the unit is written, so
# nothing of the machine is touched and nothing is started; `HIPPOCAMPE_POSTGRES_BINARIES` is not
# set here. Run from the scratch folder: from the repository, the executable would find the
# PostgreSQL package of the workspace by itself, and the proof would not see the launcher fail.
mkdir "$scratch/stub"
printf '#!/bin/sh\necho "refused by the proof" >&2\nexit 1\n' >"$scratch/stub/systemctl"
chmod +x "$scratch/stub/systemctl"
installed=$(cd "$scratch" && env -u HIPPOCAMPE_POSTGRES_BINARIES HOME="$scratch/home" \
  XDG_CONFIG_HOME="$scratch/home/.config" XDG_DATA_HOME="$scratch/home/.local/share" \
  PATH="$scratch/stub:$PATH" "$hippo" service install 2>&1) || true
case "$installed" in
  "systemctl --user daemon-reload failed: refused by the proof") ;;
  *)
    echo "hippo service install did not reach systemd: $installed" >&2
    exit 1
    ;;
esac
units="$scratch/home/.config/systemd/user"
if [ "$(ls "$units")" != "hippocampe.service" ]; then
  echo "hippo service install wrote other units than hippocampe.service: $(ls "$units")" >&2
  exit 1
fi
binaries=$(sed -n 's/^Environment="HIPPOCAMPE_POSTGRES_BINARIES=\(.*\)"$/\1/p' "$units/hippocampe.service")
if [ ! -x "$binaries/bin/postgres" ]; then
  echo "The unit names no PostgreSQL of the package: \"$binaries\"." >&2
  exit 1
fi

# The local mode, as that unit runs it: `hippo serve` on a scratch database folder, no
# DATABASE_URL, runs its PostgreSQL as a child, on a socket in that folder and on no TCP port.
database="$scratch/database"
server_port=$((40000 + $$ % 10000))
(cd "$scratch" && exec env -u HIPPOCAMPE_POSTGRES_BINARIES -u DATABASE_URL HOME="$scratch/home" \
  HIPPOCAMPE_INSTANCE=local PORT="$server_port" HIPPOCAMPE_DATABASE_DIR="$database" \
  BETTER_AUTH_SECRET="proof-of-the-package-0123456789abcdef0123" MEDIA_DIR="$scratch/media" \
  "$hippo" serve >"$scratch/server.log" 2>&1) &
server_pid=$!

tries=0
until health=$(curl -sf "http://127.0.0.1:$server_port/health"); do
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
# postmaster.pid: line 5 is the folder of the socket, line 6 the TCP addresses it listens on.
if [ "$(sed -n 5p "$database/postmaster.pid")" != "$database" ] ||
  [ -n "$(sed -n 6p "$database/postmaster.pid")" ]; then
  echo "The database does not listen on its socket alone:" >&2
  cat "$database/postmaster.pid" >&2
  exit 1
fi

# A command reaches the database while the server runs, through the socket of its PostgreSQL.
if ! (cd "$scratch" && env -u HIPPOCAMPE_POSTGRES_BINARIES -u DATABASE_URL HOME="$scratch/home" \
  HIPPOCAMPE_INSTANCE=local HIPPOCAMPE_DATABASE_DIR="$database" \
  BETTER_AUTH_SECRET="proof-of-the-package-0123456789abcdef0123" MEDIA_DIR="$scratch/media" \
  "$hippo" key:create --name proof --rights read --owner owner@example.org >"$scratch/key.log" 2>&1); then
  echo "hippo key:create did not reach the database of the running server:" >&2
  cat "$scratch/key.log" >&2
  exit 1
fi
echo "Proved: hippo v$version installs one unit, serves /health as $version with its PostgreSQL on a socket alone, and a command reaches it."
