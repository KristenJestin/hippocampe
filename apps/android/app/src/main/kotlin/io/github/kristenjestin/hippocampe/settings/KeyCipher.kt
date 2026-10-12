package io.github.kristenjestin.hippocampe.settings

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypts the key of the server before it is written, and decrypts it to send a request. */
interface KeyCipher {
    fun encrypt(plain: ByteArray): ByteArray

    fun decrypt(sealed: ByteArray): ByteArray
}

/**
 * AES-GCM under a key of the Android Keystore, which never leaves it: what is written is the
 * initialisation vector followed by the ciphertext.
 */
class KeystoreCipher : KeyCipher {
    private val key: SecretKey
        get() {
            val store = KeyStore.getInstance(STORE).apply { load(null) }
            (store.getKey(ALIAS, null) as SecretKey?)?.let { return it }
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE).run {
                init(
                    KeyGenParameterSpec.Builder(
                        ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build(),
                )
                generateKey()
            }
        }

    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key) }
        return cipher.iv + cipher.doFinal(plain)
    }

    override fun decrypt(sealed: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, IV))
        }
        return cipher.doFinal(sealed, IV, sealed.size - IV)
    }

    private companion object {
        const val STORE = "AndroidKeyStore"
        const val ALIAS = "hippocampe-server-key"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV = 12
    }
}
