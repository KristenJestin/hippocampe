package fr.kristenjestin.hippocampe.read

import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Briefing
import fr.kristenjestin.hippocampe.api.EntryRead
import fr.kristenjestin.hippocampe.api.HistoryPage
import fr.kristenjestin.hippocampe.api.SearchResults
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.api.TypeDefinition
import java.io.File

/** What a screen shows of something it asked the server for. */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>

    data class Ready<T>(val value: T) : Load<T>

    /** Why it could not be read, in one sentence. */
    data class Failed(val sentence: String) : Load<Nothing>
}

/** The answer of the server as a [Load]: what was read, or the sentence that says why not. */
fun <T> Answer<T>.load(): Load<T> = when (this) {
    is Answer.Done -> Load.Ready(value)
    is Answer.Refused -> Load.Failed(message)
    is Answer.Failed -> Load.Failed(message)
}

/** Reads Hippocampe with the server and the key the phone holds in its settings. */
class Reading(private val api: Api, private val server: suspend () -> Server?) {
    suspend fun search(query: String, type: String?): Load<SearchResults> =
        ask { api.search(it, query, type) }

    suspend fun entry(entry: String): Load<EntryRead> = ask { api.entry(it, entry) }

    suspend fun history(entry: String, cursor: String?): Load<HistoryPage> =
        ask { api.history(it, entry, cursor) }

    suspend fun tree(): Load<List<TreeEntry>> = ask { api.tree(it).map { list -> list.entries } }

    /** What is coming this week, and what waits. */
    suspend fun briefing(): Load<Briefing> = ask { api.briefing(it, "week") }

    suspend fun types(): Load<List<TypeDefinition>> = ask { api.types(it).map { list -> list.types } }

    /** An image of Hippocampe, by the `url` of its medium. */
    suspend fun image(path: String): Load<ByteArray> = ask { api.medium(it, path) }

    /** A file of Hippocampe written to [file], by the `url` of its medium. */
    suspend fun download(path: String, file: File): Load<Unit> = ask { api.download(it, path, file) }

    private suspend fun <T> ask(request: suspend (Server) -> Answer<T>): Load<T> {
        val server = server() ?: return Load.Failed(UNSET)
        return request(server).load()
    }

    private fun <T, R> Answer<T>.map(change: (T) -> R): Answer<R> = when (this) {
        is Answer.Done -> Answer.Done(change(value))
        is Answer.Refused -> this
        is Answer.Failed -> this
    }

    companion object {
        const val UNSET = "Connect this phone to Hippocampe first, in the settings."
    }
}

/** The types of Hippocampe, to name them as people read them and to know the kind of each field. */
class Kinds(val types: List<TypeDefinition>) {
    /** The label of a type, its name while the types are not known. */
    fun label(type: String) = definition(type)?.label ?: type

    fun definition(type: String) = types.firstOrNull { it.name == type }
}
