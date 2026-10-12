package fr.kristenjestin.hippocampe

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.ListenableWorker
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.outbox.Outbox
import fr.kristenjestin.hippocampe.outbox.OutboxDatabase
import fr.kristenjestin.hippocampe.outbox.SendWorker
import fr.kristenjestin.hippocampe.outbox.Sender
import java.io.File
import java.nio.file.Files

/** The application's parts around a [FakeServer], as [Graph] assembles them, on an in-memory database. */
class Fixture {
    val context: Context = ApplicationProvider.getApplicationContext()
    val server = FakeServer()
    val api = Api(server.engine)
    val database = Room.inMemoryDatabaseBuilder(context, OutboxDatabase::class.java).allowMainThreadQueries().build()
    val dao = database.outgoing()
    val folder: File = Files.createTempDirectory("outbox").toFile()

    /** The key the phone holds in its settings; changing it is saving other settings. */
    var key = server.key
    val sender = Sender(dao, api) { Server("http://hippocampe.test:3000", key) }

    private val factory = object : WorkerFactory() {
        override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
            SendWorker(appContext, workerParameters, sender)
    }

    val work: WorkManager = run {
        WorkManagerTestInitHelper.initializeTestWorkManager(
            context,
            Configuration.Builder().setExecutor(SynchronousExecutor()).setWorkerFactory(factory).build(),
        )
        WorkManager.getInstance(context)
    }

    val outbox = Outbox(dao, folder, { SendWorker.schedule(work) })

    /** Runs the worker once, as WorkManager would. */
    suspend fun attempt(): ListenableWorker.Result =
        TestListenableWorkerBuilder<SendWorker>(context).setWorkerFactory(factory).build().doWork()

    fun close() {
        database.close()
        folder.deleteRecursively()
    }
}
