# AGENTS.md — the Android application

Read the root `AGENTS.md` first; this file adds the rules of `apps/android`, a Gradle project in
Kotlin (Kotlin DSL), with Jetpack Compose and Material 3. Every version is pinned exactly in
`gradle/libs.versions.toml`, Gradle itself in `gradle/wrapper/gradle-wrapper.properties` (with its
checksum).

## What it is

The application puts things into the inbox from the phone and shows what each became. It never
writes an entry and knows nothing of types, bookmarks or X: a shared link is a link, the server and
its agents do the rest.

```
app/src/main/kotlin/io/github/kristenjestin/hippocampe/
  api/Types.kt     the types of the API, generated (never edited by hand)
  api/Api.kt       the read API and the inbox, Ktor on OkHttp; refusals keep the server's sentence
  settings/        the address and the key (DataStore; the key sealed by the Android Keystore),
                   checked against /api/about, and the right write without writing anything
  outbox/          what waits to be sent (Room), the share intents, the sending (WorkManager)
  sent/            what each item sent from the phone became, from GET /api/inbox
  ui/              the screens, the share sheet, the theme
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
  the phone is set. The bottom bar holds the destinations; reading and the home screen join it
  when their issues come, as new routes of the `NavHost` in `ui/MainActivity.kt`.

## Commands

From the root through Turborepo (`bun run check` runs the lint and the tests), or from
`apps/android`:

```
bun run generate                  # api/Types.kt from packages/api/openapi.json
bun run test                      # the staleness test of the types, then ./gradlew testDebugUnitTest
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
(`FakeServer`). Each is named after the scenario it covers.

## Releases

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

Installing it on a phone and pairing it with a server: [`docs/android.md`](../../docs/android.md).
