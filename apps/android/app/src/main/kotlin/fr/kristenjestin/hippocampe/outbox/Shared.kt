package fr.kristenjestin.hippocampe.outbox

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat

/** What another application shares, as drafts: its text, or each of its files, copied at once. */
fun Outbox.shared(intent: Intent, resolver: ContentResolver): List<Draft> =
    when (intent.action) {
        Intent.ACTION_SEND -> {
            val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
            if (stream != null) listOfNotNull(copy(resolver, stream, intent.type))
            else listOfNotNull(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.let(Draft::of))
        }
        Intent.ACTION_SEND_MULTIPLE ->
            IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                .orEmpty()
                .mapNotNull { copy(resolver, it, intent.type) }
        else -> emptyList()
    }
