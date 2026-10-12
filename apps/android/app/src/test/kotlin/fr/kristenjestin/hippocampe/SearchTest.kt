package fr.kristenjestin.hippocampe

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.ui.SearchModel
import fr.kristenjestin.hippocampe.ui.SearchScreen
import fr.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SearchTest {
    @get:Rule
    val compose = createComposeRule()

    private val server = FakeServer().apply { stockRecipes() }
    private val reading = Reading(Api(server.engine)) { Server("http://hippocampe.test:3000", server.key) }
    private val opened = mutableListOf<String>()

    private fun show(): SearchModel {
        val model = SearchModel(reading, debounce = 0)
        compose.setContent { HippocampeTheme { SearchScreen(model, { opened += it }) } }
        return model
    }

    private fun type(text: String) = compose.onNode(hasSetTextAction()).performTextInput(text)

    private fun searches() = server.requests.filter { it.url.encodedPath == "/api/search" }

    @Test
    fun `a search shows the results with their path and the words found`() {
        show()
        type("plum")
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Plum tart").fetchSemanticsNodes().isNotEmpty() }

        compose.onNodeWithText("Kitchen › Desserts").assertExists()
        compose.onNodeWithText("Orchard cookbook").assertExists()
        assertEquals("plum", searches().last().url.parameters["q"])

        val excerpt = compose.onNodeWithText("A plum tart with plums.", useUnmergedTree = true).fetchSemanticsNode()
        val text = excerpt.config[SemanticsProperties.Text].single()
        assertEquals(
            "the words found are marked in the excerpt, and the marks themselves are gone",
            listOf(2 to 6, 17 to 22),
            text.spanStyles.map { it.start to it.end },
        )

        compose.onNodeWithText("Plum tart").performClick()
        assertEquals(listOf("plum-tart"), opened)
    }

    @Test
    fun `a search is filtered by type`() {
        show()
        type("plum")
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Orchard cookbook").fetchSemanticsNodes().isNotEmpty() }
        assertEquals("every type is searched at first", null, searches().last().url.parameters["type"])

        compose.onNodeWithTag("filter-recipe").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Orchard cookbook").fetchSemanticsNodes().isEmpty() }
        assertEquals("recipe", searches().last().url.parameters["type"])
        compose.onNodeWithText("Plum tart").assertExists()

        compose.onNodeWithTag("filter-all").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Orchard cookbook").fetchSemanticsNodes().isNotEmpty() }
        assertEquals(null, searches().last().url.parameters["type"])
    }

    @Test
    fun `a search that fails says why and can be tried again`() {
        server.reachable = false
        show()
        type("plum")
        compose.waitUntil(5_000) {
            compose.onAllNodesWithText(Api.unreachable(Server("http://hippocampe.test:3000", server.key))).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onAllNodesWithText("Plum tart").assertCountEquals(0)

        server.reachable = true
        compose.onNodeWithText("Try again").performClick()
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Plum tart").fetchSemanticsNodes().isNotEmpty() }
        assertTrue(searches().size >= 2)
    }

    @Test
    fun `a search a key may not make is refused in the server's sentence`() {
        server.rights = setOf("write")
        show()
        type("plum")
        compose.waitUntil(5_000) {
            compose.onAllNodesWithText("This key may not read: ask the owner of Hippocampe for a key with the right `read`.")
                .fetchSemanticsNodes().isNotEmpty()
        }
    }
}
