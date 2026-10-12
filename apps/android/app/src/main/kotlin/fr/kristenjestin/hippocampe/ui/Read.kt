package fr.kristenjestin.hippocampe.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.read.Load
import fr.kristenjestin.hippocampe.ui.theme.LocalSignals
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Something being read: a spinner while it is asked for, why it could not be read, or [content]. */
@Composable
fun <T> Loaded(load: Load<T>, retry: () -> Unit, modifier: Modifier = Modifier, content: @Composable (T) -> Unit) {
    when (load) {
        Load.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is Load.Failed -> Problem(load.sentence, retry, modifier)
        is Load.Ready -> content(load.value)
    }
}

/** Why something could not be read, in the server's sentence or ours, with a way to try again. */
@Composable
fun Problem(sentence: String, retry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(sentence, color = MaterialTheme.colorScheme.error)
        Button(retry) { Text(stringResource(R.string.read_retry)) }
    }
}

/** The mark of a value that is only supposed, or that sources disagree on: shown apart from what is known. */
@Composable
fun SupposedMark(disputed: Boolean, modifier: Modifier = Modifier) {
    val warning = LocalSignals.current.warning
    Text(
        stringResource(if (disputed) R.string.entry_disputed else R.string.entry_supposed),
        modifier
            .border(1.dp, warning, RoundedCornerShape(6.dp))
            .padding(horizontal = 6.dp, vertical = 1.dp),
        color = warning,
        style = MaterialTheme.typography.labelSmall,
    )
}

/** An image as it can be drawn in [width] pixels or so, read from the bytes the server sent. */
fun decodeImage(bytes: ByteArray, width: Int = 1600): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= width) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        ?.asImageBitmap()
}

/** An image of Hippocampe, fetched with the key, described by [alt]; its words when it cannot be read. */
@Composable
fun Picture(path: String, alt: String, fetch: suspend (String) -> Load<ByteArray>, modifier: Modifier = Modifier) {
    val image by produceState<Load<ImageBitmap>>(Load.Loading, path) {
        value = when (val bytes = fetch(path)) {
            is Load.Ready -> withContext(Dispatchers.Default) { decodeImage(bytes.value) }?.let { Load.Ready(it) }
                ?: Load.Failed("")
            is Load.Failed -> Load.Failed(bytes.sentence)
            Load.Loading -> Load.Loading
        }
    }
    when (val shown = image) {
        Load.Loading -> Box(modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is Load.Failed -> Text(
            alt.ifEmpty { stringResource(R.string.entry_image_failed) },
            modifier,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
        is Load.Ready -> Image(shown.value, alt, modifier.fillMaxWidth().heightIn(max = 480.dp), contentScale = ContentScale.Fit)
    }
}
