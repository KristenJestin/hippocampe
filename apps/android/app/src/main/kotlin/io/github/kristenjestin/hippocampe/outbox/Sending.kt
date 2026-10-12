package io.github.kristenjestin.hippocampe.outbox

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import io.github.kristenjestin.hippocampe.api.Answer
import io.github.kristenjestin.hippocampe.api.Api
import io.github.kristenjestin.hippocampe.api.InboxSend
import io.github.kristenjestin.hippocampe.api.InboxSendKind
import io.github.kristenjestin.hippocampe.api.InboxSentKind
import io.github.kristenjestin.hippocampe.api.ORIGIN
import io.github.kristenjestin.hippocampe.api.Server
import java.io.File
import java.util.concurrent.TimeUnit

/** Sends what waits on the phone, oldest first. */
class Sender(
    private val dao: OutgoingDao,
    private val api: Api,
    private val server: suspend () -> Server?,
) {
    /**
     * Sends every waiting item; true when none is left to try again (each is in the inbox or
     * refused), false when the server could not take one now, or when no server is set yet.
     */
    suspend fun sendWaiting(): Boolean {
        val server = server() ?: return false
        for (item in dao.waiting()) {
            when (val answer = send(server, item)) {
                is Answer.Done -> dao.sent(item.clientId, answer.value.id)
                is Answer.Refused -> dao.refused(item.clientId, answer.message)
                is Answer.Failed -> return false
            }
            item.file?.let { File(it).delete() }
        }
        return true
    }

    private suspend fun send(server: Server, item: Outgoing) = when (item.kind) {
        InboxSentKind.Text, InboxSentKind.Url -> api.send(
            server,
            InboxSend(
                kind = if (item.kind == InboxSentKind.Url) InboxSendKind.Url else InboxSendKind.Text,
                text = item.text,
                url = item.url,
                origin = ORIGIN,
                note = item.note,
                clientId = item.clientId,
            ),
        )
        InboxSentKind.File -> {
            val file = item.file?.let(::File)
            if (file == null || !file.exists()) Answer.Refused(0, "The copy of this file is gone from the phone.")
            else api.upload(server, file, item.name ?: file.name, item.mime ?: "application/octet-stream", item.note, item.clientId)
        }
    }
}

/** Runs [Sender] when the network is there, again later with a growing delay while it cannot finish. */
class SendWorker(
    context: Context,
    parameters: WorkerParameters,
    private val sender: Sender,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = if (sender.sendWaiting()) Result.success() else Result.retry()

    companion object {
        const val NAME = "send"

        /**
         * Asks WorkManager to send, once the phone is online, now rather than after the delay of a
         * failed attempt; it keeps the request across restarts. An attempt cut short is harmless:
         * each item is sent again with its identifier.
         */
        fun schedule(work: WorkManager) {
            work.enqueueUniqueWork(
                NAME,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<SendWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build(),
            )
        }
    }
}
