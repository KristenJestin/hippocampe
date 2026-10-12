package fr.kristenjestin.hippocampe.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.kristenjestin.hippocampe.R
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.kristenjestin.hippocampe.read.Kinds
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Node
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.read.treeOf
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The tree of entries, with the types that name them. */
data class Browsed(val tree: List<Node>, val kinds: Kinds)

/** The tree from the top-level entries down, and which entries are opened. */
class BrowseModel(private val reading: Reading) : ViewModel() {
    private val loaded = MutableStateFlow<Load<Browsed>>(Load.Loading)
    val state: StateFlow<Load<Browsed>> = loaded

    /** The ids of the entries whose children are shown. */
    val opened = MutableStateFlow(emptySet<String>())

    init {
        load()
    }

    fun load() {
        loaded.value = Load.Loading
        viewModelScope.launch {
            loaded.value = coroutineScope {
                val tree = async { reading.tree() }
                val types = async { reading.types() }
                when (val tree = tree.await()) {
                    is Load.Ready -> Load.Ready(Browsed(treeOf(tree.value), Kinds((types.await() as? Load.Ready)?.value.orEmpty())))
                    is Load.Failed -> tree
                    Load.Loading -> Load.Loading
                }
            }
        }
    }

    fun toggle(id: String) = opened.update { if (id in it) it - id else it + id }
}

/** An entry of the tree as a row: how deep it is, and whether it is opened. */
private data class Line(val node: Node, val depth: Int, val opened: Boolean, val key: String)

/** The rows that show: the top-level entries, and under each one opened, its own. */
private fun linesOf(nodes: List<Node>, opened: Set<String>, above: String = ""): List<Line> =
    nodes.flatMap { node ->
        val open = node.id in opened
        val key = "$above/${node.id}"
        listOf(Line(node, above.count { it == '/' }, open, key)) + if (open) linesOf(node.children, opened, key) else emptyList()
    }

/**
 * The tree from the top-level entries down, as the desktop viewer's sidebar: an arrow opens what is
 * filed under an entry, its title opens the entry (its id goes to [open]).
 */
@Composable
fun BrowseScreen(model: BrowseModel, open: (String) -> Unit, modifier: Modifier = Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    val opened by model.opened.collectAsStateWithLifecycle()
    Loaded(state, model::load, modifier) { browsed ->
        if (browsed.tree.isEmpty()) {
            Text(stringResource(R.string.browse_empty), Modifier.padding(24.dp))
            return@Loaded
        }
        LazyColumn {
            items(linesOf(browsed.tree, opened), key = { it.key }) { line ->
                val node = line.node
                Row(Modifier.fillMaxWidth().padding(start = (8 + 20 * line.depth).dp), verticalAlignment = Alignment.CenterVertically) {
                    if (node.children.isEmpty()) {
                        Spacer(Modifier.width(48.dp))
                    } else {
                        IconButton({ model.toggle(node.id) }) {
                            Icon(
                                painterResource(R.drawable.ic_expand),
                                stringResource(if (line.opened) R.string.browse_close else R.string.browse_open, node.title),
                                Modifier.size(24.dp).rotate(if (line.opened) 0f else -90f),
                            )
                        }
                    }
                    Row(
                        Modifier.weight(1f).clickable { open(node.id) }.padding(end = 16.dp, top = 12.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(node.title, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(
                            browsed.kinds.label(node.type),
                            Modifier.padding(start = 8.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
                HorizontalDivider()
            }
        }
    }
}
