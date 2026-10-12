package io.github.kristenjestin.hippocampe.outbox

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import io.github.kristenjestin.hippocampe.api.InboxSentKind
import java.io.File
import java.util.UUID

/** Something about to be put into the inbox, before the owner sends it. */
sealed interface Draft {
    data class Text(val text: String) : Draft

    data class Link(val url: String) : Draft

    /** A file already copied into the application's storage, at [path]. */
    data class Copy(val path: String, val name: String, val mime: String, val size: Long) : Draft

    companion object {
        private val LINK = Regex("^https?://\\S+$", RegexOption.IGNORE_CASE)

        /** A text that is a link and nothing else is a link; any other text is a text. */
        fun of(text: String): Draft? {
            val trimmed = text.trim()
            return when {
                trimmed.isEmpty() -> null
                LINK.matches(trimmed) -> Link(trimmed)
                else -> Text(trimmed)
            }
        }
    }
}

/**
 * The things waiting to be sent: kept in [dao], their files in [folder], and handed to the sending
 * as soon as they are kept.
 */
class Outbox(
    private val dao: OutgoingDao,
    private val folder: File,
    private val schedule: () -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    val items = dao.all()

    /**
     * Copies what [uri] holds into the application's storage at once: a shared file may be readable
     * only while the share lasts. Its type is the one the provider gives, else [mime].
     */
    fun copy(resolver: ContentResolver, uri: Uri, mime: String?): Draft.Copy? {
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        folder.mkdirs()
        val target = File(folder, UUID.randomUUID().toString())
        val size = resolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { input.copyTo(it) }
        } ?: return null
        val type = resolver.getType(uri) ?: mime?.takeUnless { '*' in it } ?: "application/octet-stream"
        return Draft.Copy(target.path, name, type, size)
    }

    /** A new file in the application's storage, for the camera to write a photo into. */
    fun blank(): File = File(folder.apply { mkdirs() }, UUID.randomUUID().toString())

    /** Forgets drafts the owner did not send. */
    fun discard(drafts: List<Draft>) {
        drafts.filterIsInstance<Draft.Copy>().forEach { File(it.path).delete() }
    }

    /** Keeps each draft as an item to send, with the same [note], and starts the sending. */
    suspend fun add(drafts: List<Draft>, note: String?): List<Outgoing> {
        val reason = note?.trim()?.ifEmpty { null }
        val at = now()
        val items = drafts.map { draft ->
            val clientId = UUID.randomUUID().toString()
            when (draft) {
                is Draft.Text -> Outgoing(clientId, InboxSentKind.Text, text = draft.text, note = reason, createdAt = at)
                is Draft.Link -> Outgoing(clientId, InboxSentKind.Url, url = draft.url, note = reason, createdAt = at)
                is Draft.Copy -> Outgoing(
                    clientId,
                    InboxSentKind.File,
                    file = draft.path,
                    name = draft.name,
                    mime = draft.mime,
                    size = draft.size,
                    note = reason,
                    createdAt = at,
                )
            }
        }
        dao.insert(items)
        schedule()
        return items
    }

    /** Takes back an item not yet in the inbox, and its file. */
    suspend fun cancel(clientId: String) {
        val item = dao.get(clientId) ?: return
        if (dao.delete(clientId) > 0) item.file?.let { File(it).delete() }
    }
}
