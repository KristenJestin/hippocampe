package fr.kristenjestin.hippocampe

import android.content.Intent
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.HistoryChange
import fr.kristenjestin.hippocampe.api.HistoryEvent
import fr.kristenjestin.hippocampe.api.HistoryPage
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.ui.EntryModel
import fr.kristenjestin.hippocampe.ui.EntryScreen
import fr.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class EntryTest {
    @get:Rule
    val compose = createComposeRule()

    private val address = "http://hippocampe.test:3000"
    private val server = FakeServer().apply { stockRecipes() }
    private val reading = Reading(Api(server.engine)) { Server(address, server.key) }
    private val opened = mutableListOf<String>()

    private fun show(entry: String = "plum-tart") {
        val model = EntryModel(reading, entry)
        compose.setContent { HippocampeTheme { EntryScreen(model, { opened += it }) } }
        compose.waitUntil(5_000) { has("Plum tart") }
    }

    private fun has(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    private fun field(name: String) = compose.onNodeWithTag("field-$name", useUnmergedTree = true)

    /** The node holds, anywhere under it, each of these texts. */
    private fun SemanticsNodeInteraction.shows(vararg texts: String) =
        texts.forEach { assert(hasAnyDescendant(hasText(it))) }

    private fun SemanticsNodeInteraction.hides(vararg texts: String) =
        texts.forEach { assert(!hasAnyDescendant(hasText(it))) }

    /** Follows the first link of the body, the way a screen reader does: the text draws it, but gives it no room to tap in a test. */
    private fun followBodyLink() {
        val body = hasText("Roll the crust thin", substring = true)
        compose.onNode(body).performScrollTo()
        compose.onAllNodes(hasClickAction() and hasAnyAncestor(body), useUnmergedTree = true)[0]
            .performSemanticsAction(SemanticsActions.OnClick)
    }

    @Test
    fun `an entry shows its fields, body, links, children and media`() {
        show()

        // Where it sits and what it is.
        compose.onNodeWithText("Kitchen").assertExists()
        compose.onNodeWithText("Desserts").assertExists()
        compose.onNodeWithText("Recipe").assertExists()
        compose.onNodeWithText("dessert").assertExists()
        compose.onNodeWithText("A tart of the late plums.").assertExists()

        // Its fields, by the kind of each, in the order of its type.
        field("servings").shows("Servings", "6")
        field("prep_time").shows("Prep time", "PT30M")
        field("difficulty").shows("easy")
        field("website").shows("example.org/plum-tart")
        field("source").shows("Orchard cookbook")

        // Its body, in Markdown: a heading, emphasis taken out, a list, a reference by its title, an unknown one as text.
        compose.onNodeWithText("Method").assertExists()
        assertTrue(has("800 g plums"))
        assertTrue(has("1 sheet of pastry"))
        assertTrue(compose.onAllNodesWithText("Roll the crust thin", substring = true).fetchSemanticsNodes().isNotEmpty())
        assertTrue("an unknown reference is plain text", compose.onAllNodesWithText("Ask nobody-yet.", substring = true).fetchSemanticsNodes().isNotEmpty())

        // Its links both ways, with the relation and the note.
        compose.onNodeWithTag("link-plum-jam", useUnmergedTree = true).shows("Uses", "Plum jam", "from the pantry · since 1 January 2026")
        compose.onNodeWithTag("link-sunday-lunch", useUnmergedTree = true).shows("Includes", "Sunday lunch")
        compose.onNodeWithText("Fair notes").assertExists()

        // Its children: a part with its fields, another entry, and the ones the key may not see.
        compose.onNodeWithText("Tart crust").assertExists()
        compose.onNodeWithText("300 g").assertExists()
        compose.onNodeWithText("Glaze").assertExists()
        compose.onNodeWithText("One hidden entry").assertExists()

        // Its dated parts.
        compose.onNodeWithText("Baked for the fair").assertExists()
        compose.onNodeWithText("30 August 2026").assertExists()

        // Its media: the image is fetched with the key and shown, the file is named.
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("The finished tart").fetchSemanticsNodes().size == 2 }
        val image = server.requests.last { it.url.encodedPath == "/media/aa11" }
        assertEquals("Bearer ${server.key}", image.headers["Authorization"])
        compose.onNodeWithText("Printable card").assertExists()
    }

    @Test
    fun `a supposed value is shown apart from a known one`() {
        server.entries["plum-tart"] = plumTart(provenance = """{"servings":"extracted","season":"inferred","difficulty":"ambiguous","body":"inferred"}""")
        show()

        field("season").shows("Supposed")
        field("difficulty").shows("Sources disagree")
        field("servings").hides("Supposed", "Sources disagree")
        compose.onNodeWithTag("body", useUnmergedTree = true).shows("Supposed")
        compose.onNodeWithTag("link-sunday-lunch", useUnmergedTree = true).shows("Supposed")
        compose.onNodeWithTag("link-plum-jam", useUnmergedTree = true).hides("Supposed")
    }

    @Test
    fun `a value written before writers were asked carries no mark`() {
        server.entries["plum-tart"] = plumTart(provenance = """{"servings":"unstated","season":"unstated"}""", backlinkProvenance = "unstated")
        show()

        field("season").hides("Supposed", "Sources disagree")
        compose.onNodeWithTag("link-sunday-lunch", useUnmergedTree = true).hides("Supposed", "Sources disagree")
    }

    @Test
    fun `a hidden sensitive value is said to be hidden`() {
        show()

        field("budget").shows("Budget", "hidden")
        field("budget").hides("[hidden]")
    }

    @Test
    fun `an entry field opens the entry it names`() {
        show()

        compose.onNodeWithText("Orchard cookbook").performScrollTo().performClick()
        assertEquals(listOf("01-cookbook"), opened)
    }

    @Test
    fun `a reference of the body, a crumb, a link and a child each open their entry`() {
        show()

        compose.onNodeWithText("Desserts").performClick()
        compose.onNodeWithText("Plum jam").performScrollTo().performClick()
        compose.onNodeWithText("Sunday lunch").performScrollTo().performClick()
        compose.onNodeWithText("Tart crust").performScrollTo().performClick()
        compose.onNodeWithText("Baked for the fair").performScrollTo().performClick()
        compose.onNodeWithText("Fair notes").performScrollTo().performClick()
        followBodyLink()
        assertEquals(
            listOf("11-desserts", "plum-jam", "sunday-lunch", "tart-crust", "bake-day", "fair-notes", "02-crust"),
            opened,
        )
    }

    @Test
    fun `an entry that cannot be read says why and can be tried again`() {
        server.reachable = false
        val model = EntryModel(reading, "plum-tart")
        compose.setContent { HippocampeTheme { EntryScreen(model, { opened += it }) } }
        val unreachable = Api.unreachable(Server(address, server.key))
        compose.waitUntil(5_000) { has(unreachable) }

        server.reachable = true
        compose.onNodeWithText("Try again").performClick()
        compose.waitUntil(5_000) { has("Plum tart") }
        compose.onAllNodesWithText(unreachable).assertCountEquals(0)
    }

    @Test
    fun `an entry that does not exist says so in the server's sentence`() {
        val model = EntryModel(reading, "no-such-entry")
        compose.setContent { HippocampeTheme { EntryScreen(model, { opened += it }) } }
        compose.waitUntil(5_000) { has("No entry is named `no-such-entry`: search for it, or check its slug.") }
    }

    @Test
    fun `the history of an entry is shown when it is asked for`() {
        server.histories["plum-tart"] = HistoryPage(
            listOf(
                HistoryEvent(
                    "e2", "2026-09-30T08:00:00.000Z", "pc-arch", "update",
                    listOf(HistoryChange("fields.servings", JsonPrimitive(4), JsonPrimitive(6))),
                ),
                HistoryEvent("e1", "2026-08-01T10:00:00.000Z", "pc-arch", "create", listOf(HistoryChange("title", JsonNull, JsonPrimitive("Plum tart")))),
            ),
            null,
        )
        show()
        assertTrue("the history costs a read of its own: it waits to be asked for", server.requests.none { it.url.encodedPath.endsWith("/history") })

        compose.onNodeWithText("Show the history").performScrollTo().performClick()
        compose.waitUntil(5_000) { has("Edited") }
        compose.onNodeWithText("Created").assertExists()
        compose.onNodeWithText("Servings: 4 → 6").assertExists()
        compose.onNodeWithText("by pc-arch · 30 September 2026").assertExists()
    }

    @Test
    fun `a file of an entry that is not an image is opened by the phone`() {
        show()

        compose.onNodeWithText("Printable card").performScrollTo().performClick()
        val application = ApplicationProvider.getApplicationContext<android.app.Application>()
        compose.waitUntil(5_000) { shadowOf(application).peekNextStartedActivity() != null }
        val started = shadowOf(application).nextStartedActivity
        assertEquals(Intent.ACTION_VIEW, started.action)
        assertEquals("application/pdf", started.type)
        assertNotNull(started.data)
        assertEquals("Bearer ${server.key}", server.requests.last { it.url.encodedPath == "/media/bb22" }.headers["Authorization"])
    }
}
