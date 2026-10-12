package fr.kristenjestin.hippocampe.read

/** The entry a `[[reference]]` names. */
data class Reference(val id: String, val title: String)

/** What a run of text opens. */
sealed interface Target {
    data class Web(val url: String) : Target

    data class Entry(val id: String) : Target
}

sealed interface Inline {
    data class Run(
        val text: String,
        val bold: Boolean = false,
        val italic: Boolean = false,
        val code: Boolean = false,
        val target: Target? = null,
    ) : Inline

    data class Picture(val alt: String, val url: String) : Inline
}

sealed interface Block {
    data class Heading(val level: Int, val inlines: List<Inline>) : Block

    data class Paragraph(val inlines: List<Inline>) : Block

    /** One item of a list, [depth] levels in, led by its [marker] (`•` or `1.`). */
    data class Item(val depth: Int, val marker: String, val inlines: List<Inline>) : Block

    data class Quote(val inlines: List<Inline>) : Block

    /** Code, and a table, which is kept as written. */
    data class Code(val text: String) : Block

    data object Rule : Block
}

private val HEADING = Regex("^(#{1,6})\\s+(.*?)(\\s+#+)?\\s*$")
private val RULE = Regex("^([-*_])(\\s*\\1){2,}$")
private val ITEM = Regex("^(\\s*)([-*+]|\\d+[.)])\\s+(.*)$")
private val SCHEMES = listOf("http://", "https://", "mailto:", "tel:")

/**
 * A body in Markdown, the subset the bodies of entries use: headings, paragraphs, lists (flat, with
 * their depth), quotes, fenced code and tables kept as written, rules; and in a line, emphasis,
 * code, links, images and `[[references]]` in the forms `[[slug]]`, `[[slug|text]]` and
 * `[[slug#heading]]`. A reference [reference] does not know (it waits for its entry) is plain text,
 * never a link that fails; the heading of a reference is not followed. Anything else is text.
 */
fun parseMarkdown(body: String, reference: (String) -> Reference? = { null }): List<Block> {
    val blocks = mutableListOf<Block>()
    val lines = body.replace("\t", "  ").lines()
    val paragraph = mutableListOf<String>()
    var item: Triple<Int, String, MutableList<String>>? = null

    fun flush() {
        if (paragraph.isNotEmpty()) blocks += Block.Paragraph(inlinesOf(paragraph.joinToString(" "), reference))
        paragraph.clear()
        item?.let { (depth, marker, text) -> blocks += Block.Item(depth, marker, inlinesOf(text.joinToString(" "), reference)) }
        item = null
    }

    var at = 0
    while (at < lines.size) {
        val line = lines[at++]
        val trimmed = line.trim()
        val heading = HEADING.matchEntire(trimmed)
        val listed = ITEM.matchEntire(line)
        when {
            trimmed.startsWith("```") || trimmed.startsWith("~~~") -> {
                flush()
                val fence = trimmed.take(3)
                val code = mutableListOf<String>()
                while (at < lines.size && !lines[at].trim().startsWith(fence)) code += lines[at++]
                at++
                blocks += Block.Code(code.joinToString("\n"))
            }
            trimmed.isEmpty() -> flush()
            heading != null -> {
                flush()
                blocks += Block.Heading(heading.groupValues[1].length, inlinesOf(heading.groupValues[2], reference))
            }
            RULE.matches(trimmed) -> {
                flush()
                blocks += Block.Rule
            }
            trimmed.startsWith(">") -> {
                flush()
                val quote = mutableListOf(trimmed.removePrefix(">").trim())
                while (at < lines.size && lines[at].trim().startsWith(">")) quote += lines[at++].trim().removePrefix(">").trim()
                blocks += Block.Quote(inlinesOf(quote.joinToString(" "), reference))
            }
            trimmed.startsWith("|") -> {
                flush()
                val table = mutableListOf(trimmed)
                while (at < lines.size && lines[at].trim().startsWith("|")) table += lines[at++].trim()
                blocks += Block.Code(table.joinToString("\n"))
            }
            listed != null -> {
                flush()
                val marker = listed.groupValues[2]
                item = Triple(
                    (listed.groupValues[1].length / 2).coerceAtMost(4),
                    if (marker[0].isDigit()) marker.dropLast(1) + "." else "•",
                    mutableListOf(listed.groupValues[3]),
                )
            }
            else -> item?.third?.add(trimmed) ?: paragraph.add(trimmed)
        }
    }
    flush()
    return blocks
}

private class Runs {
    val inlines = mutableListOf<Inline>()

    fun text(text: String, bold: Boolean, italic: Boolean, code: Boolean, target: Target?) {
        if (text.isEmpty()) return
        val last = inlines.lastOrNull()
        if (last is Inline.Run && last.bold == bold && last.italic == italic && last.code == code && last.target == target) {
            inlines[inlines.lastIndex] = last.copy(text = last.text + text)
        } else {
            inlines += Inline.Run(text, bold, italic, code, target)
        }
    }
}

