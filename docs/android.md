# Hippocampe on an Android phone

The Android application puts things into the inbox from the phone: from any application's share
menu (a link, a text, a file, several images at once) or from the application itself (a note, a
link, a photo from the camera, a file), even offline. Agents then turn each item into entries; the
**Sent** tab shows what each became. It also reads Hippocampe: **Home**, **Search**, **Browse** and the
page of an entry, with the key it already holds (the right `read`), and it can warn before a date is
due. It needs Android 8 or later. There is no Play Store version.

## Which APK is which

| | Release | Beta | Debug |
|---|---|---|---|
| Application id | `fr.kristenjestin.hippocampe` | `fr.kristenjestin.hippocampe.beta` | `fr.kristenjestin.hippocampe.debug` |
| Name, launcher | Hippocampe | Hippocampe Beta, another background colour | Hippocampe Debug |
| For | the real instance (production) | the development instance | trying a pull request |
| Where | the release, `hippocampe-android-<version>.apk` | the pre-release `android-beta`, `hippocampe-android-beta.apk`, replaced at each push to `dev` | the artifact `hippocampe-android-debug` of a CI run |
| Signed with | the release key | the same release key | the debug key of the machine that built it |
| Plain HTTP | refused: the server is reached over HTTPS | allowed | allowed |

The release, the beta and the debug build are three applications: they are installed side by side,
each with its own settings and its own queue, and one never replaces another.

## Install it

- **A release**: each release of Hippocampe carries `hippocampe-android-<version>.apk` and its
  `.sha256`, once the owner has set the signing key (see `apps/android/AGENTS.md`). A newer APK
  installs over the older one.
- **The beta**: the [pre-release `android-beta`](https://github.com/KristenJestin/hippocampe/releases/tag/android-beta)
  holds `hippocampe-android-beta.apk` and its `.sha256`, built from the last push to `dev` (its
  version says from which release, which run and which commit: `0.9.0-beta.57+3f2a1bc`). Its version
  code is the number of the run, so each beta installs over the one before it, with the same key.
  Until the signing secrets are set, nothing is published.
- **A build of a pull request or a branch**: the `verify` job of CI uploads the debug APK as the
  artifact `hippocampe-android-debug` (Actions, the run, Artifacts; it is a zip holding
  `app-debug.apk`). Or build it: `bun run build` in `apps/android`, with an Android SDK.

On the phone, open the APK (from a download, or `adb install app-debug.apk` from a computer with
the phone in USB debugging) and allow the installation from that source when Android asks. A debug
build is signed with the debug key of the machine that built it (each CI run makes its own), and a
release or a beta with the release key: when Android refuses an APK over the installed one for its
signature, uninstall first, which forgets the settings and what waits on the phone.

## Pair it with a server

1. Make the server reachable from the phone. It speaks plain HTTP and, by default, listens on
   `127.0.0.1` only. Reach it through an encrypted path, as for any client. The release only talks
   to an `https://` address; the beta and the debug build also accept `http://`, for a server on a
   private network during development:
   - with **Tailscale** on both machines, `tailscale serve --bg 3000` on the server's machine gives
     `https://<machine>.<tailnet>.ts.net`, in TLS, with nothing else to change (use the port of your
     installation: 7468 for `hippo service install`);
   - or set `HIPPOCAMPE_HOST` to the server machine's address on a private network (with Docker,
     `HIPPOCAMPE_BIND`), and use `http://<that address>:3000` (the beta and the debug build only);
   - or a reverse proxy that terminates TLS in front of it.
2. Create a key for the phone, with the rights `read` and `write`, on the server's machine:

   ```
   hippo key:create --name phone --rights read,write
   ```

   (`bun run hippo key:create …` from `apps/server` in development; `docker compose exec hippocampe
   bun src/cli.ts key:create … --owner <email>` with Docker.) It prints the key once.
3. Open the application. On its first start it asks for the server's address (such as
   `https://hippocampe.example.ts.net` or `http://192.168.1.20:3000`) and the key, then **Check and
   save**. It asks the server which instance it is (`/api/about`) and whether the key may add to the
   inbox, without adding anything; when something is wrong, it says what in one sentence
   (unreachable, a refused key, a missing right).
