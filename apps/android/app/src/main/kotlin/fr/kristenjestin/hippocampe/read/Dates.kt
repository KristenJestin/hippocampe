package fr.kristenjestin.hippocampe.read

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

private val WORDS = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)

/** A date or an instant of the API as it reads best (`2026-09-30T08:00:00.000Z` as `30 September 2026`); anything else as it is. */
fun dateInWords(value: String): String = try {
    LocalDate.parse(value.take(10)).format(WORDS)
} catch (failure: DateTimeParseException) {
    value
}

/** A field name as a label: `monthly_cost` as `Monthly cost`. */
fun labelOf(name: String): String =
    name.removePrefix("fields.").removePrefix("links.").replace('_', ' ').replaceFirstChar { it.uppercase() }
