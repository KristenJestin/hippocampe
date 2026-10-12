package io.github.kristenjestin.hippocampe

import androidx.work.ListenableWorker
import androidx.work.WorkInfo
import androidx.work.testing.WorkManagerTestInitHelper
import io.github.kristenjestin.hippocampe.outbox.Draft
import io.github.kristenjestin.hippocampe.outbox.SendWorker
import io.github.kristenjestin.hippocampe.outbox.Standing
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class SendingTest {
    private val fixture = Fixture()
    private val dao = fixture.dao

    @After
    fun close() = fixture.close()

    private fun sendingWork() = fixture.work.getWorkInfosForUniqueWork(SendWorker.NAME).get().single()

    @Test
    fun `what is added offline is kept and sent when the network comes back`() = runBlocking {
        val item = fixture.outbox.add(listOf(Draft.Link("https://example.org/recipes/lentil-soup")), null).single()

        // No network: WorkManager holds the sending back; the item waits on the phone.
        val waiting = sendingWork()
        assertEquals(WorkInfo.State.ENQUEUED, waiting.state)
        assertEquals(Standing.Waiting, dao.get(item.clientId)?.standing)
        assertEquals(emptyList<Received>(), fixture.server.inbox)

        WorkManagerTestInitHelper.getTestDriver(fixture.context)!!.setAllConstraintsMet(waiting.id)
        val deadline = System.currentTimeMillis() + 10_000
        while (fixture.work.getWorkInfoById(waiting.id).get()?.state != WorkInfo.State.SUCCEEDED) {
            check(System.currentTimeMillis() < deadline) { "the sending did not end" }
            Thread.sleep(20)
        }

        assertEquals(listOf(item.clientId), fixture.server.inbox.map { it.clientId })
        assertEquals(Standing.Sent, dao.get(item.clientId)?.standing)
        assertEquals(fixture.server.idOf(item.clientId), dao.get(item.clientId)?.inboxId)
    }

    @Test
    fun `a send that fails on a server error is retried later`() = runBlocking {
        val item = fixture.outbox.add(listOf(Draft.Text("Call the plumber about the boiler")), null).single()

        fixture.server.failing = 503
        assertEquals(ListenableWorker.Result.retry(), fixture.attempt())
        assertEquals(Standing.Waiting, dao.get(item.clientId)?.standing)

        fixture.server.failing = null
        fixture.server.reachable = false
        assertEquals(ListenableWorker.Result.retry(), fixture.attempt())
        assertEquals(Standing.Waiting, dao.get(item.clientId)?.standing)

        fixture.server.reachable = true
        assertEquals(ListenableWorker.Result.success(), fixture.attempt())
        assertEquals(Standing.Sent, dao.get(item.clientId)?.standing)
        assertEquals(1, fixture.server.inbox.size)
    }

    @Test
    fun `a refusal is shown with the server's sentence and not retried`() = runBlocking {
        val item = fixture.outbox.add(listOf(Draft.Link("https://example.org/a")), null).single()
        val sentence = "The client identifier was sent with another content: it is kept once."

        fixture.server.refusal = sentence
        assertEquals(ListenableWorker.Result.success(), fixture.attempt())
        val refused = dao.get(item.clientId)!!
        assertEquals(Standing.Refused, refused.standing)
        assertEquals(sentence, refused.refusal)

        val asked = fixture.server.requests.size
        fixture.server.refusal = null
        assertEquals(ListenableWorker.Result.success(), fixture.attempt())
        assertEquals("nothing is sent again", asked, fixture.server.requests.size)
        assertEquals(Standing.Refused, dao.get(item.clientId)?.standing)
    }

    @Test
    fun `a retry after a lost response does not add the item twice`() = runBlocking {
        val item = fixture.outbox.add(listOf(Draft.Text("The spare key is with the neighbour")), null).single()

        fixture.server.loseNextAnswer = true
        assertEquals(ListenableWorker.Result.retry(), fixture.attempt())
        assertEquals("the server kept it, the phone does not know", 1, fixture.server.inbox.size)
        assertEquals(Standing.Waiting, dao.get(item.clientId)?.standing)

        assertEquals(ListenableWorker.Result.success(), fixture.attempt())
        assertEquals(1, fixture.server.inbox.size)
        assertEquals(Standing.Sent, dao.get(item.clientId)?.standing)
    }

    @Test
    fun `a waiting item can be cancelled`() = runBlocking {
        val copy = File(fixture.folder, "copy").apply { writeText("a receipt") }
        val (kept, cancelled) = fixture.outbox.add(
            listOf(Draft.Text("Keep this one"), Draft.Copy(copy.path, "receipt.pdf", "application/pdf", 9)),
            null,
        )

        fixture.outbox.cancel(cancelled.clientId)
        assertNull(dao.get(cancelled.clientId))
        assertFalse("its copy is gone", copy.exists())

        fixture.attempt()
        assertEquals(listOf(kept.clientId), fixture.server.inbox.map { it.clientId })

        fixture.outbox.cancel(kept.clientId)
        assertEquals("what is in the inbox stays listed", Standing.Sent, dao.get(kept.clientId)?.standing)
    }
}
