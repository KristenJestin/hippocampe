package fr.kristenjestin.hippocampe.home

import android.content.res.Resources
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.BriefingOccurrence
import fr.kristenjestin.hippocampe.read.dateInWords
import fr.kristenjestin.hippocampe.read.labelOf

/** What is due and when, in a line: `End: in 39 days (20 November 2026)`. */
fun dueLine(resources: Resources, occurrence: BriefingOccurrence): String {
    val label = labelOf(occurrence.field)
    val date = dateInWords(occurrence.date)
    val days = occurrence.daysLeft ?: return resources.getString(R.string.due_on, label, date)
    val left = when (days) {
        0L -> resources.getString(R.string.due_today)
        1L -> resources.getString(R.string.due_tomorrow)
        else -> resources.getQuantityString(R.plurals.due_in_days, days.toInt(), days.toInt())
    }
    return resources.getString(R.string.due_line, label, left, date)
}
