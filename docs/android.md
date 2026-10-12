# Hippocampe on an Android phone

The Android application puts things into the inbox from the phone: from any application's share
menu (a link, a text, a file, several images at once) or from the application itself (a note, a
link, a photo from the camera, a file), even offline. Agents then turn each item into entries; the
**Sent** tab shows what each became. It needs Android 8 or later. There is no Play Store version.

## Install it

- **A release**: each release of Hippocampe carries `hippocampe-android-<version>.apk` and its
  `.sha256`, once the owner has set the signing key (see `apps/android/AGENTS.md`). A newer APK
  installs over the older one.
- **A build of a pull request or a branch**: the `verify` job of CI uploads the debug APK as the
  artifact `hippocampe-android-debug` (Actions, the run, Artifacts; it is a zip holding
  `app-debug.apk`). Or build it: `bun run build` in `apps/android`, with an Android SDK.

On the phone, open the APK (from a download, or `adb install app-debug.apk` from a computer with
the phone in USB debugging) and allow the installation from that source when Android asks. A debug
build and a release build are signed with different keys: uninstall one before installing the
other.

## Pair it with a server

1. Make the server reachable from the phone. It speaks plain HTTP and, by default, listens on
   `127.0.0.1` only. Reach it through an encrypted path, as for any client:
   - with **Tailscale** on both machines, `tailscale serve --bg 3000` on the server's machine gives
     `https://<machine>.<tailnet>.ts.net`, in TLS, with nothing else to change (use the port of your
     installation: 7468 for `hippo service install`);
   - or set `HIPPOCAMPE_HOST` to the server machine's address on a private network (with Docker,
     `HIPPOCAMPE_BIND`), and use `http://<that address>:3000`;
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

- **Share**: in any application, Share, then Hippocampe inbox. The sheet shows what is shared and
  the instance, takes an optional note (why it is kept, for the agent), and sends; the phone goes
  back to that application at once, with a short confirmation.
- **Add**: a note or a link (a text that is only a link is sent as a link), photos from the camera
  and files, with an optional note.
- **Sent**: what was sent from this phone, newest first: waiting on the phone (it may be
  cancelled), in the inbox, processed (with the titles of the entries it gave), dismissed (with the
  reason), or refused by the server (with its sentence; it is not tried again).

Nothing is lost offline: each item is kept on the phone first (a shared file is copied at once) and
sent when the network is there, again later while the server cannot be reached or fails, across a
restart of the phone. Each carries an identifier, so a retry after a lost answer adds nothing twice.
Items are sent with the origin `android`, so `GET /api/inbox?origin=android` and the agents see
where they came from.
