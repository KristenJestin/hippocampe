package fr.kristenjestin.hippocampe.sent

import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.InboxSent
import fr.kristenjestin.hippocampe.api.InboxSentStatus
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.outbox.Outgoing
import fr.kristenjestin.hippocampe.outbox.Standing

/** What an item sent from this phone became. */
sealed interface Became {
    /** Still on the phone: it may be cancelled. */
    data object Waiting : Became

    /** Refused for its key, in the server's sentence: it waits for the settings. */
    data class Held(val sentence: String) : Became

    /** Refused by the server, in its sentence. */
    data class Refused(val sentence: String) : Became

    /** In the inbox, for an agent to take. */
    data object InInbox : Became

    /** Processed: the titles of the entries it gave. */
    data class Processed(val titles: List<String>) : Became

    /** Dismissed by an agent, and why. */
    data class Dismissed(val reason: String?) : Became
}

data class SentRow(val item: Outgoing, val became: Became)

/** The items of the phone, newest first, each with what the inbox says it became. */
fun sentRows(items: List<Outgoing>, followed: List<InboxSent>): List<SentRow> {
    val byClient = followed.associateBy { it.clientId }
    return items.sortedByDescending { it.createdAt }.map { item ->
        val inbox = byClient[item.clientId]
        val became = when {
            item.standing == Standing.Waiting -> Became.Waiting
            item.standing == Standing.Held -> Became.Held(item.refusal.orEmpty())
            item.standing == Standing.Refused -> Became.Refused(item.refusal.orEmpty())
            inbox == null -> Became.InInbox
            inbox.status == InboxSentStatus.Processed -> Became.Processed(inbox.entries.map { it.title })
            inbox.status == InboxSentStatus.Dismissed -> Became.Dismissed(inbox.reason)
            else -> Became.InInbox
        }
        SentRow(item, became)
    }
}

/** How many of the newest items sent are followed in the inbox at once. */
const val FOLLOWED = 50

/** Asks the inbox what became of the newest items sent from this phone. */
suspend fun follow(api: Api, server: Server, items: List<Outgoing>): Answer<List<InboxSent>> {
    val sent = items.filter { it.standing == Standing.Sent }.sortedByDescending { it.createdAt }.take(FOLLOWED)
    if (sent.isEmpty()) return Answer.Done(emptyList())
    return when (val answer = api.follow(server, sent.map { it.clientId })) {
        is Answer.Done -> Answer.Done(answer.value.items)
        is Answer.Refused -> answer
        is Answer.Failed -> answer
    }
}
