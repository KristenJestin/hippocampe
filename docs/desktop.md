# The desktop viewer

The viewer reads Hippocampe on a computer: search, the tree of entries, an entry with its links and
media. It never writes. Its code and its rules are in [`apps/desktop`](../apps/desktop/AGENTS.md).

## Install and update

Each release carries the viewer, built for Linux (`hippocampe-desktop-<version>-linux-x86_64.tar.gz`)
and Windows (`hippocampe-desktop-<version>-windows-x86_64.zip`), each with its `.sha256`.

On Linux, one script installs it and updates it from the latest release (it needs `curl`, `tar` and
`sha256sum`, and no GitHub account):

```
curl -fsSL https://raw.githubusercontent.com/KristenJestin/hippocampe/main/apps/desktop/scripts/update.sh | sh
```

It puts `hippocampe-desktop` in `~/.local/bin`, its launcher in `~/.local/share/applications` and its
icon beside it; `sh update.sh --check` only says whether a newer viewer exists. It never touches
`~/.config/hippocampe/`, where the viewer reads its server and its key (see
[Pointing the viewer at a server](../apps/desktop/AGENTS.md#pointing-the-viewer-at-a-server)).
`hippocampe-desktop --version` prints the version; `hippocampe-desktop --open <slug>` opens an entry at
start, and `--search <words>` a search.

Between a release and the end of its builds, or when a build failed, the latest release has no
archive yet: the script says so and changes nothing; run it again later. A viewer that says a
version newer than the latest release, such as a local build (`9.9.9-local`), is never replaced.

On Windows, unpack the archive anywhere and run `hippocampe-desktop.exe`.
