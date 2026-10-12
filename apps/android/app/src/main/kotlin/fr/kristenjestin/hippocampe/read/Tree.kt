package fr.kristenjestin.hippocampe.read

import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.api.TreePlace

/** An entry of the tree, with the entries filed under it. */
data class Node(val id: String, val slug: String, val title: String, val type: String, val children: List<Node>)

/**
 * The tree from its entries, as the desktop viewer draws it: each entry under every place it is part
 * of, in the order the server gives them. An entry none of whose places the key sees stands at the
 * top, so that none goes missing. A part of its whole (`in_parent`) is read in the whole's page, not
 * listed under it; what is filed under such a part goes under the whole.
 */
fun treeOf(entries: List<TreeEntry>): List<Node> {
    val byId = entries.associateBy { it.id }
    fun seen(entry: TreeEntry): List<TreePlace> = entry.partOf.filter { it.id in byId }
    fun isPart(entry: TreeEntry) = seen(entry).let { places -> places.isNotEmpty() && places.all { it.inParent } }

    // Where what is filed under an entry stands: under the entry itself, or, when the tree lists no
    // branch for it, under the wholes it is read in.
    fun stands(id: String, chain: MutableList<String>): List<String> {
        val entry = byId.getValue(id)
        if (!isPart(entry)) return listOf(id)
        val found = mutableListOf<String>()
        chain += id
        for (place in seen(entry)) {
            if (place.id in chain) continue
            for (home in stands(place.id, chain)) if (home !in found) found += home
        }
        chain.removeAt(chain.lastIndex)
        return found
    }

    fun homes(entry: TreeEntry): List<String?> {
        val places = seen(entry)
        if (places.isEmpty()) return listOf(null)
        val found = mutableListOf<String>()
        for (place in places.filter { !it.inParent }) {
            for (home in stands(place.id, mutableListOf())) if (home !in found) found += home
        }
        return found
    }

    val under = mutableMapOf<String?, MutableList<TreeEntry>>()
    for (entry in entries) {
        if (isPart(entry)) continue
        for (home in homes(entry)) under.getOrPut(home) { mutableListOf() } += entry
    }

    fun build(parent: String?, chain: MutableList<String>): List<Node> =
        // A loop among the places, which the server refuses, is never drawn.
        under[parent].orEmpty().filter { it.id !in chain }.map { entry ->
            chain += entry.id
            val children = build(entry.id, chain)
            chain.removeAt(chain.lastIndex)
            Node(entry.id, entry.slug, entry.title, entry.type, children)
        }
    return build(null, mutableListOf())
}
