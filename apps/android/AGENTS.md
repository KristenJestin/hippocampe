# AGENTS.md — the Android application

Read the root `AGENTS.md` first; this file adds the rules of `apps/android`, a Gradle project in
Kotlin (Kotlin DSL), with Jetpack Compose and Material 3. Every version is pinned exactly in
`gradle/libs.versions.toml`, Gradle itself in `gradle/wrapper/gradle-wrapper.properties` (with its
checksum).

## What it is

The application puts things into the inbox from the phone and shows what each became; and it reads:
home (what is due and what waits), search, an entry, browsing the tree, and a notification before a
due date. It never writes an entry and knows nothing of bookmarks or X: a
shared link is a link, the server and its agents do the rest. Of types it knows only what the read API
says (`/api/types`: a label, the kind of each field), never a type by name.

```
app/src/main/kotlin/fr/kristenjestin/hippocampe/
  api/Types.kt     the types of the API, generated (never edited by hand)
  api/Api.kt       the read API and the inbox, Ktor on OkHttp; refusals keep the server's sentence
  settings/        the address and the key (DataStore; the key sealed by the Android Keystore),
                   checked against /api/about, and the right write without writing anything
  outbox/          what waits to be sent (Room), the share intents, the sending (WorkManager)
  home/            the home screen's data: the last briefing read, kept with the address of its server
                   (`HomeStore`, DataStore) and what Home shows of it (`Home`); a due date as a line (`dueLine`)
  warn/            the notifications before a due date: the choice and the dates already warned of
                   (`Warnings`, DataStore), the daily job (`HeadsUpWorker`, WorkManager), what it does
                   (`Warner`) and the notification (`Notifier`)
  read/            reading: the calls of the read API as a `Load` (`Reading`), the tree from its
                   entries (`treeOf`, a port of the desktop viewer's), a body in Markdown
                   (`parseMarkdown`), the words found in an excerpt (`marked`)
  sent/            what each item sent from the phone became, from GET /api/inbox
  ui/              the screens (home, search, browse, an entry, sent, add, settings), the share sheet, the theme
  Graph.kt         what the application is made of, built once; WorkManager's configuration
```

- **Nothing is lost.** Each thing to send is kept in Room the moment it is given, a shared file
  copied into the application's storage at once, with a client identifier chosen then and sent with
  every attempt. `SendWorker` runs when the network is there, retries with a growing delay while
  the server cannot be reached or fails (408, 429, 5xx), and stops on a refusal (any other 4xx),
  kept with the server's sentence.
- **The instance is always shown** (production, development or local, and its label), wherever
  something may be sent.
- **The key is never shown again** once saved, nor printed: `Server.toString()` leaves it out.
- **Screens** take their words from `res/values/strings.xml`, in English, and their colours from
  `ui/theme/Theme.kt`, which follows `apps/desktop/crates/ui/src/theme.json`, dark and light, as
  the phone is set. The bottom bar holds the destinations (Home, Search, Browse, Add, Sent), as routes
  of the `NavHost` in `ui/MainActivity.kt`, which opens on Home; an entry is a route of its own,
  `entry/{entry}`, opened over whichever destination led to it, by its slug or id, with its own back
  stack.
- **Home never shows the old as current.** It asks `GET /api/briefing?period=week`, then
  `GET /api/entries?sort=updated&limit=5`; what it read last is kept (`HomeStore`) with its time and the
  address of its server, and shown, with that time and the reason, only while the server cannot be
  asked. A briefing read from another address is not shown. It lists the deadlines past (`overdue`)
  first and apart, then the heads-ups and what is due this week; a date inside its notice that also
  falls this week is shown once, as a heads-up. The entries changed recently come last, each with its
  type, when it changed and the key that changed it; they are secondary, so a briefing read while they
  could not be is shown without them.
- **A heads-up warns once.** The daily job (`HeadsUpWorker`, `PeriodicWorkRequest` of one day, network
  required, started by the switch of the settings and cancelled by it) asks `GET /api/briefing` and
  notifies each `heads_up` whose `id` (`<entry id>:<field>:<date>`) is not in the set `Warnings`
  keeps, then adds it. Nothing is added while the phone cannot show a notification (the permission
  refused, or the notifications off), so the date is warned of once it can. The switch is off by
  default; on Android 13 and later, turning it on asks `POST_NOTIFICATIONS` (`permissionMustBeAsked`),
  never at start. A server that cannot be reached is tried again later (`Result.retry`); a refusal
  (a revoked key) is not, until the next day. A notification opens `MainActivity` with
  `hippocampe://entry/<slug>`, which opens the entry over Home (`singleTop`, `onNewIntent`). Exact
  alarms are not needed and no push service is used.
