package io.github.kristenjestin.hippocampe

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import io.github.kristenjestin.hippocampe.api.Api
import io.github.kristenjestin.hippocampe.api.Server
import io.github.kristenjestin.hippocampe.settings.KeyCipher
import io.github.kristenjestin.hippocampe.settings.SettingsCheck
import io.github.kristenjestin.hippocampe.settings.SettingsStore
import io.github.kristenjestin.hippocampe.ui.InstanceBadge
import io.github.kristenjestin.hippocampe.ui.loaded
import io.github.kristenjestin.hippocampe.ui.theme.HippocampeTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.nio.file.Files
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM under a key held in memory, as the Keystore's is held in the phone's hardware. */
private class MemoryCipher : KeyCipher {
    private val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
        return cipher.iv + cipher.doFinal(plain)
    }

    override fun decrypt(sealed: ByteArray): ByteArray =
        Cipher.getInstance("AES/GCM/NoPadding")
            .apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, 12)) }
            .doFinal(sealed, 12, sealed.size - 12)
}

@RunWith(RobolectricTestRunner::class)
class SettingsTest {
    @get:Rule
    val compose = createComposeRule()

    private val server = FakeServer()
    private val check = SettingsCheck(Api(server.engine))
    private val folder: File = Files.createTempDirectory("settings").toFile()
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val file = File(folder, "settings.preferences_pb")
    private val store = SettingsStore(PreferenceDataStoreFactory.create(scope = scope) { file }, MemoryCipher())
    private val address = "http://hippocampe.test:3000"

    @After
    fun close() {
        scope.cancel()
        folder.deleteRecursively()
    }

    private fun wrong(key: String) = (runBlocking { check.check(address, key) } as SettingsCheck.Result.Wrong).sentence

    @Test
    fun `the settings are checked against the server and a wrong key is said in one sentence`() {
        val refused = wrong("hk_not_the_key")
        assertEquals("the server's sentence, as it said it", "This key is not known: it was revoked or mistyped.", refused)
        assertFalse("one sentence, on one line", '\n' in refused)

        server.rights = setOf("read")
        val before = server.inbox.size
        assertEquals(
            "This key may not write: ask the owner of Hippocampe for a key with the right `write`.",
            wrong(server.key),
        )
        assertEquals("checking the right write adds nothing to the inbox", before, server.inbox.size)

        server.reachable = false
        assertEquals(Api.unreachable(Server(address, server.key)), wrong(server.key))
        assertEquals("The address starts with http:// or https://, such as http://192.168.1.20:3000.", runBlocking {
            (check.check("hippocampe.test", server.key) as SettingsCheck.Result.Wrong).sentence
        })

        server.reachable = true
        server.rights = setOf("read", "write")
        val right = runBlocking { check.check("$address/", server.key) } as SettingsCheck.Result.Right
        assertEquals(address, right.server.address)
    }

    @Test
    fun `the instance is shown once the settings are saved`() {
        val right = runBlocking { check.check(address, server.key) } as SettingsCheck.Result.Right
        runBlocking { store.save(right.server, right.about) }

        compose.setContent {
            HippocampeTheme {
                val loaded by store.loaded().collectAsState(initial = null)
                loaded?.settings?.let { InstanceBadge(it.instance) }
            }
        }

        compose.onNodeWithText("Development · Test bench").assertExists()
    }

    @Test
    fun `the key is kept encrypted and never shown again`() = runBlocking {
        val key = "hk_secret_key_for_the_test"
        store.save(Server(address, key), runBlocking { (check.check(address, server.key) as SettingsCheck.Result.Right).about })

        val written = file.readBytes().decodeToString()
        assertFalse("the key is not written in clear", key in written)
        assertFalse("the settings shown hold no key", key in store.settings.first().toString())
        assertFalse("a server is never printed with its key", key in Server(address, key).toString())
        assertEquals("the key is read back only to send", key, store.server()?.key)
        assertTrue(written.contains(address))
    }
}
