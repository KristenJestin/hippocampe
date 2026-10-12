package fr.kristenjestin.hippocampe.ui

import android.Manifest
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.kristenjestin.hippocampe.Graph
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.outbox.SendWorker
import fr.kristenjestin.hippocampe.settings.Settings
import fr.kristenjestin.hippocampe.settings.SettingsCheck
import fr.kristenjestin.hippocampe.warn.Notifier
import fr.kristenjestin.hippocampe.warn.permissionMustBeAsked
import kotlinx.coroutines.launch

/**
 * The server's address and its key, checked against the server before they are saved. A saved key
 * is never shown: the field stays empty, and left empty it keeps the saved one.
 */
@Composable
fun SettingsScreen(graph: Graph, saved: Settings?, modifier: Modifier = Modifier) {
    var address by rememberSaveable { mutableStateOf(saved?.address.orEmpty()) }
    var key by remember { mutableStateOf("") }
    var checking by remember { mutableStateOf(false) }
    var wrong by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier.verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.settings_title), style = MaterialTheme.typography.headlineSmall)
        Text(
            stringResource(R.string.settings_intro),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            address,
            { address = it },
            Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.settings_address)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        OutlinedTextField(
            key,
            { key = it },
            Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.settings_key)) },
            placeholder = saved?.let { { Text(stringResource(R.string.settings_key_saved)) } },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        Button(
            onClick = {
                checking = true
                wrong = null
                scope.launch {
                    val given = key.ifBlank { graph.settings.server()?.key.orEmpty() }
                    when (val result = graph.check.check(address, given)) {
                        is SettingsCheck.Result.Right -> {
                            graph.settings.save(result.server, result.about)
                            key = ""
                            SendWorker.schedule(graph.work)
                        }
                        is SettingsCheck.Result.Wrong -> wrong = result.sentence
                    }
                    checking = false
                }
            },
            enabled = !checking,
        ) { Text(stringResource(R.string.settings_save)) }
        if (checking) Text(stringResource(R.string.settings_checking))
        wrong?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (saved != null && wrong == null && !checking) {
            Text(stringResource(R.string.settings_saved), style = MaterialTheme.typography.bodyMedium)
            InstanceBadge(saved.instance)
            val context = LocalContext.current
            val on by graph.warnings.on.collectAsStateWithLifecycle(false)
            var notAllowed by remember { mutableStateOf(false) }
            val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                if (granted) scope.launch { graph.warnings.turn(true) } else notAllowed = true
            }
            WarningsSetting(on, notAllowed) { want ->
                notAllowed = false
                when {
                    !want -> scope.launch { graph.warnings.turn(false) }
                    permissionMustBeAsked(Build.VERSION.SDK_INT, Notifier.permitted(context)) -> ask.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else -> scope.launch { graph.warnings.turn(true) }
                }
            }
        }
    }
}

/** Whether the phone warns before a due date; [notAllowed] says the phone refused the permission to notify. */
@Composable
fun WarningsSetting(on: Boolean, notAllowed: Boolean, modifier: Modifier = Modifier, turn: (Boolean) -> Unit) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.warn_title), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            Switch(on, turn)
        }
        Text(
            stringResource(R.string.warn_about),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (notAllowed) Text(stringResource(R.string.warn_refused), color = MaterialTheme.colorScheme.error)
    }
}
