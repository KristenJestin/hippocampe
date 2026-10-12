package fr.kristenjestin.hippocampe.read

/** An excerpt as the server marks it: its text, and where the words found stand in it. */
data class Marked(val text: String, val found: List<IntRange>)

private const val OPEN = "<mark>"
private const val CLOSE = "</mark>"

/** The text of an excerpt with the server's `<mark>` tags taken out, and the ranges they held. */
fun marked(excerpt: String): Marked {
    val text = StringBuilder()
    val found = mutableListOf<IntRange>()
    var rest = 0
    while (true) {
        val start = excerpt.indexOf(OPEN, rest)
        if (start < 0) break
        text.append(excerpt, rest, start)
        val from = text.length
        val inner = start + OPEN.length
        val end = excerpt.indexOf(CLOSE, inner).takeIf { it >= 0 } ?: excerpt.length
        text.append(excerpt, inner, end)
        found += from until text.length
        rest = minOf(end + CLOSE.length, excerpt.length)
    }
    text.append(excerpt, rest, excerpt.length)
    return Marked(text.toString(), found)
}
