package fr.kristenjestin.hippocampe.read

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

private val WORDS = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)

private val MOMENT = DateTimeFormatter.ofPattern("d MMMM yyyy 'at' HH:mm", Locale.ENGLISH)

/** A moment as it reads best on the phone, in its time zone: `12 October 2026 at 14:00`. */
fun momentInWords(at: Instant, zone: ZoneId = ZoneId.systemDefault()): String = MOMENT.format(at.atZone(zone))

/** A date or an instant of the API as it reads best (`2026-09-30T08:00:00.000Z` as `30 September 2026`); anything else as it is. */
fun dateInWords(value: String): String = try {
    LocalDate.parse(value.take(10)).format(WORDS)
} catch (failure: DateTimeParseException) {
    value
}

/** A field name as a label: `monthly_cost` as `Monthly cost`. */
fun labelOf(name: String): String =
    name.removePrefix("fields.").removePrefix("links.").replace('_', ' ').replaceFirstChar { it.uppercase() }
