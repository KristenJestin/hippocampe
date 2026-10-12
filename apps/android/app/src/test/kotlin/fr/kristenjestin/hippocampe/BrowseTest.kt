package fr.kristenjestin.hippocampe

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.ui.BrowseModel
import fr.kristenjestin.hippocampe.ui.BrowseScreen
import fr.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BrowseTest {
    @get:Rule
    val compose = createComposeRule()

    private val server = FakeServer().apply { stockRecipes() }
    private val reading = Reading(Api(server.engine)) { Server("http://hippocampe.test:3000", server.key) }
    private val opened = mutableListOf<String>()

    private fun show() {
        val model = BrowseModel(reading)
        compose.setContent { HippocampeTheme { BrowseScreen(model, { opened += it }) } }
    }

    private fun shown(title: String) = compose.onAllNodesWithText(title).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun `browsing starts at the top-level entries and opens one level at a time`() {
        show()
        compose.waitUntil(5_000) { shown("Kitchen") }

        compose.onNodeWithText("Garage").assertExists()
        assert(!shown("Plum tart")) { "what is filed under an entry waits for it to be opened" }

        compose.onNodeWithContentDescription("Open Kitchen").performClick()
        compose.onNodeWithText("Plum tart").assertExists()
        compose.onNodeWithText("Recipe").assertExists()
        assert(!shown("Tart crust")) { "a part is read in the page of its whole, not listed under it" }

        compose.onNodeWithContentDescription("Close Kitchen").performClick()
        assert(!shown("Plum tart"))
    }

    @Test
    fun `an entry of the tree is opened by its title`() {
        show()
        compose.waitUntil(5_000) { shown("Kitchen") }
        compose.onNodeWithContentDescription("Open Kitchen").performClick()
        compose.onNodeWithText("Plum tart").performClick()
        assertEquals(listOf("01-plum-tart"), opened)
    }

    @Test
    fun `a tree that cannot be read says why and can be tried again`() {
        server.reachable = false
        show()
        val sentence = Api.unreachable(Server("http://hippocampe.test:3000", server.key))
        compose.waitUntil(5_000) { shown(sentence) }
        server.reachable = true
        compose.onNodeWithText("Try again").performClick()
        compose.waitUntil(5_000) { shown("Kitchen") }
    }
}
