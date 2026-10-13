package fr.kristenjestin.hippocampe

import android.Manifest
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import fr.kristenjestin.hippocampe.api.About
import fr.kristenjestin.hippocampe.api.AboutInstance
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** A wait for the application is bounded by a hang, as in `AppTest`. */
private const val HANG = 30_000L

/** What a screen of the bottom bar shows that no other screen does, by the label of its item. */
private val screens = mapOf(
    "Home" to "Nothing is due this week, and nothing waits.",
    "Search" to "Type a few words to find an entry.",
    "Browse" to "Kitchen",
    "Add" to "Send to the inbox",
    "Sent" to "Nothing was sent from this phone yet.",
)

/** The bottom bar highlights the destination whose screen is shown, always and only that one. */
@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class)
class NavigationTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    private val app: TestApp = ApplicationProvider.getApplicationContext()
    private val server = FakeServer().apply { stockRecipes() }
    private var scenario: ActivityScenario<MainActivity>? = null

    @After
    fun close() {
        scenario?.close()
    }

    private fun saveSettings() {
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

    private fun launch() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    private fun has(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    /** The labels of the items of the bar that are highlighted. */
    private fun highlighted(): List<String> = compose.onAllNodes(isTab).fetchSemanticsNodes()
        .filter { it.config.getOrNull(SemanticsProperties.Selected) == true }
        .map { node -> node.config.getOrNull(SemanticsProperties.Text).orEmpty().joinToString { it.text } }

    /** The items of the bar; the search screen's filter chips are selectable too, but are not tabs. */
    private val isTab = isSelectable() and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)

    private fun tab(label: String) = compose.onNode(isTab and hasText(label))

    private fun shown(label: String) = has(screens.getValue(label))

    /** Waits for the screen of [label], then checks that it is the only one shown and the only item highlighted. */
    private fun assertShown(label: String) {
        compose.waitUntil(HANG) { shown(label) }
        compose.waitForIdle()
        assertEquals("the screens shown", listOf(label), screens.keys.filter(::shown))
        assertEquals("the item highlighted while $label is shown", listOf(label), highlighted())
    }

    private fun visitEvery() {
        for (label in screens.keys) {
            tab(label).performClick()
            assertShown(label)
        }
    }

    @Test
    fun `the item of the screen shown is highlighted after the first start`() {
        TestServer.current = server
        runBlocking { app.preferences.edit { it.clear() } }
        runBlocking { app.graph.warnings.turn(false) }
        launch()
        compose.waitUntil(HANG) { has("Connect to Hippocampe") }

        compose.onNodeWithText("Server address").performTextInput("http://hippocampe.test:3000")
        compose.onNodeWithText("Key").performTextInput(server.key)
        compose.onNode(hasText("Check and save") and hasClickAction()).performClick()
        assertShown("Home")

        visitEvery()
    }

    @Test
    fun `the item of the screen shown is highlighted on each destination from the start`() {
        saveSettings()
        launch()
        assertShown("Home")

        visitEvery()
        for (label in screens.keys.reversed()) {
            tab(label).performClick()
            assertShown(label)
        }
    }

    @Test
    fun `the item of the screen shown is highlighted back from the settings`() {
        saveSettings()
        launch()
        assertShown("Home")

        for (label in screens.keys) {
            tab(label).performClick()
            assertShown(label)
            compose.onNodeWithContentDescription("Settings").performClick()
            compose.waitUntil(HANG) { has("Warn me before a due date") }
            compose.waitForIdle()
            assertEquals("no item is highlighted on the settings screen", emptyList<String>(), highlighted())

            tab(label).performClick()
            assertShown(label)
        }
    }

    @Test
    fun `the item of the screen shown is highlighted back from an entry`() {
        saveSettings()
        launch()
        tab("Browse").performClick()
        compose.waitUntil(HANG) { has("Kitchen") }
        compose.onNodeWithContentDescription("Open Kitchen").performClick()
        compose.onNodeWithText("Plum tart").performClick()
        compose.waitUntil(HANG) { has("A tart of the late plums.") }

        compose.onNodeWithContentDescription("Back").performClick()
        assertShown("Browse")

        tab("Search").performClick()
        assertShown("Search")
    }

    private fun pressBack() = scenario!!.onActivity { it.onBackPressedDispatcher.onBackPressed() }

    @Test
    fun `the item of the screen shown is highlighted after the back button`() {
        saveSettings()
        launch()
        assertShown("Home")

        for (label in screens.keys.drop(1)) {
            tab(label).performClick()
            assertShown(label)
            pressBack()
            assertShown("Home")
        }

        tab("Search").performClick()
        tab("Browse").performClick()
        assertShown("Browse")
        pressBack()
        assertShown("Home")
    }

    @Test
    fun `the item of the screen shown is highlighted after taps that follow one another without a pause`() {
        saveSettings()
        launch()
        assertShown("Home")

        for (order in listOf(listOf("Search", "Browse", "Search"), listOf("Browse", "Search", "Browse", "Home", "Sent", "Search"))) {
            order.forEach { tab(it).performClick() }
            assertShown(order.last())
        }

        compose.onNodeWithContentDescription("Settings").performClick()
        tab("Browse").performClick()
        compose.onNodeWithContentDescription("Settings").performClick()
        tab("Search").performClick()
        assertShown("Search")
    }

    @Test
    fun `the item of the screen shown is highlighted after the activity is recreated`() {
        saveSettings()
        launch()
        assertShown("Home")

        for (label in screens.keys) {
            tab(label).performClick()
            assertShown(label)
            scenario!!.recreate()
            assertShown(label)
        }

        compose.onNodeWithContentDescription("Settings").performClick()
        compose.waitUntil(HANG) { has("Warn me before a due date") }
        scenario!!.recreate()
        compose.waitUntil(HANG) { has("Warn me before a due date") }
        tab("Search").performClick()
        assertShown("Search")
    }
}
