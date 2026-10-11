# Hippocampe on one machine

This page is for the npm package, installed with `hippo service install` as a systemd user service
on one Linux machine, for one user. It is not the page of Hippocampe run with Docker, nor of a
server behind a reverse proxy: those are in [`docs/docker.md`](docker.md), and none of the commands
below (`hippo service`, `hippo backup`, `hippo restore`) applies to them.

Hippocampe installs for one user of a Linux machine, without Docker or a server to run, from npm:

```
npm i -g @netsirk/hippocampe
hippo service install [--email <owner>] [--port 7468]
```

Hippocampe runs as **one process**, `hippo serve`, with its database inside it: PGlite, PostgreSQL 18
compiled to WebAssembly, in a folder of the data. No PostgreSQL server runs beside it and nothing
else is started. `service install` creates the folders, writes one systemd user unit,
`hippocampe.service`, enables and starts it (it starts with the session and restarts on failure;
the server makes its database at its first start), then creates the owner and a first key. It
prints where the key file is and the address of MCP, with the command that declares it in Claude
Code. Hippocampe listens on `127.0.0.1` only. The instance is `production` (real data) unless
`--instance` says otherwise.

## Where things are

| What | Where |
|---|---|
| The database, the media | `~/.local/share/hippocampe/` (`pglite/`, `media/`) |
| The backups and the nightly Markdown export, kept whatever happens to the installation | `~/Hippocampe/backups/`, `~/Hippocampe/export/` |
| The environment of the service (its secret, the folder of its database), the first key | `~/.config/hippocampe/hippocampe.env`, `~/.config/hippocampe/key` (both readable by the user only) |
| The unit | `~/.config/systemd/user/hippocampe.service` |

The folder of the database is named by `HIPPOCAMPE_DATABASE_DIR` in `hippocampe.env`. One process
at a time opens it, and writes its id in `pglite/hippocampe.pid`; that process serves the database
on a Unix socket in the folder, `pglite/.s.PGSQL.5432`, which only you can reach (the folder is
yours alone). A command run on this machine (`hippo key:create`, `hippo supposed`, `hippo inbox:add`…)
reaches this Hippocampe: it reads `hippocampe.env` when the environment does not say otherwise.
While the service runs, the command goes through that socket, to the database the server holds;
when the service is stopped, the command opens the folder itself, and leaves it when it ends. The
database has one session: a transaction runs alone, and another one, of the server or of a
command, waits for it to end. Never two processes write the folder.

## Day to day

```
hippo service status      # what systemd says
hippo service logs        # the last lines the server wrote
hippo service stop
hippo service start
hippo backup [--to <file>]
hippo restore <file>
```

`backup` stops the service for the few seconds of the copy, writes the database's folder and the
media into a `.tar.gz` (in `~/Hippocampe/backups/` by default, readable by you only), with a small
manifest (the version of Hippocampe, its engine, `pglite`, the major version of PostgreSQL, the
date), and starts it again. `restore` puts such a file back: it checks the archive first, and
refuses, before touching anything, a file that is not a backup, a backup written by a newer
Hippocampe (update first), by another major version of PostgreSQL (a database folder does not move
across them), or by Hippocampe 0.12 or earlier, whose database its own PostgreSQL ran (restore
that one with Hippocampe 0.12). It then stops
the service, saves what is there as `~/Hippocampe/backups/hippocampe-before-restore-<date>.tar.gz`,
unpacks the backup, and starts the service, which migrates the database as it starts; if anything
fails on the way, what was there is put back. To undo a restore, restore the `before-restore` file.
The nightly Markdown
export goes to `~/Hippocampe/export/`. Both live in `~/Hippocampe`,
in sight and apart from the installation: `service uninstall --purge` never deletes them, and says
what it deletes and what it keeps before it does.

## Update

```
npm i -g @netsirk/hippocampe
hippo service install
```

Installed again, it keeps the data, the secret, the key and the values of `hippocampe.env` (ports,
instance: it says so when the flags ask for others; change them in that file), takes the new executable and unit, and
restarts the service, which migrates its database as it starts. (npm no longer runs the scripts of
a global install by default, so the restart is not automatic after `npm i -g`.)

What an update may and may not change is in [`docs/versions.md`](versions.md).

### From 0.12 or earlier: the embedded PostgreSQL

Hippocampe 0.6.0 to 0.12.x ran a PostgreSQL server of its own beside the server, with two units,
and kept its database in `~/.local/share/hippocampe/postgres/` (Grenier, before them, in
`~/.local/share/grenier/postgres/`). This version keeps its data in PGlite instead, and converts
nothing: `service install` finds that folder and refuses, before it changes anything, saying how
to keep the data. To keep it, run Hippocampe 0.12 on it once more (`npm i -g
@netsirk/hippocampe@0.12`), save what you need (`hippo export:markdown <folder>` writes everything
as Markdown, `hippo backup` a copy that only 0.12 restores), run `hippo service uninstall` with it,
move the data folder aside, then install this version again; `hippo inbox:add <the export folder>`
then hands the export to your agents, who write it again, one item per file.

