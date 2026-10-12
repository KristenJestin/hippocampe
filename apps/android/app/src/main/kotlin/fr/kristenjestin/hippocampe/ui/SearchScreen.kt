package fr.kristenjestin.hippocampe.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.SearchResult
import fr.kristenjestin.hippocampe.read.marked
import fr.kristenjestin.hippocampe.ui.theme.LocalSignals
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.kristenjestin.hippocampe.api.SearchResults
import fr.kristenjestin.hippocampe.read.Kinds
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Reading
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

/** What is searched, as the owner types it, narrowed to a type; and what the server found. */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class SearchModel(private val reading: Reading, debounce: Long = 300) : ViewModel() {
    val query = MutableStateFlow("")

    /** The name of the type the search is narrowed to, if any. */
    val type = MutableStateFlow<String?>(null)
    private val attempt = MutableStateFlow(0)

    /** The types, to offer as filters and to name in the results; empty until they are known. */
    val kinds: StateFlow<Kinds> = attempt
        .map { (reading.types() as? Load.Ready)?.value.orEmpty().let(::Kinds) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Kinds(emptyList()))

    /** Nothing before something is searched for. */
    val results: StateFlow<Load<SearchResults>?> =
        combine(query.debounce(debounce).map { it.trim() }.distinctUntilChanged(), type, attempt) { query, type, _ -> query to type }
            .flatMapLatest { (query, type) ->
                if (query.isEmpty()) flowOf<Load<SearchResults>?>(null)
                else flow<Load<SearchResults>?> {
                    emit(Load.Loading)
                    emit(reading.search(query, type))
                }
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun retry() = attempt.update { it + 1 }
}

/**
 * The server's search as the owner types it, narrowed to a type by a chip; each result with its
 * title, its type, where it is and its excerpt, the words found marked. Opening a result gives its
 * slug to [open].
 */
@Composable
fun SearchScreen(model: SearchModel, open: (String) -> Unit, modifier: Modifier = Modifier) {
    var typed by rememberSaveable { mutableStateOf(model.query.value) }
    val type by model.type.collectAsStateWithLifecycle()
    val results by model.results.collectAsStateWithLifecycle()
    val kinds by model.kinds.collectAsStateWithLifecycle()

    Column(modifier) {
        OutlinedTextField(
            typed,
            {
                typed = it
                model.query.value = it
            },
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 8.dp),
            label = { Text(stringResource(R.string.search_label)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        )
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(
                    type == null,
                    { model.type.value = null },
                    { Text(stringResource(R.string.search_all_types)) },
                    Modifier.testTag("filter-all"),
                )
            }
            items(kinds.types, key = { it.name }) { definition ->
                FilterChip(
                    type == definition.name,
                    { model.type.value = definition.name },
                    { Text(definition.label) },
                    Modifier.testTag("filter-${definition.name}"),
                )
            }
        }
        when (val found = results) {
            null -> Text(
                stringResource(R.string.search_hint),
                Modifier.padding(16.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> Loaded(found, model::retry) { search ->
                if (search.results.isEmpty()) {
                    Text(stringResource(R.string.search_nothing, typed.trim()), Modifier.padding(16.dp))
                } else {
                    LazyColumn {
                        item {
                            Text(
                                pluralStringResource(R.plurals.search_found, search.total.toInt(), search.total.toInt()),
                                Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        items(search.results, key = { it.id }) { result ->
                            ResultCard(result, kinds.label(result.type)) { open(result.slug) }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}

/** An excerpt with the words found marked, the server's own marks taken out. */
@Composable
private fun excerptOf(excerpt: String): AnnotatedString {
    val (text, found) = marked(excerpt)
    val mark = SpanStyle(
        background = LocalSignals.current.warning.copy(alpha = 0.25f),
        color = MaterialTheme.colorScheme.onSurface,
    )
    return remember(excerpt, mark) {
        buildAnnotatedString {
            append(text)
            found.forEach { addStyle(mark, it.first, it.last + 1) }
        }
    }
}

@Composable
private fun ResultCard(result: SearchResult, type: String, open: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = open).padding(horizontal = 16.dp, vertical = 10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                result.title,
                Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(type, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
        }
        if (result.path.isNotEmpty()) {
            Text(
                result.path.joinToString(" › "),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        val excerpt = result.excerpt.ifEmpty { result.summary }
        if (excerpt.isNotEmpty()) {
            Text(excerptOf(excerpt), Modifier.padding(top = 2.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 4, overflow = TextOverflow.Ellipsis)
        }
    }
}
