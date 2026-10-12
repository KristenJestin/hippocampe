package fr.kristenjestin.hippocampe.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import fr.kristenjestin.hippocampe.api.Medium
import fr.kristenjestin.hippocampe.read.Block
import fr.kristenjestin.hippocampe.read.Inline
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Target

/**
 * A body read from Markdown ([fr.kristenjestin.hippocampe.read.parseMarkdown]): a link opens the
 * page it names in the phone's browser, a reference opens its entry through [openEntry], an image
 * of the entry is fetched with the key by [fetch].
 */
@Composable
fun MarkdownView(
    blocks: List<Block>,
    media: List<Medium>,
    openEntry: (String) -> Unit,
    fetch: suspend (String) -> Load<ByteArray>,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        blocks.forEach { block ->
            when (block) {
                is Block.Heading -> Text(
                    annotated(block.inlines, openEntry),
                    Modifier.padding(top = 16.dp, bottom = 4.dp),
                    style = when (block.level) {
                        1 -> MaterialTheme.typography.headlineSmall
                        2 -> MaterialTheme.typography.titleLarge
                        3 -> MaterialTheme.typography.titleMedium
                        else -> MaterialTheme.typography.titleSmall
                    },
                )
                is Block.Paragraph -> Inlines(block.inlines, media, openEntry, fetch, Modifier.padding(vertical = 4.dp))
                is Block.Item -> Row(Modifier.padding(start = (16 * block.depth).dp, top = 2.dp, bottom = 2.dp)) {
                    Text(block.marker, Modifier.width(24.dp))
                    Inlines(block.inlines, media, openEntry, fetch)
                }
                is Block.Quote -> Row(Modifier.height(IntrinsicSize.Min).padding(vertical = 4.dp)) {
                    Box(Modifier.width(3.dp).fillMaxHeight().background(MaterialTheme.colorScheme.outline))
                    Inlines(block.inlines, media, openEntry, fetch, Modifier.padding(start = 12.dp))
                }
                is Block.Code -> Box(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .horizontalScroll(rememberScrollState())
                        .padding(8.dp),
                ) {
                    Text(block.text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                }
                Block.Rule -> HorizontalDivider(Modifier.padding(vertical = 8.dp))
            }
        }
    }
}

/** A line of runs, with an image of the entry between two of them where it stands. */
@Composable
private fun Inlines(
    inlines: List<Inline>,
    media: List<Medium>,
    openEntry: (String) -> Unit,
    fetch: suspend (String) -> Load<ByteArray>,
    modifier: Modifier = Modifier,
) {
    Column(modifier) {
        var run = mutableListOf<Inline>()
        @Composable
        fun text() {
            if (run.isNotEmpty()) Text(annotated(run, openEntry), style = MaterialTheme.typography.bodyLarge)
            run = mutableListOf()
        }
        inlines.forEach { inline ->
            when (inline) {
                is Inline.Run -> run += inline
                is Inline.Picture -> {
                    text()
                    val medium = media.firstOrNull { inline.url == it.url || inline.url.endsWith(it.url) || inline.url.trimEnd('/').substringAfterLast('/') == it.sha256 }
                    if (medium != null) {
                        Picture(medium.url, inline.alt.ifEmpty { medium.alt }, fetch, Modifier.padding(vertical = 4.dp))
                    } else {
                        // An image of the web is not fetched on its own: it is offered as a link.
                        val web = inline.url.takeIf { it.startsWith("http://") || it.startsWith("https://") }
                        run += Inline.Run(inline.alt.ifEmpty { inline.url }, target = web?.let { Target.Web(it) })
                        text()
                    }
                }
            }
        }
        text()
    }
}

@Composable
private fun annotated(inlines: List<Inline>, openEntry: (String) -> Unit): AnnotatedString {
    val link = SpanStyle(color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)
    val code = SpanStyle(fontFamily = FontFamily.Monospace, background = MaterialTheme.colorScheme.surfaceVariant)
    return buildAnnotatedString {
        inlines.filterIsInstance<Inline.Run>().forEach { run ->
            val style = SpanStyle(
                fontWeight = if (run.bold) FontWeight.Bold else null,
                fontStyle = if (run.italic) FontStyle.Italic else null,
            ).merge(if (run.code) code else SpanStyle())
            fun text() = withStyle(style) { append(run.text) }
            when (val target = run.target) {
                null -> text()
                is Target.Web -> withLink(LinkAnnotation.Url(target.url, TextLinkStyles(link))) { text() }
                is Target.Entry -> withLink(LinkAnnotation.Clickable(target.id, TextLinkStyles(link)) { openEntry(target.id) }) { text() }
            }
        }
    }
}