4. Once saved, the instance and its label (`Production`, `Development`, `Local`) stay at the top of
   every screen and of the share sheet: check it before sending. The key is kept encrypted on the
   phone and never shown again; the settings (the gear) take a new address or a new key, and keep
   the saved key when its field is left empty.

`hippo key:list` shows the phone's key among the others; `hippo key:revoke --name phone` cuts it off
(the application then says the server refused it).

## Using it

- **Home** (where the application opens): from `GET /api/briefing`, the deadlines **overdue**, the
  **heads-ups** (the dates inside their notice period, such as a contract's notice or a birthday)
  and what is due **this week**, each opening its entry, and how many items **wait in the inbox**,
  which opens **Sent**; then the first few entries **changed recently**, each with when and by which
  key. Pull down to refresh. When the server cannot be reached, Home shows the last briefing it read,
  *Last read* on that day and at that hour, with the sentence that says why: it never shows an old
  briefing as if it were current. Reading Home warns no one.
- **Warnings before a due date**: in the settings (the gear), *Warn me before a due date*, off until
  the owner turns it on. On, the phone asks the server once a day, when it is online, for the
  briefing, and gives one notification, in a channel of its own (*Due dates*), for each heads-up it
  has not warned of yet: the entry's title and what is due when (`End: in 39 days (20 November
  2026)`). An occurrence warns once, not each day (the briefing names each by the entry, the field
  and the date, so a date that comes back next year warns again). The notification opens the entry;
  back goes to Home. On Android 13 and later, Android asks the permission to notify when the switch
  is turned on, not at the first start; refused, the switch stays off and says so. No server pushes
  anything: the phone asks, and a server that cannot be reached is asked again later.
- **Search**: the server's own search, as you type, with a chip per type to narrow it. Each result
  shows its title, its type, where it is (its path) and its excerpt, the words found marked.
- **Browse**: the tree from the top-level entries down, as the desktop viewer's sidebar: the arrow
  opens what is filed under an entry, its title opens the entry.
- **An entry** (from a search, the tree, a link, a reference or **Sent**): where it sits (each step
  opens), its type and tags, its fields (an `entry` field opens the entry it names; a sensitive value
  the key may not read is said to be *hidden*), its body in Markdown, what it contains, what it is
  dated by, its links both ways with their note and dates, its images (an image of the body or of the
  media is fetched with the key and shown; any other file is fetched and opened by an application of
  the phone) and, on demand, its history. **What is only supposed** (a value, the summary, the body or
  a link written `inferred`, or `ambiguous` when sources disagree) carries a *Supposed* or *Sources
  disagree* mark, apart from what is known. An entry or a search that fails says why in one sentence,
  with *Try again*.
- **Share**: in any application, Share, then Hippocampe inbox. The sheet shows what is shared and
  the instance, takes an optional note (why it is kept, for the agent), and sends; the phone goes
  back to that application at once, with a short confirmation.
- **Add**: a note or a link (a text that is only a link is sent as a link), photos from the camera
  and files, with an optional note.
- **Sent**: what was sent from this phone, newest first: waiting on the phone (it may be
  cancelled), waiting for the settings (with the server's sentence), in the inbox, processed (with
  the entries it gave, each of which opens), dismissed (with the reason), or refused by the server (with
  its sentence; it is not tried again).

Nothing is lost offline: each item is kept on the phone first (a shared file is copied at once) and
sent when the network is there, again later while the server cannot be reached or fails, across a
restart of the phone. Each carries an identifier, so a retry after a lost answer adds nothing twice.
A key the server does not accept (unknown, revoked, or without the right `write`: a 401 or a 403)
is a problem of the settings, not of the item: the item stays on the phone with its file, **Sent**
shows it as waiting for the settings with the server's sentence, and it is sent once the settings
are saved with a key that works. Any other refusal (a content the server cannot take) is final.
Items are sent with the origin `android`, so `GET /api/inbox?origin=android` and the agents see
where they came from.
