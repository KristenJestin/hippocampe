# The logo of Hippocampe

The horn: two strokes with round caps, a green spiral and a light tail. The SVGs of this folder are
the one source of the drawing; every other file is generated from them with `bun run brand` (at the
root), and committed. To change the logo, edit the SVGs and run it again: a test fails when what is
committed is not what the command writes. The colours and the transforms are the maintainer's, never
redrawn by a tool.

| Source | For |
| --- | --- |
| `horn.svg` | the mark alone, for a dark background (the default) |
| `horn-on-light.svg` | the mark alone, for a light background |
| `icon.svg` | the icon: the mark on a dark rounded square; applications, the server's MCP icon |
| `icon-full.svg` | the full icon, a green square with dark strokes: tells a second build apart (the Android beta) |
| `favicon.svg` | the favicon, drawn for 16 to 64 pixels |
| `android-foreground.svg` | the foreground of the Android adaptive icon, inside its 66 dp safe zone |
| `social-preview.svg` | the social preview of the repository |

## What is generated

- `png/`: the icon at 128, 256, 512 and 1024 pixels (`icon-*.png`), `apple-touch-icon.png`, the
  full icon at 512, the favicon at 16 and 32, and `social-preview.png`.
- `favicon.ico`: the favicon at 16, 32 and 48 pixels.
- Copies where each application reads its own: see the sections of the applications in
  [`AGENTS.md`](../../AGENTS.md).

The PNGs are rendered by `rsvg-convert` (librsvg); without it, `bun run brand` leaves them as
committed and generates the rest. The text of the social preview is drawn with the fonts of the
desktop viewer (Peace Sans and Open Sauce Sans, `apps/desktop/assets/fonts`), found through a
fontconfig made for the run: no font of the machine is used.

`png/social-preview.png` is the social preview of the repository: it is uploaded by hand in the
repository's settings on GitHub (Settings, General, Social preview), as GitHub offers no other way.
