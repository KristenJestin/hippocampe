package fr.kristenjestin.hippocampe.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.AboutInstance
import fr.kristenjestin.hippocampe.settings.Instance
import fr.kristenjestin.hippocampe.settings.Settings
import fr.kristenjestin.hippocampe.settings.SettingsStore
import fr.kristenjestin.hippocampe.ui.theme.LocalSignals
import kotlinx.coroutines.flow.map

/** The instance and its label, as every screen that sends shows them. */
@Composable
fun instanceName(instance: Instance): String {
    val name = stringResource(
        when (instance.name) {
            AboutInstance.Production -> R.string.instance_production
            AboutInstance.Development -> R.string.instance_development
            AboutInstance.Local -> R.string.instance_local
        },
    )
    return instance.label?.let { stringResource(R.string.instance_with_label, name, it) } ?: name
}

/** The instance, in the colour of production or in the colour that warns for the others. */
@Composable
fun InstanceBadge(instance: Instance, modifier: Modifier = Modifier) {
    Text(
        instanceName(instance),
        modifier = modifier,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (instance.name == AboutInstance.Production) MaterialTheme.colorScheme.primary
        else LocalSignals.current.warning,
    )
}

/** The settings once loaded: absent until DataStore has answered, then with or without a server. */
class Loaded(val settings: Settings?)

fun SettingsStore.loaded() = settings.map(::Loaded)
