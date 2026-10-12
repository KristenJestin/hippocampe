package fr.kristenjestin.hippocampe

import android.app.Application
import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Room
import androidx.work.Configuration
import androidx.work.ListenableWorker
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.outbox.Outbox
import fr.kristenjestin.hippocampe.outbox.OutboxDatabase
import fr.kristenjestin.hippocampe.outbox.SendWorker
import fr.kristenjestin.hippocampe.outbox.Sender
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.settings.KeystoreCipher
import fr.kristenjestin.hippocampe.settings.SettingsCheck
import fr.kristenjestin.hippocampe.settings.SettingsStore
import io.ktor.client.engine.okhttp.OkHttp
import java.io.File

private val Context.preferences by preferencesDataStore("settings")

/** What the application is made of, built once. */
class Graph(context: Context) {
    val api = Api(OkHttp.create())
    val settings = SettingsStore(context.preferences, KeystoreCipher())
    val check = SettingsCheck(api)
    val reading = Reading(api, settings::server)
    private val database = Room.databaseBuilder(context, OutboxDatabase::class.java, "outbox").build()
    val work: WorkManager by lazy { WorkManager.getInstance(context) }
    val outbox = Outbox(database.outgoing(), File(context.filesDir, "outbox"), { SendWorker.schedule(work) })
    val sender = Sender(database.outgoing(), api, settings::server)
}

class HippocampeApp : Application(), Configuration.Provider {
    val graph by lazy { Graph(this) }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(
                object : WorkerFactory() {
                    override fun createWorker(
                        appContext: Context,
                        workerClassName: String,
                        workerParameters: WorkerParameters,
                    ): ListenableWorker? =
                        if (workerClassName == SendWorker::class.java.name) SendWorker(appContext, workerParameters, graph.sender)
                        else null
                },
            )
            .build()
}

val Context.graph: Graph get() = (applicationContext as HippocampeApp).graph
