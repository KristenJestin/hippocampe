package io.github.kristenjestin.hippocampe.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import io.github.kristenjestin.hippocampe.Graph
import io.github.kristenjestin.hippocampe.R
import io.github.kristenjestin.hippocampe.graph
import io.github.kristenjestin.hippocampe.settings.Settings
import io.github.kristenjestin.hippocampe.ui.theme.HippocampeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { HippocampeTheme { Hippocampe(graph) } }
    }
}

/**
 * The destinations of the bottom bar. Reading (search, an entry, browsing) and the home screen take
 * their place here when they come.
 */
private enum class Destination(val route: String, val label: Int, val icon: Int) {
    Add("add", R.string.nav_add, R.drawable.ic_add),
    Sent("sent", R.string.nav_sent, R.drawable.ic_sent),
}

private const val SETTINGS = "settings"

@Composable
private fun Hippocampe(graph: Graph) {
    val flow = remember { graph.settings.loaded() }
    val loaded by flow.collectAsStateWithLifecycle(initialValue = null)
    Surface(Modifier.fillMaxSize()) {
        val settings = loaded?.let { it.settings } ?: run {
            // The first start: nothing can be sent before the phone knows its server.
            if (loaded != null) SettingsScreen(graph, null, Modifier.fillMaxSize().safeDrawingPadding())
            return@Surface
        }
        Main(graph, settings)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Main(graph: Graph, settings: Settings) {
    val navigation = rememberNavController()
    val entry by navigation.currentBackStackEntryAsState()
    val context = LocalContext.current
    val kept = stringResource(R.string.kept, instanceName(settings.instance))
    fun go(route: String) = navigation.navigate(route) {
        popUpTo(navigation.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { InstanceBadge(settings.instance) },
                actions = {
                    IconButton({ go(SETTINGS) }) {
                        Icon(painterResource(R.drawable.ic_settings), stringResource(R.string.nav_settings))
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Destination.entries.forEach { destination ->
                    NavigationBarItem(
                        selected = entry?.destination?.route == destination.route,
                        onClick = { go(destination.route) },
                        icon = { Icon(painterResource(destination.icon), null) },
                        label = { Text(stringResource(destination.label)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(navigation, Destination.Add.route, Modifier.padding(padding)) {
            composable(Destination.Add.route) {
                AddScreen(graph, kept = {
                    Toast.makeText(context, kept, Toast.LENGTH_SHORT).show()
                })
            }
            composable(Destination.Sent.route) { SentScreen(graph) }
            composable(SETTINGS) { SettingsScreen(graph, settings) }
        }
    }
}
