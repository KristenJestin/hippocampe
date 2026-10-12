package fr.kristenjestin.hippocampe

import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.api.TreePlace
import fr.kristenjestin.hippocampe.read.Block
import fr.kristenjestin.hippocampe.read.Inline
import fr.kristenjestin.hippocampe.read.Marked
import fr.kristenjestin.hippocampe.read.Node
import fr.kristenjestin.hippocampe.read.Reference
import fr.kristenjestin.hippocampe.read.Target
import fr.kristenjestin.hippocampe.read.dateInWords
import fr.kristenjestin.hippocampe.read.labelOf
import fr.kristenjestin.hippocampe.read.marked
import fr.kristenjestin.hippocampe.read.parseMarkdown
import fr.kristenjestin.hippocampe.read.treeOf
import org.junit.Assert.assertEquals
import org.junit.Test

/** The pure parts of reading: the words found in an excerpt, the tree, a body in Markdown. */
class ReadingPartsTest {
    @Test
    fun `the marked words of an excerpt are found`() {
        assertEquals(
            Marked("A plum tart with plums.", listOf(2 until 6, 17 until 22)),
            marked("A <mark>plum</mark> tart with <mark>plums</mark>."),
        )
        assertEquals(Marked("Nothing marked", emptyList()), marked("Nothing marked"))
        assertEquals("a mark never closed runs to the end", Marked("cut off", listOf(4 until 7)), marked("cut <mark>off"))
    }

    private fun place(id: String, inParent: Boolean = false) = TreePlace(id, inParent)

    private fun entry(id: String, vararg places: TreePlace) = TreeEntry(id, id, "note", id, places.toList())

    /** The tree as (entry, entries below it), one level. */
    private fun shape(tree: List<Node>) = tree.map { node -> node.id to node.children.map { it.id } }

    @Test
    fun `the tree opens from the top-level entries down`() {
        val tree = treeOf(
            listOf(
                entry("kitchen"),
                entry("garage"),
                entry("plum-tart", place("kitchen")),
                entry("crust", place("plum-tart")),
            ),
        )
        assertEquals(listOf("kitchen", "garage"), tree.map { it.id })
        assertEquals(listOf("plum-tart"), tree[0].children.map { it.id })
        assertEquals(listOf("crust"), tree[0].children[0].children.map { it.id })
        assertEquals(emptyList<Node>(), tree[1].children)
    }

    @Test
    fun `the children of a part are filed under the whole it belongs to`() {
        val tree = treeOf(
            listOf(
                entry("computer"),
                entry("disk", place("computer", inParent = true)),
                entry("disk-manual", place("disk")),
            ),
        )
        assertEquals(listOf("computer" to listOf("disk-manual")), shape(tree))
    }

    @Test
    fun `an entry whose place is unseen stands at the top and one with two places is drawn under both`() {
        val tree = treeOf(
            listOf(
                entry("desktop"),
                entry("laptop"),
                entry("monitor", place("desktop"), place("laptop")),
                entry("diary-page", place("hidden-diary")),
            ),
        )
        assertEquals(
            listOf("desktop" to listOf("monitor"), "laptop" to listOf("monitor"), "diary-page" to emptyList<String>()),
            shape(tree),
        )
    }

    @Test
    fun `an entry read in one whole and filed under another is drawn under the second only`() {
        val tree = treeOf(
            listOf(
                entry("computer"),
                entry("shelf"),
                entry("fan", place("computer", inParent = true), place("shelf")),
            ),
        )
        assertEquals(listOf("computer" to emptyList<String>(), "shelf" to listOf("fan")), shape(tree))
    }

    @Test
    fun `a loop among the places hangs nothing`() {
        val tree = treeOf(listOf(entry("east", place("west")), entry("west", place("east")), entry("lone")))
        assertEquals(listOf("lone" to emptyList<String>()), shape(tree))
    }

    private fun run(text: String, bold: Boolean = false, italic: Boolean = false, code: Boolean = false, target: Target? = null) =
        Inline.Run(text, bold, italic, code, target)

    @Test
    fun `a body is read as headings, paragraphs, lists, quotes, code and rules`() {
        val body = """
            ## Method

            Beat the **eggs**, then *fold* in `flour`.
            It rests.

            - one
              - nested
            2. second
            > a quote

            ---
            ```kotlin
            val x = 1
            ```
            | a | b |
        """.trimIndent()
        assertEquals(
            listOf(
                Block.Heading(2, listOf(run("Method"))),
                Block.Paragraph(
                    listOf(
                        run("Beat the "),
                        run("eggs", bold = true),
                        run(", then "),
                        run("fold", italic = true),
                        run(" in "),
                        run("flour", code = true),
                        run(". It rests."),
                    ),
                ),
                Block.Item(0, "•", listOf(run("one"))),
                Block.Item(1, "•", listOf(run("nested"))),
                Block.Item(0, "2.", listOf(run("second"))),
                Block.Quote(listOf(run("a quote"))),
                Block.Rule,
                Block.Code("val x = 1"),
                Block.Code("| a | b |"),
            ),
            parseMarkdown(body),
        )
    }

    @Test
    fun `links, images and references in a body are told apart`() {
        val known = mapOf("plum-tart" to Reference("id-plum", "Plum tart"))
        val blocks = parseMarkdown(
            "See [the recipe](https://example.org/tart), [[plum-tart]], [[plum-tart|the tart]], [[waiting]] " +
                "and https://example.org/raw.\n\n![A tart](/media/ab12cd)",
            known::get,
        )
        assertEquals(
            listOf(
                Block.Paragraph(
                    listOf(
                        run("See "),
                        run("the recipe", target = Target.Web("https://example.org/tart")),
                        run(", "),
                        run("Plum tart", target = Target.Entry("id-plum")),
                        run(", "),
                        run("the tart", target = Target.Entry("id-plum")),
                        run(", waiting and "),
                        run("https://example.org/raw", target = Target.Web("https://example.org/raw")),
                        run("."),
                    ),
                ),
                Block.Paragraph(listOf(Inline.Picture("A tart", "/media/ab12cd"))),
            ),
            blocks,
        )
    }

    @Test
    fun `emphasis inside a word and an escaped mark are left as written`() {
        assertEquals(
            listOf(Block.Paragraph(listOf(run("snake_case_name and 2 * 3 and *not emphasis")))),
            parseMarkdown("snake_case_name and 2 * 3 and \\*not emphasis"),
        )
    }

    @Test
    fun `a date is told in words and a field name as a label`() {
        assertEquals("30 September 2026", dateInWords("2026-09-30T08:00:00.000Z"))
        assertEquals("1 January 2026", dateInWords("2026-01-01"))
        assertEquals("a value that is no date stays as it is", "next spring", dateInWords("next spring"))
        assertEquals("Monthly cost", labelOf("monthly_cost"))
        assertEquals("Servings", labelOf("fields.servings"))
    }
}
