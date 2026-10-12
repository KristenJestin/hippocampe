package io.github.kristenjestin.hippocampe.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import io.github.kristenjestin.hippocampe.outbox.Draft

/** One line for a draft: its text, its link, or its file's name. */
@Composable
fun DraftLine(draft: Draft, modifier: Modifier = Modifier, action: @Composable () -> Unit = {}) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            when (draft) {
                is Draft.Text -> draft.text
                is Draft.Link -> draft.url
                is Draft.Copy -> draft.name
            },
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        action()
    }
}

@Composable
fun RemoveButton(label: String, onClick: () -> Unit) {
    TextButton(onClick) { Text(label) }
}
