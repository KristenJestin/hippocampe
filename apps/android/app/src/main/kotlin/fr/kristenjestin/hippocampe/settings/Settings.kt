package fr.kristenjestin.hippocampe.settings

import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import fr.kristenjestin.hippocampe.api.About
import fr.kristenjestin.hippocampe.api.AboutInstance
import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** The instance a server said it is, shown wherever something may be sent to it. */
data class Instance(val name: AboutInstance, val label: String?)

/** What the settings show: the key is never part of them. */
data class Settings(val address: String, val instance: Instance)

/**
 * The server's address and its key, kept in DataStore; the key only encrypted by [cipher], and
 * read back only to send a request.
 */
class SettingsStore(private val store: DataStore<Preferences>, private val cipher: KeyCipher) {
    val settings: Flow<Settings?> = store.data.map { preferences ->
        val address = preferences[ADDRESS] ?: return@map null
        val instance = preferences[INSTANCE] ?: return@map null
        Settings(
            address,
            Instance(AboutInstance.entries.first { it.name == instance }, preferences[LABEL]),
        )
    }

    /** The server to send to, its key decrypted, or none before the settings are saved. */
    suspend fun server(): Server? {
        val preferences = store.data.first()
        val address = preferences[ADDRESS] ?: return null
        val sealed = preferences[KEY] ?: return null
        return Server(address, cipher.decrypt(Base64.decode(sealed, Base64.NO_WRAP)).decodeToString())
    }

    /** Saves what [SettingsCheck] accepted, with the instance it found. */
    suspend fun save(server: Server, about: About) {
        val sealed = Base64.encodeToString(cipher.encrypt(server.key.encodeToByteArray()), Base64.NO_WRAP)
        store.edit {
            it[ADDRESS] = server.address
            it[KEY] = sealed
            it[INSTANCE] = about.instance.name
            if (about.label == null) it.remove(LABEL) else it[LABEL] = about.label
        }
    }

    private companion object {
        val ADDRESS = stringPreferencesKey("address")
        val KEY = stringPreferencesKey("key")
        val INSTANCE = stringPreferencesKey("instance")
        val LABEL = stringPreferencesKey("label")
    }
}

/** Checks an address and a key against the server before they are saved. */
class SettingsCheck(private val api: Api) {
    /** What the server is, or the one sentence that says what is wrong. */
    suspend fun check(address: String, key: String): Result {
        val trimmed = address.trim().trimEnd('/')
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
            return Result.Wrong("The address starts with http:// or https://, such as http://192.168.1.20:3000.")
        if (key.isBlank()) return Result.Wrong("A key is needed: create one with the rights read and write.")
        val server = Server(trimmed, key.trim())
        val about = when (val answer = api.about(server)) {
            is Answer.Done -> answer.value
            is Answer.Refused -> return Result.Wrong(answer.message)
            is Answer.Failed -> return Result.Wrong(answer.message)
        }
        return when (val answer = api.mayWrite(server)) {
            is Answer.Done -> Result.Right(server, about)
            is Answer.Refused -> Result.Wrong(answer.message)
            is Answer.Failed -> Result.Wrong(answer.message)
        }
    }

    sealed interface Result {
        data class Right(val server: Server, val about: About) : Result

        data class Wrong(val sentence: String) : Result
    }
}
