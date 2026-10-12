package fr.kristenjestin.hippocampe.home

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import fr.kristenjestin.hippocampe.api.Briefing
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Reading
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.Instant

/**
 * A briefing as it was read, with the entries changed most recently (none while they could not be read),
 * and when; [problem] says why it is the last one read rather than a new one.
 */
data class Seen(val briefing: Briefing, val recent: List<TreeEntry>, val readAt: Instant, val problem: String?)

/** How many of the entries changed most recently Home shows. */
const val RECENT = 5

/** The last briefing read, kept with the address of the server it came from. */
class HomeStore(private val store: DataStore<Preferences>) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun keep(address: String, briefing: Briefing, recent: List<TreeEntry>, at: Instant) {
        store.edit {
            it[ADDRESS] = address
            it[BRIEFING] = json.encodeToString(Briefing.serializer(), briefing)
            it[RECENT_ENTRIES] = json.encodeToString(recentSerializer, recent)
            it[AT] = at.toEpochMilli()
        }
    }

    /** The briefing and the recent entries last read from the server at [address], and when; none read from another one. */
    suspend fun last(address: String): Triple<Briefing, List<TreeEntry>, Instant>? {
        val preferences = store.data.first()
        if (preferences[ADDRESS] != address) return null
        val at = preferences[AT] ?: return null
        return try {
            val briefing = json.decodeFromString(Briefing.serializer(), preferences[BRIEFING] ?: return null)
            val recent = preferences[RECENT_ENTRIES]?.let { json.decodeFromString(recentSerializer, it) }.orEmpty()
            Triple(briefing, recent, Instant.ofEpochMilli(at))
        } catch (failure: SerializationException) {
            null
        }
    }

    private companion object {
        val ADDRESS = stringPreferencesKey("address")
        val BRIEFING = stringPreferencesKey("briefing")
        val RECENT_ENTRIES = stringPreferencesKey("recent")
        val AT = longPreferencesKey("read_at")
        val recentSerializer = ListSerializer(TreeEntry.serializer())
    }
}

/**
 * What Home shows: the briefing of the server and the entries changed most recently, or the last ones
 * read while the server cannot be reached. The entries changed are secondary: a briefing read without
 * them is shown without them.
 */
class Home(
    private val reading: Reading,
    private val store: HomeStore,
    private val server: suspend () -> Server?,
    private val now: () -> Instant = Instant::now,
) {
    suspend fun read(): Load<Seen> {
        val server = server() ?: return Load.Failed(Reading.UNSET)
        return when (val read = reading.briefing()) {
            is Load.Ready -> {
                val at = now()
                val recent = (reading.recent(RECENT) as? Load.Ready)?.value.orEmpty()
                store.keep(server.address, read.value, recent, at)
                Load.Ready(Seen(read.value, recent, at, null))
            }
            is Load.Failed -> store.last(server.address)
                ?.let { (briefing, recent, at) -> Load.Ready(Seen(briefing, recent, at, read.sentence)) }
                ?: read
            Load.Loading -> Load.Loading
        }
    }
}
