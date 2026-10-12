package fr.kristenjestin.hippocampe

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.testing.WorkManagerTestInitHelper
import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.warn.HeadsUpWorker
import fr.kristenjestin.hippocampe.warn.Notifier
import fr.kristenjestin.hippocampe.warn.Warner
import fr.kristenjestin.hippocampe.warn.Warnings
import fr.kristenjestin.hippocampe.warn.permissionMustBeAsked
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
class NotificationsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val address = "http://hippocampe.test:3000"
    private val server = FakeServer()
    private val folder: File = Files.createTempDirectory("notifications").toFile()
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private val store = PreferenceDataStoreFactory.create(scope = scope) { File(folder, "warnings.preferences_pb") }
    private lateinit var work: WorkManager
    private val warnings = Warnings(store) { work }
    private val warner = Warner(Api(server.engine), { Server(address, server.key) }, warnings, Notifier(context))
    private val manager = context.getSystemService(NotificationManager::class.java)

    private val factory = object : WorkerFactory() {
        override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
            HeadsUpWorker(appContext, workerParameters, warner)
    }

    init {
        shadowOf(context as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        WorkManagerTestInitHelper.initializeTestWorkManager(
            context,
            Configuration.Builder().setExecutor(SynchronousExecutor()).setWorkerFactory(factory).build(),
        )
        work = WorkManager.getInstance(context)
    }

    @After
    fun close() {
        scope.cancel()
        folder.deleteRecursively()
    }

    private fun posted() = shadowOf(manager).allNotifications

    private fun Notification.title() = extras.getCharSequence(Notification.EXTRA_TITLE).toString()

    private fun Notification.text() = extras.getCharSequence(Notification.EXTRA_TEXT).toString()

    private fun run(): ListenableWorker.Result =
        runBlocking { TestListenableWorkerBuilder<HeadsUpWorker>(context).setWorkerFactory(factory).build().doWork() }

    @Test
    fun `a heads-up gives one notification, once`() {
        runBlocking { warnings.turn(true) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds, camilleBirthday))

        assertEquals(ListenableWorker.Result.success(), run())
        assertEquals(
            listOf("Camille Test" to "Birthday: in 6 days (18 October 2026)", "Internet plan" to "End: in 39 days (20 November 2026)"),
            posted().map { it.title() to it.text() }.sortedBy { it.first },
        )

        // The next day it is the same occurrence, a day closer: the owner is not warned again.
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds.copy(daysLeft = 38), camilleBirthday.copy(daysLeft = 5)))
        run()
        assertEquals(2, posted().size)

        // A new one is warned of, alone.
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds, camilleBirthday, warrantyEnds))
        run()
        assertEquals(listOf("Washing machine"), posted().map { it.title() }.filter { it !in listOf("Camille Test", "Internet plan") })
        assertEquals(3, posted().size)

        // A date that comes back next year is another occurrence.
        server.briefing = briefingOf(headsUp = listOf(camilleBirthday.copy(id = "id-camille-test:birthday:2027-10-18", date = "2027-10-18")))
        run()
        assertEquals(4, posted().size)
    }

    @Test
    fun `reading the briefing without being asked to warn tells no one`() {
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))

        assertEquals(ListenableWorker.Result.success(), run())

        assertEquals(emptyList<Notification>(), posted())
        assertTrue("the server is not even asked", server.requests.none { it.url.encodedPath == "/api/briefing" })
    }

    @Test
    fun `a heads-up that could not be shown is warned of once notifications are allowed`() {
        runBlocking { warnings.turn(true) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        shadowOf(context as Application).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)

        run()
        assertEquals(emptyList<Notification>(), posted())

        shadowOf(context as Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        run()
        assertEquals(listOf("Internet plan"), posted().map { it.title() })
    }

    @Test
    fun `a notification has a channel of its own`() {
        runBlocking { warnings.turn(true) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))

        run()

        val channel = manager.getNotificationChannel(posted().single().channelId)
        assertEquals("Due dates", channel.name.toString())
    }

    @Test
    fun `notifications can be turned off`() {
        runBlocking { warnings.turn(true) }
        val daily = work.getWorkInfosForUniqueWork("heads-up").get().single()
        assertEquals(WorkInfo.State.ENQUEUED, daily.state)
        assertEquals(TimeUnit.DAYS.toMillis(1), daily.periodicityInfo!!.repeatIntervalMillis)
        assertEquals(NetworkType.CONNECTED, daily.constraints.requiredNetworkType)
        assertTrue(runBlocking { warnings.on.first() })

        runBlocking { warnings.turn(false) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))
        run()

        assertFalse(runBlocking { warnings.on.first() })
        assertEquals(WorkInfo.State.CANCELLED, work.getWorkInfosForUniqueWork("heads-up").get().single().state)
        assertEquals(emptyList<Notification>(), posted())

        runBlocking { warnings.turn(true) }
        assertEquals(WorkInfo.State.ENQUEUED, work.getWorkInfosForUniqueWork("heads-up").get().last().state)
    }

    @Test
    fun `the permission is asked when notifications are turned on from Android 13`() {
        assertFalse(permissionMustBeAsked(sdk = 32, granted = false))
        assertTrue(permissionMustBeAsked(sdk = 33, granted = false))
        assertFalse(permissionMustBeAsked(sdk = 36, granted = true))
    }

    @Test
    fun `a server that cannot be reached is tried again later and a refusal is not`() {
        runBlocking { warnings.turn(true) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds))

        server.reachable = false
        assertEquals(ListenableWorker.Result.retry(), run())

        server.reachable = true
        server.rights = emptySet()
        assertEquals(ListenableWorker.Result.failure(), run())
        assertEquals(emptyList<Notification>(), posted())

        server.rights = setOf("read")
        assertEquals(ListenableWorker.Result.success(), run())
        assertEquals(1, posted().size)
    }

    @Test
    fun `the warner says how many it warned of`() {
        runBlocking { warnings.turn(true) }
        server.briefing = briefingOf(headsUp = listOf(internetPlanEnds, camilleBirthday))

        assertEquals(Answer.Done(2), runBlocking { warner.warn() })
        assertEquals(Answer.Done(0), runBlocking { warner.warn() })
    }
}
