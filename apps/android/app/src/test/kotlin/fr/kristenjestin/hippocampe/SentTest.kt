package fr.kristenjestin.hippocampe

import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.InboxSentStatus
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.outbox.Draft
import fr.kristenjestin.hippocampe.outbox.Outbox
import fr.kristenjestin.hippocampe.sent.Became
import fr.kristenjestin.hippocampe.sent.follow
import fr.kristenjestin.hippocampe.sent.sentRows
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SentTest {
    private val fixture = Fixture()

    @After
    fun close() = fixture.close()

    @Test
    fun `the sent list shows what each item became`() = runBlocking {
        var at = 0L
        val outbox = Outbox(fixture.dao, fixture.folder, {}, now = { at++ })
        val (pending, processed, dismissed) = listOf("pending", "processed", "dismissed").map {
            outbox.add(listOf(Draft.Text("A $it note")), null).single()
        }
        fixture.attempt()
        fixture.server.refusal = "A text of the inbox is not empty."
        val refused = outbox.add(listOf(Draft.Text("refused")), null).single()
        fixture.attempt()
        val waiting = outbox.add(listOf(Draft.Text("waiting")), null).single()
        fixture.server.became[processed.clientId] = Triple(InboxSentStatus.Processed, null, listOf("Lentil soup", "Pantry"))
        fixture.server.became[dismissed.clientId] = Triple(InboxSentStatus.Dismissed, "Already kept as an entry.", emptyList())

        val items = fixture.dao.all().first()
        val followed = follow(fixture.api, Server("http://hippocampe.test:3000", fixture.server.key), items) as Answer.Done
        val rows = sentRows(items, followed.value)

        assertEquals(
            listOf(waiting, refused, dismissed, processed, pending).map { it.clientId },
            rows.map { it.item.clientId },
        )
        assertEquals(
            listOf(
                Became.Waiting,
                Became.Refused("A text of the inbox is not empty."),
                Became.Dismissed("Already kept as an entry."),
                Became.Processed(listOf("Lentil soup", "Pantry")),
                Became.InInbox,
            ),
            rows.map { it.became },
        )
        val asked = fixture.server.requests.last().url.parameters.getAll("client_id")!!.toSet()
        assertEquals("only what is in the inbox is asked about", setOf(pending, processed, dismissed).map { it.clientId }.toSet(), asked)
    }
}
