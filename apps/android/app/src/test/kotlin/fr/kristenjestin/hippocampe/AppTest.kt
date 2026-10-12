package fr.kristenjestin.hippocampe

import android.app.NotificationManager
import android.content.Intent
import android.Manifest
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import fr.kristenjestin.hippocampe.api.About
import fr.kristenjestin.hippocampe.api.AboutInstance
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.ui.MainActivity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** The application as Robolectric starts it, with the fake server for its API and a cipher in memory. */
class TestApp : HippocampeApp() {
    override val graph by lazy { Graph(this, TestServer.current.engine, MemoryCipher()) }
}

/** The fake server the application under test speaks to. */
object TestServer {
    var current = FakeServer()
}

@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class)
class AppTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private val app: TestApp = ApplicationProvider.getApplicationContext()
    private val server = FakeServer().apply { stockRecipes() }
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun connect() {
        TestServer.current = server
        runBlocking { app.graph.warnings.turn(false) }
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        runBlocking {
            app.graph.settings.save(
                Server("http://hippocampe.test:3000", server.key),
                About(AboutInstance.Development, "Test bench", "1.0.0", "abc1234"),
            )
        }
    }

    @After
    fun close() {
        scenario?.close()
    }

    private fun has(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun `the application opens on home`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds), inbox = 2)

        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.waitUntil(5_000) { has("Internet plan") }

        compose.onNodeWithText("2 items wait in the inbox").assertExists()
        scenario!!.onActivity { assertNull("the permission to notify is not asked at start", shadowOf(it).lastRequestedPermission) }
    }

    @Test
    fun `a notification opens its entry`() {
        val tart = occurrence("plum-tart", "Plum tart", "recipe", "bake_by", "2026-10-20", 8)
        server.briefing = briefingOf(headsUp = listOf(tart))
        runBlocking { app.graph.warnings.turn(true) }
        runBlocking { app.graph.warner.warn() }
        val posted = shadowOf(app.getSystemService(NotificationManager::class.java)).allNotifications.single()

        val opening: Intent = shadowOf(posted.contentIntent).savedIntent
        scenario = ActivityScenario.launch(opening)
        compose.waitUntil(5_000) { has("A tart of the late plums.") }

        // Back goes to home, not out of the application.
        compose.onNodeWithContentDescription("Back").performClick()
        compose.waitUntil(5_000) { has("Bake by: in 8 days (20 October 2026)") }
    }

    @Test
    fun `notifications can be turned on and off from the settings`() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        compose.onNodeWithContentDescription("Settings").performClick()
        compose.waitUntil(5_000) { has("Warn me before a due date") }
        assertFalse("the warnings are off until the owner asks", runBlocking { app.graph.warnings.on.first() })

        compose.onNode(isToggleable()).performScrollTo().performClick()
        compose.waitUntil(5_000) { runBlocking { app.graph.warnings.on.first() } }
        compose.onNode(isToggleable()).assertIsOn()

        compose.onNode(isToggleable()).performScrollTo().performClick()
        compose.waitUntil(5_000) { !runBlocking { app.graph.warnings.on.first() } }
        compose.onNode(isToggleable()).assertIsOff()
    }
}