- **A screen is a ViewModel and a composable.** The model (`SearchModel`, `BrowseModel`,
  `EntryModel`) asks `Reading` and holds the `Load` the screen draws: reading, ready, or the one
  sentence that says why it failed, which the screen shows with *Try again*. What is only supposed
  (provenance `inferred`, or `ambiguous`) is marked apart, as the desktop viewer does; a value the
  key may not read comes as `[hidden]` and is said to be hidden.
- **Markdown is read by a small renderer of ours** (`read/Markdown.kt`, drawn by `ui/MarkdownView.kt`):
  headings, paragraphs, lists, quotes, code, rules; emphasis, code, links, images and `[[references]]`
  (which open the entry they name, or are plain text while it does not exist). No library: none of
  the maintained Compose renderers lets an image be fetched with the key, nor a reference open an
  entry, without replacing most of it, and a library is one more thing to pin and to follow. A table
  is shown as written; the heading of `[[slug#heading]]` is not followed. Only an image that is a
  medium of the entry is fetched; any other address is a link.

## Build types

`release` is the application of the owner's real instance (`fr.kristenjestin.hippocampe`). `beta`
is installed beside it, for the development instance: `applicationIdSuffix = ".beta"`, named
"Hippocampe Beta" and with another launcher background (`src/beta/res`), signed with the same key.
`debug` is for trying a pull request, installed beside both: `applicationIdSuffix = ".debug"`, named
"Hippocampe Debug" (`src/debug/res`). The release refuses plain HTTP and the other two allow it,
through a network security config per build type (`src/main/res/xml/` for the release, `src/beta/`
and `src/debug/` for the others), never `usesCleartextTraffic`. `BuildTypesTest` checks both on
each variant, which is why `bun run test` runs it on `testDebugUnitTest`, `testBetaUnitTest` and
`testReleaseUnitTest`.

## Commands

From the root through Turborepo (`bun run check` runs the lint and the tests), or from
`apps/android`:

```
bun run generate                  # api/Types.kt from packages/api/openapi.json
bun run test                      # the staleness test of the types, then the unit tests (BuildTypesTest on all three build types)
bun run lint                      # oxlint on the scripts, then ./gradlew lintDebug
bun run build                     # ./gradlew assembleDebug: app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest --tests '*SendingTest*'
```

`scripts/gradle.ts` runs the wrapper for those scripts. Without an Android SDK (`ANDROID_HOME`,
`ANDROID_SDK_ROOT`, or `sdk.dir` in `local.properties`, which is never committed) or without Java
17 or later (`JAVA_HOME` or `java`), it says so in one line and skips, so `bun run check` still runs
on a machine made for the server; with `CI` set, it fails instead.

The tests are unit tests on the JVM, with Robolectric (Android 16: `src/test/resources/robolectric.properties`)
for Room, WorkManager, DataStore and Compose, and the server simulated by Ktor's mock engine
(`FakeServer`). Each is named after the scenario it covers. A wait for the application (`AppTest`) is
bounded by a hang, not by what it should take: the application reads on threads Compose's clock does
not drive, and the first test of a JVM loads everything.

## Releases and the beta

The release workflow builds `assembleRelease` from the tag (`HIPPOCAMPE_VERSION` gives the version
name; the version code is `major·10000 + minor·100 + patch`), signs it with the key the repository's
secrets hold (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`), and attaches `hippocampe-android-<version>.apk` and its `.sha256` to the
release. Until the secrets are set, it says so in one line and attaches nothing. A debug build is
signed with the default debug key; every pull request uploads its debug APK as an artifact of CI.

To make the release key once, outside the repository:

```
keytool -genkeypair -v -keystore hippocampe-release.jks -alias hippocampe -keyalg RSA -keysize 4096 -validity 36500
base64 -w0 hippocampe-release.jks     # the value of ANDROID_KEYSTORE_BASE64
```

Keep the keystore and its passwords safe: an APK signed with another key cannot update the
installed one.

The beta is built by `.github/workflows/android-beta.yml` at each push to `dev`, with the same
secrets: `assembleBeta` with `HIPPOCAMPE_VERSION` (`<last tag>-beta.<run>+<short commit>`) and
`HIPPOCAMPE_BETA_RUN` (the run number of the workflow, which is the version code, so it always
grows), then it deletes the pre-release `android-beta` and makes it again on that commit with
`hippocampe-android-beta.apk` and its `.sha256`. It is a pre-release, never the latest, and its tag
is not a version, so semantic-release never reads it. One beta job runs at a time per branch, the
newest push wins. Without the secrets, it says so in one line and publishes nothing. The release
and the beta are two applications, so their version codes never meet.

Installing it on a phone and pairing it with a server: [`docs/android.md`](../../docs/android.md).
