package fr.kristenjestin.hippocampe.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.Child
import fr.kristenjestin.hippocampe.api.EntryProvenanceValue
import fr.kristenjestin.hippocampe.api.FieldDefinitionKind
import fr.kristenjestin.hippocampe.api.Link
import fr.kristenjestin.hippocampe.api.LinkProvenance
import fr.kristenjestin.hippocampe.api.Medium
import fr.kristenjestin.hippocampe.read.Reference
import fr.kristenjestin.hippocampe.read.dateInWords
import fr.kristenjestin.hippocampe.read.labelOf
import fr.kristenjestin.hippocampe.read.parseMarkdown
import fr.kristenjestin.hippocampe.ui.theme.LocalSignals
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.kristenjestin.hippocampe.api.EntryRead
import fr.kristenjestin.hippocampe.api.HistoryEvent
import fr.kristenjestin.hippocampe.read.Kinds
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Reading
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

/** An entry as read, with the types that name its kind and its fields. */
data class Opened(val read: EntryRead, val kinds: Kinds)

/** The history of an entry, asked for on demand, a page at a time, newest first. */
data class History(
    val asked: Boolean = false,
    val events: List<HistoryEvent> = emptyList(),
    val next: String? = null,
    val loading: Boolean = false,
    val problem: String? = null,
)

/** One entry, read by its slug or id, and its history when it is asked for. */
class EntryModel(private val reading: Reading, val entry: String) : ViewModel() {
    private val opened = MutableStateFlow<Load<Opened>>(Load.Loading)
    val state: StateFlow<Load<Opened>> = opened
    private val past = MutableStateFlow(History())
    val history: StateFlow<History> = past

    init {
        load()
    }

    fun load() {
        opened.value = Load.Loading
        viewModelScope.launch {
            opened.value = coroutineScope {
                val read = async { reading.entry(entry) }
                val types = async { reading.types() }
                when (val read = read.await()) {
                    is Load.Ready -> Load.Ready(Opened(read.value, Kinds((types.await() as? Load.Ready)?.value.orEmpty())))
                    is Load.Failed -> read
                    Load.Loading -> Load.Loading
                }
            }
        }
    }

    /** The first page of the history, or the next one. */
    fun showHistory() {
        val now = past.value
        if (now.loading) return
        past.value = now.copy(asked = true, loading = true, problem = null)
        viewModelScope.launch {
            past.value = when (val page = reading.history(entry, now.next)) {
                is Load.Ready -> History(true, now.events + page.value.events, page.value.nextCursor)
                is Load.Failed -> now.copy(asked = true, problem = page.sentence)
                Load.Loading -> now
            }
        }
    }

    suspend fun image(path: String) = reading.image(path)

    suspend fun download(path: String, file: File) = reading.download(path, file)
}

/** What the server shows in place of a value the key may not see. */
private const val HIDDEN = "[hidden]"

/** How many changes of one event the history shows. */
private const val CHANGES = 3

/**
 * One entry, read: where it sits, what it is, its fields, its body, what it contains, what it is
 * tied to, its media and, when asked for, its history. What is only supposed is marked as such,
 * apart from what is known. Whatever opens another entry gives its slug or id to [open].
 */
@Composable
fun EntryScreen(model: EntryModel, open: (String) -> Unit, modifier: Modifier = Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    Loaded(state, model::load, modifier) { opened ->
        EntryPage(model, opened, open)
    }
}

/** The mark of what an entry says under [name] (a field, `body`, `summary`) when it is not known: whether sources disagree. */
private fun Opened.mark(name: String): Boolean? = when (read.entry.provenance[name]) {
    EntryProvenanceValue.Inferred -> false
    EntryProvenanceValue.Ambiguous -> true
    else -> null
}

private fun Link.mark(): Boolean? = when (provenance) {
    LinkProvenance.Inferred -> false
    LinkProvenance.Ambiguous -> true
    else -> null
}

