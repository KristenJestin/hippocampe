package fr.kristenjestin.hippocampe.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.kristenjestin.hippocampe.Graph
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.InboxSent
import fr.kristenjestin.hippocampe.outbox.Standing
import fr.kristenjestin.hippocampe.sent.Became
import fr.kristenjestin.hippocampe.sent.SentRow
import fr.kristenjestin.hippocampe.sent.follow
import fr.kristenjestin.hippocampe.sent.sentRows
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The items of the phone, and what the inbox last said of them. */
class SentModel(private val graph: Graph) : ViewModel() {
    private val followed = MutableStateFlow<List<InboxSent>>(emptyList())

    /** Why the inbox could not be asked, if it could not. */
    val unfollowed = MutableStateFlow<String?>(null)

    val rows = combine(graph.outbox.items, followed, ::sentRows)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun refresh() = viewModelScope.launch {
        val server = graph.settings.server() ?: return@launch
        when (val answer = follow(graph.api, server, graph.outbox.items.first())) {
            is Answer.Done -> {
                followed.value = answer.value
                unfollowed.value = null
            }
            is Answer.Refused -> unfollowed.value = answer.message
            is Answer.Failed -> unfollowed.value = answer.message
        }
    }

    fun cancel(clientId: String) = viewModelScope.launch { graph.outbox.cancel(clientId) }
}

/** What was sent from this phone, newest first, and what each became. */
@Composable
fun SentScreen(graph: Graph, modifier: Modifier = Modifier) {
    val model = viewModel { SentModel(graph) }
    val rows by model.rows.collectAsStateWithLifecycle()
    val unfollowed by model.unfollowed.collectAsStateWithLifecycle()
    val sent = rows.count { it.item.standing == Standing.Sent }
    LaunchedEffect(sent) { model.refresh() }

    if (rows.isEmpty()) {
        Text(stringResource(R.string.sent_empty), modifier.padding(24.dp))
        return
    }
    LazyColumn(modifier, contentPadding = PaddingValues(vertical = 8.dp)) {
        unfollowed?.let { reason ->
            item {
                Text(
                    stringResource(R.string.sent_unfollowed, reason),
                    Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        items(rows, key = { it.item.clientId }) { row ->
            SentLine(row) { model.cancel(row.item.clientId) }
            HorizontalDivider()
        }
    }
}

@Composable
private fun SentLine(row: SentRow, cancel: () -> Unit) {
    val item = row.item
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(
                item.text ?: item.url ?: item.name.orEmpty(),
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            item.note?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                became(row.became),
                style = MaterialTheme.typography.bodyMedium,
                color = when (row.became) {
                    is Became.Held, is Became.Refused -> MaterialTheme.colorScheme.error
                    is Became.Processed -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        when (row.became) {
            Became.Waiting, is Became.Held -> RemoveButton(stringResource(R.string.sent_cancel), cancel)
            is Became.Refused -> RemoveButton(stringResource(R.string.sent_remove), cancel)
            else -> {}
        }
    }
}

@Composable
private fun became(became: Became) = when (became) {
    Became.Waiting -> stringResource(R.string.sent_waiting)
    Became.InInbox -> stringResource(R.string.sent_in_inbox)
    is Became.Held -> stringResource(R.string.sent_held, became.sentence)
    is Became.Refused -> stringResource(R.string.sent_refused, became.sentence)
    is Became.Processed ->
        if (became.titles.isEmpty()) stringResource(R.string.sent_processed_none)
        else stringResource(R.string.sent_processed, became.titles.joinToString(", "))
    is Became.Dismissed ->
        became.reason?.let { stringResource(R.string.sent_dismissed, it) } ?: stringResource(R.string.sent_dismissed_no_reason)
}
