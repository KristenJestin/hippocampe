package fr.kristenjestin.hippocampe.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.kristenjestin.hippocampe.Graph
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.outbox.Draft
import fr.kristenjestin.hippocampe.outbox.Outbox
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** A photo is named after when it was taken, such as `photo-2026-03-14-091500.jpg`. */
private fun photoName() = "photo-${SimpleDateFormat("yyyy-MM-dd-HHmmss", Locale.ROOT).format(Date())}.jpg"

/** The photos and files chosen on the Add screen, kept across a rotation. */
class AddModel(private val outbox: Outbox) : ViewModel() {
    val attached = MutableStateFlow<List<Draft.Copy>>(emptyList())

    /** Where the camera writes the photo being taken. */
    var photo: File? = null

    fun attach(copies: List<Draft.Copy>) = attached.update { it + copies }

    fun remove(copy: Draft.Copy) {
        attached.update { it - copy }
        outbox.discard(listOf(copy))
    }

    /** Keeps the text and what is attached, then starts again empty. */
    fun send(text: String, note: String, done: () -> Unit) {
        val drafts = listOfNotNull(Draft.of(text)) + attached.value
        if (drafts.isEmpty()) return
        attached.value = emptyList()
        viewModelScope.launch {
            outbox.add(drafts, note)
            done()
        }
    }
}

/** A note, a link, photos from the camera and files, sent to the inbox with an optional note. */
@Composable
fun AddScreen(graph: Graph, kept: () -> Unit, modifier: Modifier = Modifier) {
    val model = viewModel { AddModel(graph.outbox) }
    val context = LocalContext.current
    val attached by model.attached.collectAsStateWithLifecycle()
    var text by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { taken ->
        val file = model.photo ?: return@rememberLauncherForActivityResult
        model.photo = null
        if (taken && file.length() > 0) {
            model.attach(listOf(Draft.Copy(file.path, photoName(), "image/jpeg", file.length())))
        } else file.delete()
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris: List<Uri> ->
        model.viewModelScope.launch {
            val copies = withContext(Dispatchers.IO) {
                uris.mapNotNull { graph.outbox.copy(context.contentResolver, it, null) }
            }
            model.attach(copies)
        }
    }

    Column(
        modifier.verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        OutlinedTextField(
            text,
            { text = it },
            Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.add_text)) },
            minLines = 3,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton({
                val file = graph.outbox.blank()
                model.photo = file
                camera.launch(FileProvider.getUriForFile(context, "${context.packageName}.files", file))
            }) { Text(stringResource(R.string.add_photo)) }
            OutlinedButton({ files.launch(arrayOf("*/*")) }) { Text(stringResource(R.string.add_files)) }
        }
        attached.forEach { copy ->
            DraftLine(copy) { RemoveButton(stringResource(R.string.add_remove)) { model.remove(copy) } }
        }
        OutlinedTextField(
            note,
            { note = it },
            Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.add_note)) },
            singleLine = true,
        )
        Button(
            onClick = {
                model.send(text, note) {
                    text = ""
                    note = ""
                    kept()
                }
            },
            enabled = text.isNotBlank() || attached.isNotEmpty(),
        ) { Text(stringResource(R.string.add_send)) }
    }
}
