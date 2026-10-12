package fr.kristenjestin.hippocampe.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.BriefingOccurrence
import fr.kristenjestin.hippocampe.home.Home
import fr.kristenjestin.hippocampe.home.Seen
import fr.kristenjestin.hippocampe.home.dueLine
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.momentInWords
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** What is coming and what waits, as the server says it, or as it last said it. */
class HomeModel(private val home: Home) : ViewModel() {
    private val loaded = MutableStateFlow<Load<Seen>>(Load.Loading)
    val state: StateFlow<Load<Seen>> = loaded

    /** Whether the owner pulled to refresh and the answer is awaited. */
    val refreshing = MutableStateFlow(false)

    init {
        load()
    }

    fun load() {
        loaded.value = Load.Loading
        viewModelScope.launch { loaded.value = home.read() }
    }

    /** Asks again without taking what is shown away. */
    fun refresh() {
        refreshing.value = true
        viewModelScope.launch {
            loaded.value = home.read()
            refreshing.value = false
        }
    }
}

/** A heads-up or a date of the week, as a row that opens its entry. */
@Composable
private fun Due(occurrence: BriefingOccurrence, open: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable { open(occurrence.entry.slug) }.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(occurrence.entry.title)
        Text(
            dueLine(LocalContext.current.resources, occurrence),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
    }
    HorizontalDivider()
}

@Composable
private fun Heading(text: String) =
    Text(text, Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp), style = MaterialTheme.typography.titleSmall)

/**
 * The heads-ups (each opens its entry), what is due this week, and how many items wait in the inbox
 * (which opens Sent). Pulled to refresh; when the server cannot be reached, what was read last, with
 * when and why.
 */
@Composable
fun HomeScreen(model: HomeModel, open: (String) -> Unit, openSent: () -> Unit, modifier: Modifier = Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    val refreshing by model.refreshing.collectAsStateWithLifecycle()
    Loaded(state, model::load, modifier) { seen ->
        val briefing = seen.briefing
        val headsUp = briefing.headsUp
        // A date inside its notice that also falls this week is shown once, as a heads-up.
        val week = briefing.upcoming.filter { upcoming -> headsUp.none { it.id == upcoming.id } }
        val waiting = briefing.waiting.inbox.count.toInt()
        PullToRefreshBox(refreshing, model::refresh, Modifier.fillMaxSize().testTag("home")) {
            LazyColumn(Modifier.fillMaxWidth()) {
                seen.problem?.let { problem ->
                    item {
                        Column(Modifier.padding(16.dp)) {
                            Text(problem, color = MaterialTheme.colorScheme.error)
                            Text(
                                stringResource(R.string.home_last_read, momentInWords(seen.readAt)),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
                if (headsUp.isNotEmpty()) {
                    item { Heading(stringResource(R.string.home_heads_up)) }
                    items(headsUp, key = { "heads-up/${it.id}" }) { Due(it, open) }
                }
                if (week.isNotEmpty()) {
                    item { Heading(stringResource(R.string.home_week)) }
                    items(week, key = { "week/${it.id}" }) { Due(it, open) }
                }
                if (waiting > 0) {
                    item {
                        Text(
                            pluralStringResource(R.plurals.home_inbox, waiting, waiting),
                            Modifier.fillMaxWidth().clickable(onClick = openSent).padding(16.dp),
                        )
                        HorizontalDivider()
                    }
                }
                if (headsUp.isEmpty() && week.isEmpty() && waiting == 0) {
                    item { Text(stringResource(R.string.home_nothing), Modifier.padding(16.dp)) }
                }
            }
        }
    }
}