## Uninstall

```
hippo service uninstall           # the data and the configuration stay
hippo service uninstall --purge   # the data and the configuration go; ~/Hippocampe stays
npm rm -g @netsirk/hippocampe
```

## Moving an installation made under the name Grenier

Hippocampe was named Grenier until 1.0.

### The service of a machine

An installation made under the old name ran the embedded PostgreSQL: `service install` refuses it
as it refuses one of 0.12 (see [above](#from-012-or-earlier-the-embedded-postgresql)), and Hippocampe
0.12, whose `service install` moves it to the new names, is the version that keeps its data.

### Docker

An installation run with Docker moves by the steps of [`docs/docker.md`](docker.md#moving-an-installation-made-under-the-name-grenier).

### The clients

- **MCP.** The server is announced as `hippocampe-local`, `hippocampe-dev` or `hippocampe`. Declare
  it again under the new name, with the same address and the same key:

  ```
  claude mcp remove grenier
  claude mcp add --transport http hippocampe http://localhost:3000/mcp \
    --header "Authorization: Bearer <the same key>"
  ```

  The tools of diagnostics are `report` and `reports` (they were `grenier_report` and
  `grenier_reports`), and the tools of this server are named `mcp__hippocampe__…` in the
  permissions of Claude Code (they were `mcp__grenier__…`). A stdio server takes `HIPPOCAMPE_ACTOR`,
  `HIPPOCAMPE_RIGHTS` and `HIPPOCAMPE_INSTANCE` instead of the `GRENIER_*` ones.
- **The desktop viewer.** `hippocampe-desktop` replaces `grenier-desktop`: run the update script
  again (`curl -fsSL https://raw.githubusercontent.com/KristenJestin/hippocampe/main/apps/desktop/scripts/update.sh | sh`),
  which installs the new viewer and removes the old binary, launcher and icon. The first start moves
  `~/.config/grenier/` to `~/.config/hippocampe/` (on Windows, `%APPDATA%\grenier` to
  `%APPDATA%\hippocampe`), key included, when the service has not moved it already.

## Publishing on npm (the owner, once)

Each release from `main` publishes both packages from the `npm` job of
`.github/workflows/release.yml`, after `scripts/prove-package.sh` has installed them and seen
`/health` answer with the release's version, on PGlite, with no PostgreSQL server. The job publishes through npm's **trusted
publishing**: GitHub Actions proves who it is (OIDC), npm checks it against the publisher set on
each package, and the packages carry provenance. No token is stored. On npmjs.com, once:

1. **The scope.** Sign in as the account that owns `@netsirk` (or create the organisation
   `netsirk`); turn on two-factor authentication.
2. **The first publication, by hand.** A trusted publisher is set on a package that exists, so
   the very first version of each is published from your machine: build the tarballs from the
   release tag (`git checkout v<version>`, then `bun scripts/pack.ts <version> /tmp/npm` in
   `apps/server`), prove them (`scripts/prove-package.sh <version> /tmp/npm`), then
   `npm login` and `npm publish /tmp/npm/netsirk-hippocampe-linux-x64-<version>.tgz --access public`
   followed by `npm publish /tmp/npm/netsirk-hippocampe-<version>.tgz --access public`, in that
   order. A re-run of the release job then skips these versions.
3. **The trusted publisher, on each package** (`@netsirk/hippocampe-linux-x64`, then
   `@netsirk/hippocampe`): *Settings → Trusted publishing → GitHub Actions*, with the owner
   `KristenJestin`, the repository `hippocampe`, the workflow `release.yml`, and no environment.
4. **No token afterwards.** In *Settings → Publishing access*, choose "Require two-factor
   authentication and disallow tokens": only the trusted publisher publishes from then on.

A failed `npm` job says so in the run of the release. It never leaves the launcher without its
executable: the executable is published first, and the launcher only once npm shows it. Run it
again from the run's page: what is on npm already is skipped.

## For a developer

`bun scripts/pack.ts <version> <folder>`, in `apps/server`, compiles the executable
(`bun build --compile`, PGlite compiled in), lays it beside its migrations and the files PGlite reads
(`bin/pglite/`: its WebAssembly, its file system, the extensions `unaccent` and `pg_trgm`) in
`@netsirk/hippocampe-linux-x64`, and packs
that package and the launcher `@netsirk/hippocampe` into `folder`; `npm i -g <both tarballs>` installs
them as the registry would; `scripts/prove-package.sh <version> <folder>` checks that they install
as one unit and serve, and that a command reaches the database through the server. The release workflow publishes both with each version.
