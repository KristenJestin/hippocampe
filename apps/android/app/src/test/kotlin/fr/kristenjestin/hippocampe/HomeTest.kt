package fr.kristenjestin.hippocampe

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.home.Home
import fr.kristenjestin.hippocampe.home.HomeStore
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.ui.HomeModel
import fr.kristenjestin.hippocampe.ui.HomeScreen
import fr.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.nio.file.Files
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class HomeTest {
    @get:Rule
    val compose = createComposeRule()

    private val address = "http://hippocampe.test:3000"
    private val server = FakeServer()
    private val folder: File = Files.createTempDirectory("home").toFile()
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val store = HomeStore(PreferenceDataStoreFactory.create(scope = scope) { File(folder, "home.preferences_pb") })
    private var now = Instant.parse("2026-10-12T12:00:00Z")
    private val home = Home(Reading(Api(server.engine)) { Server(address, server.key) }, store, { Server(address, server.key) }, { now })
    private val entries = mutableListOf<String>()
    private var sent = 0

    @After
    fun close() {
        scope.cancel()
        folder.deleteRecursively()
    }

    private fun show(): HomeModel {
        val model = HomeModel(home)
        compose.setContent { HippocampeTheme { HomeScreen(model, { entries += it }, { sent++ }) } }
        return model
    }

    private fun has(text: String, substring: Boolean = false) =
        compose.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty()

    private fun briefingRequests() = server.requests.filter { it.url.encodedPath == "/api/briefing" }

    @Test
    fun `home shows the heads-ups and what is due this week`() {
        server.briefing = briefingOf(
            headsUp = listOf(internetPlanEnds, warrantyEnds),
            upcoming = listOf(warrantyEnds, camilleBirthday),
        )
        show()
        compose.waitUntil(5_000) { has("Internet plan") }

        compose.onNodeWithText("Heads-up").assertExists()
        compose.onNodeWithText("End: in 39 days (20 November 2026)").assertExists()
        compose.onNodeWithText("Warranty end: in 2 days (14 October 2026)").assertExists()
        compose.onNodeWithText("This week").assertExists()
        compose.onNodeWithText("Camille Test").assertExists()
        compose.onNodeWithText("Birthday: in 6 days (18 October 2026)").assertExists()
        compose.onAllNodesWithText("Washing machine").assertCountEquals(1)
        assertEquals("the week is asked for", "week", briefingRequests().single().url.parameters["period"])

        compose.onNodeWithText("Internet plan").performClick()
        compose.onNodeWithText("Camille Test").performClick()
        assertEquals(listOf("internet-plan", "camille-test"), entries)
    }

    @Test
    fun `home shows what changed recently`() {
        server.briefing = briefingOf(headsUp = listOf(warrantyEnds))
        server.recent = recentlyChanged
        show()
        compose.waitUntil(5_000) { has("Garage shelf") }

        compose.onNodeWithText("Recently changed").assertExists()
        compose.onNodeWithText("Internet plan").assertExists()
        compose.onNodeWithText("Contract · 12 October 2026 at ", substring = true).assertExists()
        compose.onNodeWithText("by agent-laptop", substring = true).assertExists()
        compose.onNodeWithText("Recipe · 11 October 2026 at ", substring = true).assertExists()
        assertTrue("an entry whose key is not known is not said to be by anyone", !has("Recipe · 11 October 2026 at 18:45 · by", substring = true))
        val asked = server.requests.single { it.url.encodedPath == "/api/entries" }.url.parameters
        assertEquals("the first few changed entries are asked for", listOf("updated", "5"), listOf(asked["sort"], asked["limit"]))

        compose.onNodeWithText("Garage shelf").performClick()
        assertEquals(listOf("garage-shelf"), entries)
    }

    @Test
    fun `home says nothing of what changed recently while nothing changed`() {
        server.briefing = briefingOf(headsUp = listOf(warrantyEnds))
        show()
        compose.waitUntil(5_000) { has("Washing machine") }

        assertTrue(!has("Recently changed"))
    }

    @Test
    fun `home keeps what changed recently with the last briefing read`() {
        server.recent = recentlyChanged
        val model = show()
        compose.waitUntil(5_000) { has("Internet plan") }

        server.reachable = false
        model.refresh()
        compose.waitUntil(5_000) { has("Last read", substring = true) }

        compose.onNodeWithText("Recently changed").assertExists()
        compose.onNodeWithText("Internet plan").assertExists()
    }

    @Test
    fun `home shows the deadlines past apart from what is coming`() {
        server.briefing = briefingOf(
            overdue = listOf(lapsedInsurance, lapsedPermit),
            headsUp = listOf(internetPlanEnds),
            upcoming = listOf(camilleBirthday),
        )
        show()
        compose.waitUntil(5_000) { has("Flat insurance") }

        compose.onNodeWithText("Overdue").assertExists()
        compose.onNodeWithText("End: 3 days ago (9 October 2026)").assertExists()
        compose.onNodeWithText("Valid until: yesterday (11 October 2026)").assertExists()
        compose.onNodeWithText("Heads-up").assertExists()
        compose.onNodeWithText("This week").assertExists()
        compose.onAllNodesWithText("Flat insurance").assertCountEquals(1)

        compose.onNodeWithText("Flat insurance").performClick()
        assertEquals(listOf("flat-insurance"), entries)
    }

    @Test
    fun `home says nothing of deadlines past while none is past`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        show()
        compose.waitUntil(5_000) { has("Internet plan") }

        assertTrue(!has("Overdue"))
    }

    @Test
    fun `home shows how many items wait in the inbox`() {
        server.briefing = briefingOf(inbox = 3)
        show()
        compose.waitUntil(5_000) { has("3 items wait in the inbox") }

        compose.onNodeWithText("3 items wait in the inbox").performClick()
        assertEquals("the inbox opens Sent", 1, sent)
    }

    @Test
    fun `home says nothing of the inbox while nothing waits in it`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        show()
        compose.waitUntil(5_000) { has("Internet plan") }

        assertTrue(!has("wait in the inbox", substring = true) && !has("waits in the inbox", substring = true))
    }

    @Test
    fun `home says when it was last read when the server cannot be reached`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds), inbox = 1)
        val model = show()
        compose.waitUntil(5_000) { has("Internet plan") }
        assertTrue("a briefing that was just read is not dated", !has("Last read", substring = true))

        server.reachable = false
        now = Instant.parse("2026-10-13T09:00:00Z")
        model.refresh()
        compose.waitUntil(5_000) { has("Last read", substring = true) }

        compose.onNodeWithText("Last read 12 October 2026 at ", substring = true).assertExists()
        compose.onNodeWithText(Api.unreachable(Server(address, server.key))).assertExists()
        compose.onNodeWithText("Internet plan").assertExists()
        compose.onNodeWithText("1 item waits in the inbox").assertExists()

        server.reachable = true
        model.refresh()
        compose.waitUntil(5_000) { !has("Last read", substring = true) }
    }

    @Test
    fun `home that was never read says why and shows nothing`() {
        server.reachable = false
        show()
        compose.waitUntil(5_000) { has(Api.unreachable(Server(address, server.key))) }

        assertTrue(!has("Last read", substring = true))
        compose.onNodeWithText("Try again").assertExists()
    }

    @Test
    fun `a briefing read from another server is not shown as the last read of this one`() = runBlocking {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        assertTrue(home.read() is Load.Ready)

        val other = Server("http://other.test:3000", server.key)
        server.reachable = false
        val read = Home(Reading(Api(server.engine)) { other }, store, { other }, { now }).read()

        assertEquals(Load.Failed(Api.unreachable(other)), read)
    }

    @Test
    fun `home is pulled to refresh`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        show()
        compose.waitUntil(5_000) { has("Internet plan") }

        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds, camilleBirthday))
        compose.onNodeWithTag("home").performTouchInput { swipeDown() }
        compose.waitUntil(5_000) { has("Camille Test") }

        assertEquals(2, briefingRequests().size)
    }
}