@Composable
private fun EntryPage(model: EntryModel, opened: Opened, open: (String) -> Unit) {
    val read = opened.read
    val entry = read.entry
    val definition = opened.kinds.definition(entry.type)
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
        if (read.ancestors.isNotEmpty()) Crumbs(read.ancestors.map { it.id to it.title }, open)
        Text(entry.title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 4.dp))
        if (entry.summary.isNotEmpty()) {
            Text(entry.summary, Modifier.padding(top = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            opened.mark("summary")?.let { SupposedMark(it, Modifier.padding(top = 4.dp)) }
        }
        entry.archivedAt?.let { at ->
            Text(
                entry.archivedReason?.let { stringResource(R.string.entry_archived_reason, dateInWords(at), it) }
                    ?: stringResource(R.string.entry_archived, dateInWords(at)),
                Modifier.padding(top = 8.dp),
                color = MaterialTheme.colorScheme.error,
            )
        }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(opened.kinds.label(entry.type))
            entry.tags.forEach { Chip(it) }
        }

        val names = (definition?.fields.orEmpty().map { it.name }.filter { it in entry.fields } + entry.fields.keys).distinct()
        if (names.isNotEmpty()) {
            Section(R.string.entry_fields)
            names.forEach { name ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp).testTag("field-$name"), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(labelOf(name), Modifier.width(112.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f)) {
                        Value(entry.fields.getValue(name), definition?.fields?.firstOrNull { it.name == name }?.kind, read.titles, open)
                    }
                    opened.mark(name)?.let { SupposedMark(it) }
                }
            }
        }

        if (entry.body.isNotEmpty()) {
            Column(Modifier.padding(top = 16.dp).testTag("body")) {
                opened.mark("body")?.let { SupposedMark(it, Modifier.padding(bottom = 4.dp)) }
                val blocks = remember(entry.body, read.references) {
                    parseMarkdown(entry.body) { reference ->
                        read.references.firstOrNull { it.reference == reference }?.let { known ->
                            val id = known.id
                            val title = known.title
                            if (id != null && title != null) Reference(id, title) else null
                        }
                    }
                }
                MarkdownView(blocks, read.media, open, model::image)
            }
        }

        Children(read.children, read.hiddenChildren.toInt(), opened, open)

        if (read.dated.isNotEmpty()) {
            Section(R.string.entry_dated)
            read.dated.forEach { part ->
                Row(
                    Modifier.fillMaxWidth().clickable { open(part.slug) }.padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(dateInWords(part.date), Modifier.width(112.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(part.title, Modifier.weight(1f))
                }
            }
            if (read.moreDated > 0) {
                Text(
                    pluralStringResource(R.plurals.entry_more_dated, read.moreDated.toInt(), read.moreDated.toInt()),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        Links(R.string.entry_links, read.links, open)
        Links(R.string.entry_linked_from, read.backlinks, open)
        if (read.citedBy.isNotEmpty()) {
            Section(R.string.entry_cited_by)
            read.citedBy.forEach { cited ->
                Text(cited.title, Modifier.fillMaxWidth().clickable { open(cited.slug) }.padding(vertical = 8.dp))
            }
        }

        if (read.media.isNotEmpty()) Media(model, read.media)
        History(model)
        Text(
            stringResource(R.string.entry_edited_on, dateInWords(entry.updated)),
            Modifier.padding(top = 24.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun Section(title: Int, count: Int? = null) {
    HorizontalDivider(Modifier.padding(top = 24.dp))
    Text(
        stringResource(title) + (count?.let { " ($it)" } ?: ""),
        Modifier.padding(top = 12.dp, bottom = 4.dp),
        style = MaterialTheme.typography.titleMedium,
    )
}

@Composable
private fun Chip(label: String) {
    Text(
        label,
        Modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp),
        style = MaterialTheme.typography.labelMedium,
    )
}

/** Where the entry sits: each step opens (a step the key may not see stays still). */
@Composable
private fun Crumbs(steps: List<Pair<String?, String>>, open: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        steps.forEachIndexed { index, (id, title) ->
            if (index > 0) Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                title,
                if (id == null) Modifier else Modifier.clickable { open(id) },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** A value as its kind reads best: a hidden one as hidden, a date in words, an entry that opens, a list in its order. */
@Composable
private fun Value(value: JsonElement, kind: FieldDefinitionKind?, titles: Map<String, String>, open: (String) -> Unit) {
    when {
        value is JsonArray -> Column { value.forEach { Value(it, kind, titles, open) } }
        value is JsonPrimitive && value.isString && value.content == HIDDEN -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("••••••", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.entry_hidden), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        value is JsonPrimitive -> {
            val text = value.takeIf { !it.isString }?.booleanOrNull?.let { stringResource(if (it) R.string.entry_yes else R.string.entry_no) } ?: value.content
            val uri = LocalUriHandler.current
            val link = MaterialTheme.colorScheme.primary
            when (kind) {
                FieldDefinitionKind.Date, FieldDefinitionKind.Datetime -> Text(dateInWords(text))
                FieldDefinitionKind.Enum -> Text(
                    text,
                    Modifier.background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp),
                    color = link,
                    style = MaterialTheme.typography.labelLarge,
                )
                FieldDefinitionKind.Url -> Text(
                    text.removePrefix("https://").removePrefix("http://"),
                    Modifier.clickable { uri.openUri(text) },
                    color = link,
                    textDecoration = TextDecoration.Underline,
                )
                FieldDefinitionKind.Entry -> Text(
                    titles[text] ?: text,
                    Modifier.clickable { open(text) },
                    color = link,
                    textDecoration = TextDecoration.Underline,
                )
                else -> Text(text)
            }
        }
        value is JsonNull -> Text("—")
        value is JsonObject -> Text(value.toString())
    }
}

/** What is filed under the entry: its parts with their fields, the other entries, and the ones the key may not see. */
@Composable
private fun Children(children: List<Child>, hidden: Int, opened: Opened, open: (String) -> Unit) {
    if (children.isEmpty() && hidden == 0) return
    Section(R.string.entry_contains, children.size + hidden)
    children.forEach { child ->
        Column(Modifier.fillMaxWidth().clickable { open(child.slug) }.padding(vertical = 8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(child.title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                if (!child.inParent) Text(opened.kinds.label(child.type), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
            }
            if (child.summary.isNotEmpty()) Text(child.summary, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            val definition = opened.kinds.definition(child.type)
            child.fields?.forEach { (name, value) ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(labelOf(name), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    Column { Value(value, definition?.fields?.firstOrNull { it.name == name }?.kind, child.titles.orEmpty(), open) }
                }
            }
        }
    }
    if (hidden > 0) {
        Text(pluralStringResource(R.plurals.entry_hidden_entries, hidden, hidden), Modifier.padding(top = 8.dp))
        Text(stringResource(R.string.entry_hidden_detail), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

/** What a link says of itself: its note, then the dates it held between. */
@Composable
private fun detail(link: Link): String? {
    val dates = when {
        link.validFrom != null && link.validUntil != null ->
            stringResource(R.string.entry_between, dateInWords(link.validFrom), dateInWords(link.validUntil))
        link.validFrom != null -> stringResource(R.string.entry_since, dateInWords(link.validFrom))
        link.validUntil != null -> stringResource(R.string.entry_until, dateInWords(link.validUntil))
        else -> null
    }
    return listOfNotNull(link.note, dates).joinToString(" · ").ifEmpty { null }
}

@Composable
private fun Links(title: Int, links: List<Link>, open: (String) -> Unit) {
    if (links.isEmpty()) return
    Section(title, links.size)
    links.sortedWith(compareBy({ it.relation }, { it.title })).forEach { link ->
        Column(Modifier.fillMaxWidth().clickable { open(link.slug) }.padding(vertical = 8.dp).testTag("link-${link.slug}")) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(labelOf(link.relation) + (link.period?.let { " · $it" } ?: ""), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                link.mark()?.let { SupposedMark(it) }
            }
            Text(link.title, style = MaterialTheme.typography.titleSmall)
            detail(link)?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** The files of the entry: an image is shown, any other file is opened by the phone when tapped. */
@Composable
private fun Media(model: EntryModel, media: List<Medium>) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var notice by remember { mutableStateOf<Pair<Int, String?>?>(null) }
    fun openFile(medium: Medium) = scope.launch {
        notice = null
        val folder = java.io.File(context.cacheDir, "media").apply { mkdirs() }
        val file = java.io.File(folder, "${medium.sha256}.${MimeTypeMap.getSingleton().getExtensionFromMimeType(medium.mime) ?: "bin"}")
        if (!file.exists()) {
            val part = java.io.File(folder, file.name + ".part")
            when (val got = model.download(medium.url, part)) {
                is fr.kristenjestin.hippocampe.read.Load.Ready -> part.renameTo(file)
                is fr.kristenjestin.hippocampe.read.Load.Failed -> {
                    part.delete()
                    notice = R.string.entry_file_failed to got.sentence
                    return@launch
                }
                fr.kristenjestin.hippocampe.read.Load.Loading -> return@launch
            }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, medium.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        } catch (failure: ActivityNotFoundException) {
            notice = R.string.entry_no_viewer to null
        }
    }

    Section(R.string.entry_media, media.size)
    media.forEach { medium ->
        if (medium.kind == "image") {
            Column(Modifier.padding(vertical = 6.dp)) {
                Picture(medium.url, medium.alt, model::image)
                if (medium.alt.isNotEmpty()) Text(medium.alt, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }
        } else {
            Column(Modifier.fillMaxWidth().clickable { openFile(medium) }.padding(vertical = 8.dp)) {
                Text(medium.alt.ifEmpty { stringResource(R.string.entry_no_description) })
                Text(
                    medium.mime.substringAfterLast('/').uppercase() + " · " + stringResource(R.string.entry_size_kb, (medium.size + 500) / 1000),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
    notice?.let { (words, sentence) ->
        Text(
            if (sentence == null) stringResource(words) else stringResource(words, sentence),
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun History(model: EntryModel) {
    val history by model.history.collectAsStateWithLifecycle()
    Section(R.string.entry_history)
    history.events.forEach { event ->
        Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
            Text(actionWords(event.action), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.entry_by_on, event.actor, dateInWords(event.at)),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            event.changes.take(CHANGES).forEach { change ->
                Text(
                    stringResource(R.string.entry_change, labelOf(change.field), changed(change.before), changed(change.after)),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (event.changes.size > CHANGES) {
                Text(
                    pluralStringResource(R.plurals.entry_more_changes, event.changes.size - CHANGES, event.changes.size - CHANGES),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
    when {
        history.loading -> CircularProgressIndicator(Modifier.padding(8.dp))
        history.problem != null -> {
            Text(history.problem.orEmpty(), color = MaterialTheme.colorScheme.error)
            TextButton(model::showHistory) { Text(stringResource(R.string.read_retry)) }
        }
        !history.asked -> TextButton(model::showHistory) { Text(stringResource(R.string.entry_show_history)) }
        history.next != null -> TextButton(model::showHistory) { Text(stringResource(R.string.entry_older)) }
    }
}

/** A value of an event in a few words, on one line: text as it is, a long text by its excerpt, nothing as a dash. */
private fun changed(value: JsonElement): String {
    val text = when (value) {
        is JsonNull -> "—"
        is JsonPrimitive -> value.content
        is JsonObject -> (value["excerpt"] as? JsonPrimitive)?.content ?: value.toString()
        else -> value.toString()
    }
    return text.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
}

/** What a write did, as the history names it. */
@Composable
private fun actionWords(action: String) = when (action) {
    "create" -> stringResource(R.string.entry_action_create)
    "update" -> stringResource(R.string.entry_action_update)
    "rewrite" -> stringResource(R.string.entry_action_rewrite)
    "archive" -> stringResource(R.string.entry_action_archive)
    "link" -> stringResource(R.string.entry_action_link)
    "unlink" -> stringResource(R.string.entry_action_unlink)
    "attach" -> stringResource(R.string.entry_action_attach)
    "describe" -> stringResource(R.string.entry_action_describe)
    else -> action.replace('_', ' ')
}
