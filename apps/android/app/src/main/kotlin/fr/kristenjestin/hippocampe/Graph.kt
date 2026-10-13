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
import fr.kristenjestin.hippocampe.home.Home
import fr.kristenjestin.hippocampe.home.HomeStore
import fr.kristenjestin.hippocampe.outbox.Outbox
import fr.kristenjestin.hippocampe.outbox.OutboxDatabase
import fr.kristenjestin.hippocampe.outbox.SendWorker
import fr.kristenjestin.hippocampe.outbox.Sender
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.settings.KeyCipher
import fr.kristenjestin.hippocampe.settings.KeystoreCipher
import fr.kristenjestin.hippocampe.settings.SettingsCheck
import fr.kristenjestin.hippocampe.settings.SettingsStore
import fr.kristenjestin.hippocampe.warn.HeadsUpWorker
import fr.kristenjestin.hippocampe.warn.Notifier
import fr.kristenjestin.hippocampe.warn.Warner
import fr.kristenjestin.hippocampe.warn.Warnings
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import java.io.File

/** Internal so that a test can empty the settings: one DataStore outlives every test of a JVM. */
internal val Context.preferences by preferencesDataStore("settings")
private val Context.briefings by preferencesDataStore("briefing")

/** What the application is made of, built once. */
class Graph(
    context: Context,
    engine: HttpClientEngine = OkHttp.create(),
    cipher: KeyCipher = KeystoreCipher(),
) {
    val api = Api(engine)
    val settings = SettingsStore(context.preferences, cipher)
    val check = SettingsCheck(api)
    val reading = Reading(api, settings::server)
    private val briefings = context.briefings
    val home = Home(reading, HomeStore(briefings), settings::server)
    val warnings = Warnings(briefings) { work }
    val warner = Warner(api, settings::server, warnings, Notifier(context))
    private val database = Room.databaseBuilder(context, OutboxDatabase::class.java, "outbox").build()
    val work: WorkManager by lazy { WorkManager.getInstance(context) }
    val outbox = Outbox(database.outgoing(), File(context.filesDir, "outbox"), { SendWorker.schedule(work) })
    val sender = Sender(database.outgoing(), api, settings::server)
}

open class HippocampeApp : Application(), Configuration.Provider {
    open val graph: Graph by lazy { Graph(this) }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(
                object : WorkerFactory() {
                    override fun createWorker(
                        appContext: Context,
                        workerClassName: String,
                        workerParameters: WorkerParameters,
                    ): ListenableWorker? =
                        when (workerClassName) {
                            SendWorker::class.java.name -> SendWorker(appContext, workerParameters, graph.sender)
                            HeadsUpWorker::class.java.name -> HeadsUpWorker(appContext, workerParameters, graph.warner)
                            else -> null
                        }
                },
            )
            .build()
}

val Context.graph: Graph get() = (applicationContext as HippocampeApp).graph
