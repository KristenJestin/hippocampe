package fr.kristenjestin.hippocampe.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.graph
import fr.kristenjestin.hippocampe.outbox.Draft
import fr.kristenjestin.hippocampe.outbox.Outbox
import fr.kristenjestin.hippocampe.outbox.shared
import fr.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What was shared, copied once, kept across a rotation; null while it is being copied. */
class ShareModel : ViewModel() {
    val drafts = MutableStateFlow<List<Draft>?>(null)
    private var sent = false

    fun read(outbox: Outbox, intent: Intent, activity: ComponentActivity) {
        if (drafts.value != null) return
        viewModelScope.launch {
            drafts.value = withContext(Dispatchers.IO) { outbox.shared(intent, activity.contentResolver) }
        }
    }

    fun send(outbox: Outbox, note: String, done: () -> Unit) {
        val given = drafts.value ?: return
        sent = true
        viewModelScope.launch {
            outbox.add(given, note)
            done()
        }
    }

    /** Forgets the copies of what was shared and not sent. */
    fun discard(outbox: Outbox) {
        if (!sent) drafts.value?.let(outbox::discard)
    }
}

/**
 * The share target: a sheet over the application the share came from, with what is shared and an
 * optional note; once sent, back to that application at once, with a short confirmation.
 */
class ShareActivity : ComponentActivity() {
    private val model: ShareModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val outbox = graph.outbox
        model.read(outbox, intent, this)
        setContent {
            HippocampeTheme {
                val loaded by remember { graph.settings.loaded() }.collectAsStateWithLifecycle(initialValue = null)
                val drafts by model.drafts.collectAsStateWithLifecycle()
                ShareSheet(
                    loaded,
                    drafts,
                    send = { note, sentTo ->
                        model.send(outbox, note) {
                            Toast.makeText(this, getString(R.string.kept, sentTo), Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    },
                    open = {
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    },
                    close = ::finish,
                )
            }
        }
    }

    override fun onDestroy() {
        if (isFinishing) model.discard(graph.outbox)
        super.onDestroy()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareSheet(
    loaded: Loaded?,
    drafts: List<Draft>?,
    send: (note: String, sentTo: String) -> Unit,
    open: () -> Unit,
    close: () -> Unit,
) {
    var note by rememberSaveable { mutableStateOf("") }
    ModalBottomSheet(onDismissRequest = close) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 16.dp).navigationBarsPadding().imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loaded == null) return@Column
            val settings = loaded.settings
            if (settings == null) {
                Text(stringResource(R.string.share_unset))
                Button(open) { Text(stringResource(R.string.share_open)) }
                return@Column
            }
            InstanceBadge(settings.instance)
            when {
                drafts == null -> Text(stringResource(R.string.share_preparing))
                drafts.isEmpty() -> Text(stringResource(R.string.share_nothing))
                drafts.size > 3 -> Text(pluralStringResource(R.plurals.share_files, drafts.size, drafts.size))
                else -> drafts.forEach { DraftLine(it) }
            }
            OutlinedTextField(
                note,
                { note = it },
                Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.add_note)) },
                singleLine = true,
            )
            val sentTo = instanceName(settings.instance)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, androidx.compose.ui.Alignment.End)) {
                TextButton(close) { Text(stringResource(R.string.share_cancel)) }
                Button({ send(note, sentTo) }, enabled = !drafts.isNullOrEmpty()) {
                    Text(stringResource(R.string.share_send))
                }
            }
        }
    }
}
