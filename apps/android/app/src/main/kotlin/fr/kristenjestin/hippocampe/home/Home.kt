package fr.kristenjestin.hippocampe.home

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import fr.kristenjestin.hippocampe.api.Briefing
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.read.Reading
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.time.Instant

/** A briefing as it was read, and when; [problem] says why it is the last one read rather than a new one. */
data class Seen(val briefing: Briefing, val readAt: Instant, val problem: String?)

/** The last briefing read, kept with the address of the server it came from. */
class HomeStore(private val store: DataStore<Preferences>) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun keep(address: String, briefing: Briefing, at: Instant) {
        store.edit {
            it[ADDRESS] = address
            it[BRIEFING] = json.encodeToString(Briefing.serializer(), briefing)
            it[AT] = at.toEpochMilli()
        }
    }

    /** The briefing last read from the server at [address], and when; none read from another one. */
    suspend fun last(address: String): Pair<Briefing, Instant>? {
        val preferences = store.data.first()
        if (preferences[ADDRESS] != address) return null
        val at = preferences[AT] ?: return null
        val briefing = try {
            json.decodeFromString(Briefing.serializer(), preferences[BRIEFING] ?: return null)
        } catch (failure: SerializationException) {
            return null
        }
        return briefing to Instant.ofEpochMilli(at)
    }

    private companion object {
        val ADDRESS = stringPreferencesKey("address")
        val BRIEFING = stringPreferencesKey("briefing")
        val AT = longPreferencesKey("read_at")
    }
}

/** What Home shows: the briefing of the server, or the last one read while the server cannot be reached. */
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
                store.keep(server.address, read.value, at)
                Load.Ready(Seen(read.value, at, null))
            }
            is Load.Failed -> store.last(server.address)
                ?.let { (briefing, at) -> Load.Ready(Seen(briefing, at, read.sentence)) }
                ?: read
            Load.Loading -> Load.Loading
        }
    }
}
