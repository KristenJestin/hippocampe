package fr.kristenjestin.hippocampe

import android.Manifest
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.ui.MainActivity
import fr.kristenjestin.hippocampe.ui.ShareActivity
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** The application on a real server, the one `tools/screenshots.ts` starts. */
class ScreenshotApp : HippocampeApp() {
    override val graph by lazy { Graph(this, OkHttp.create(), MemoryCipher()) }
}

/** A wait for the application is bounded by a hang, as in `AppTest`. */
private const val HANG = 60_000L

/**
 * The screenshots of the README, taken by `bun run screenshots` (`tools/screenshots.ts`), which
 * starts a server filled with invented data and names it in `HIPPOCAMPE_SCREENSHOTS_SERVER`,
 * `HIPPOCAMPE_SCREENSHOTS_KEY` and the folder to write to, `HIPPOCAMPE_SCREENSHOTS_DIR`. Without
 * them, as in `bun run test`, it is skipped. The screens are drawn by Robolectric's native
 * graphics, in the phone's dark theme: no emulator, no window.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = ScreenshotApp::class, qualifiers = "w400dp-h840dp-port-night-xhdpi")
class ScreenshotsTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private val app: ScreenshotApp = ApplicationProvider.getApplicationContext()
    private val address = System.getenv("HIPPOCAMPE_SCREENSHOTS_SERVER")
    private val key = System.getenv("HIPPOCAMPE_SCREENSHOTS_KEY")
    private val folder = System.getenv("HIPPOCAMPE_SCREENSHOTS_DIR")
    private val scenarios = mutableListOf<ActivityScenario<*>>()

    @Before
    fun connect() {
        assumeTrue("Only bun run screenshots takes them.", address != null && key != null && folder != null)
        val server = Server(address!!, key!!)
        val about = runBlocking { app.graph.api.about(server) }
        check(about is Answer.Done) { "The server of the screenshots does not answer: $about" }
        runBlocking {
            app.graph.warnings.turn(false)
            app.graph.settings.save(server, about.value)
        }
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    @After
    fun close() {
        scenarios.forEach { it.close() }
    }

    private fun waitFor(text: String) =
        compose.waitUntil(HANG) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }

    private fun save(name: String, sheet: Boolean = false) {
        compose.waitForIdle()
        val screen = compose.onRoot().captureToImage().asAndroidBitmap()
        val bitmap = if (sheet) sheetOf(screen) else screen
        File(folder, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /**
     * The sheet alone: what is above it is the scrim over an empty screen, cut away, and the scrim
     * left in its rounded corners made transparent.
     */
    private fun sheetOf(screen: Bitmap): Bitmap {
        val scrim = screen.getPixel(screen.width / 2, 0)
        val top = (0 until screen.height).first { screen.getPixel(screen.width / 2, it) != scrim }
        val sheet = Bitmap.createBitmap(screen, 0, top, screen.width, screen.height - top).copy(Bitmap.Config.ARGB_8888, true)
        for (y in 0 until sheet.height) for (x in 0 until sheet.width) {
            if (sheet.getPixel(x, y) == scrim) sheet.setPixel(x, y, Color.TRANSPARENT)
        }
        return sheet
    }

    @Test
    fun `the home shows what is due and what waits`() {
        scenarios += ActivityScenario.launch(MainActivity::class.java)
        waitFor("Internet plan")
        save("android-home")
    }

    @Test
    fun `an entry shows its fields, its body and its links`() {
        val intent = Intent(app, MainActivity::class.java).setData(Uri.parse("hippocampe://entry/lemon-tart"))
        scenarios += ActivityScenario.launch<MainActivity>(intent)
        waitFor("Claire adds a pinch of salt")
        save("android-entry")
    }

    @Test
    fun `a link shared from another application goes to the inbox`() {
        val intent = Intent(app, ShareActivity::class.java)
            .setAction(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "https://recipes.example/apple-galette")
        scenarios += ActivityScenario.launch<ShareActivity>(intent)
        waitFor("apple-galette")
        save("android-share", sheet = true)
    }
}