private fun inlinesOf(text: String, reference: (String) -> Reference?): List<Inline> =
    Runs().also { scan(text, false, false, null, reference, it) }.inlines

private fun scan(
    text: String,
    bold: Boolean,
    italic: Boolean,
    target: Target?,
    reference: (String) -> Reference?,
    out: Runs,
) {
    var at = 0
    fun literal(piece: String) = out.text(piece, bold, italic, false, target)
    fun before() = if (at > 0) text[at - 1] else ' '
    while (at < text.length) {
        val char = text[at]
        val rest = text.substring(at)
        when {
            char == '\\' && at + 1 < text.length && !text[at + 1].isLetterOrDigit() && !text[at + 1].isWhitespace() -> {
                literal(text[at + 1].toString())
                at += 2
            }
            char == '`' && text.indexOf('`', at + 1) > at + 1 -> {
                val end = text.indexOf('`', at + 1)
                out.text(text.substring(at + 1, end), bold, italic, true, target)
                at = end + 1
            }
            rest.startsWith("![") && imageAt(rest) != null -> {
                val (picture, length) = imageAt(rest)!!
                out.inlines += picture
                at += length
            }
            rest.startsWith("[[") && rest.indexOf("]]") > 2 && !rest.substring(2, rest.indexOf("]]")).contains(Regex("[\\[\\]\\n]")) -> {
                val end = rest.indexOf("]]")
                val inner = rest.substring(2, end)
                val (name, said) = inner.split("|", limit = 2).let { it[0] to it.getOrNull(1) }
                val slug = name.substringBefore('#').trim()
                val known = reference(slug)
                if (known == null) literal(said ?: slug) else out.text(said ?: known.title, bold, italic, false, Target.Entry(known.id))
                at += end + 2
            }
            char == '[' && linkAt(rest) != null -> {
                val (label, url, length) = linkAt(rest)!!
                val web = if (SCHEMES.any { url.startsWith(it) }) Target.Web(url) else null
                scan(label, bold, italic, web ?: target, reference, out)
                at += length
            }
            (rest.startsWith("**") || rest.startsWith("__")) && opens(text, at, 2) -> {
                val end = closing(text, char.toString().repeat(2), at + 2)
                if (end < 0) {
                    literal(rest.take(2))
                    at += 2
                } else {
                    scan(text.substring(at + 2, end), true, italic, target, reference, out)
                    at = end + 2
                }
            }
            (char == '*' || char == '_') && opens(text, at, 1) && closing(text, char.toString(), at + 1) >= 0 -> {
                val end = closing(text, char.toString(), at + 1)
                scan(text.substring(at + 1, end), bold, true, target, reference, out)
                at = end + 1
            }
            target == null && !before().isLetterOrDigit() && (rest.startsWith("http://") || rest.startsWith("https://")) -> {
                val url = Regex("^https?://[^\\s<>\\]\\)]+").find(rest)!!.value.trimEnd('.', ',', ';', ':', '!', '?', '\'', '"')
                out.text(url, bold, italic, false, Target.Web(url))
                at += url.length
            }
            else -> {
                literal(char.toString())
                at++
            }
        }
    }
}

/** Whether the emphasis mark of [length] characters at [at] can open: text follows, and an underscore stands apart from a word. */
private fun opens(text: String, at: Int, length: Int): Boolean {
    val next = text.getOrNull(at + length)
    val previous = if (at > 0) text[at - 1] else ' '
    return next != null && !next.isWhitespace() && (text[at] == '*' || !previous.isLetterOrDigit())
}

/** Where the emphasis mark closes, after [from]: not after a space, nor inside a longer run of the mark; -1 for never. */
private fun closing(text: String, mark: String, from: Int): Int {
    var end = text.indexOf(mark, from)
    while (end >= 0) {
        val longer = mark.length == 1 && text.getOrNull(end + 1) == mark[0]
        val afterWord = mark[0] == '_' && text.getOrNull(end + mark.length)?.isLetterOrDigit() == true
        if (end > from && !text[end - 1].isWhitespace() && !longer && !afterWord) return end
        end = text.indexOf(mark, end + if (longer) 2 else 1)
    }
    return -1
}

/** `[label](url)` at the start of [rest]: the label, the address and the length of all of it. */
private fun linkAt(rest: String): Triple<String, String, Int>? {
    var depth = 0
    for ((index, char) in rest.withIndex()) {
        if (char == '[') depth++
        if (char == ']' && --depth == 0) {
            if (!rest.startsWith("](", index)) return null
            val end = rest.indexOf(')', index + 2)
            if (end < 0) return null
            val url = rest.substring(index + 2, end).trim().substringBefore(' ')
            return Triple(rest.substring(1, index), url, end + 1)
        }
    }
    return null
}

/** `![alt](url)` at the start of [rest], and the length of all of it. */
private fun imageAt(rest: String): Pair<Inline.Picture, Int>? =
    linkAt(rest.substring(1))?.let { (alt, url, length) -> Inline.Picture(alt, url) to length + 1 }
