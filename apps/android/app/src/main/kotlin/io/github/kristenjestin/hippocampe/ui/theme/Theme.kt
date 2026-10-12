package io.github.kristenjestin.hippocampe.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// The colours of the desktop viewer, apps/desktop/crates/ui/src/theme.json, dark then light.

private val Dark = darkColorScheme(
    primary = Color(0xFF5ED39A),
    onPrimary = Color(0xFF0A0A0A),
    primaryContainer = Color(0x1F5ED39A),
    onPrimaryContainer = Color(0xFFEDEDED),
    secondary = Color(0xFF5ED39A),
    onSecondary = Color(0xFF0A0A0A),
    secondaryContainer = Color(0xFF1C1C1C),
    onSecondaryContainer = Color(0xFFEDEDED),
    background = Color(0xFF121212),
    onBackground = Color(0xFFEDEDED),
    surface = Color(0xFF121212),
    onSurface = Color(0xFFEDEDED),
    surfaceVariant = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFFA1A1A1),
    surfaceContainerLowest = Color(0xFF0A0A0A),
    surfaceContainerLow = Color(0xFF161616),
    surfaceContainer = Color(0xFF161616),
    surfaceContainerHigh = Color(0xFF1C1C1C),
    surfaceContainerHighest = Color(0xFF222222),
    outline = Color(0xFF262626),
    outlineVariant = Color(0xFF1F1F1F),
    error = Color(0xFFFF7B72),
    onError = Color(0xFF0A0A0A),
)

private val Light = lightColorScheme(
    primary = Color(0xFF15803D),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0x1415803D),
    onPrimaryContainer = Color(0xFF0A0A0A),
    secondary = Color(0xFF15803D),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFF4F4F5),
    onSecondaryContainer = Color(0xFF0A0A0A),
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF0A0A0A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0A0A0A),
    surfaceVariant = Color(0xFFF6F6F7),
    onSurfaceVariant = Color(0xFF666666),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFCFCFC),
    surfaceContainer = Color(0xFFFAFAFA),
    surfaceContainerHigh = Color(0xFFF4F4F5),
    surfaceContainerHighest = Color(0xFFECECEE),
    outline = Color(0xFFE5E5E5),
    outlineVariant = Color(0xFFEFEFEF),
    error = Color(0xFFD93025),
    onError = Color(0xFFFFFFFF),
)

/** The colours Material 3 has no role for: what warns, such as an instance that is not production. */
@Immutable
data class Signals(val warning: Color)

val LocalSignals = staticCompositionLocalOf { Signals(warning = Color(0xFFF5C451)) }

@Composable
fun HippocampeTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    androidx.compose.runtime.CompositionLocalProvider(
        LocalSignals provides Signals(warning = if (dark) Color(0xFFF5C451) else Color(0xFFB07D00)),
    ) {
        MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
    }
}
