package fr.kristenjestin.hippocampe.warn

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.kristenjestin.hippocampe.R
import fr.kristenjestin.hippocampe.api.Answer
import fr.kristenjestin.hippocampe.api.Api
import fr.kristenjestin.hippocampe.api.BriefingOccurrence
import fr.kristenjestin.hippocampe.api.Server
import fr.kristenjestin.hippocampe.home.dueLine
import fr.kristenjestin.hippocampe.read.Reading
import fr.kristenjestin.hippocampe.ui.MainActivity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.concurrent.TimeUnit

/** Whether the owner wants to be warned, and of which dates the phone has warned them already. */
class Warnings(private val store: DataStore<Preferences>, private val work: () -> WorkManager) {
    val on: Flow<Boolean> = store.data.map { it[ON] == true }

    /** Turns the warnings on, with the daily job that asks the server once the phone is online, or off. */
    suspend fun turn(on: Boolean) {
        store.edit { it[ON] = on }
        if (on) {
            work().enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<HeadsUpWorker>(1, TimeUnit.DAYS)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build(),
            )
        } else {
            work().cancelUniqueWork(NAME)
        }
    }

    /** The identifiers of the occurrences already warned of: an occurrence warns once, not each day. */
    suspend fun warned(): Set<String> = store.data.first()[WARNED].orEmpty()

    suspend fun remember(id: String) = store.edit { it[WARNED] = it[WARNED].orEmpty() + id }

    private companion object {
        const val NAME = "heads-up"
        val ON = booleanPreferencesKey("warn")
        val WARNED = stringSetPreferencesKey("warned")
    }
}

/** From Android 13 on, notifying needs a permission the owner gives; it is asked when they turn the warnings on. */
fun permissionMustBeAsked(sdk: Int, granted: Boolean) = sdk >= Build.VERSION_CODES.TIRAMISU && !granted

/** Shows a heads-up as a notification of its own channel, which opens the entry it is about. */
class Notifier(private val context: Context) {
    private val manager = NotificationManagerCompat.from(context)

    /** Whether the phone lets this application notify: the permission, and the notifications not switched off. */
    fun allowed(): Boolean = !permissionMustBeAsked(Build.VERSION.SDK_INT, permitted(context)) && manager.areNotificationsEnabled()

    // The permission is checked by allowed(), which the one caller asks first.
    @SuppressLint("MissingPermission")
    fun notify(occurrence: BriefingOccurrence) {
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName(context.getString(R.string.warn_channel))
                .setDescription(context.getString(R.string.warn_channel_about))
                .build(),
        )
        val open = Intent(Intent.ACTION_VIEW, Uri.parse("hippocampe://entry/${Uri.encode(occurrence.entry.slug)}"), context, MainActivity::class.java)
        manager.notify(
            occurrence.id,
            0,
            NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(occurrence.entry.title)
                .setContentText(dueLine(context.resources, occurrence))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(
                    PendingIntent.getActivity(context, occurrence.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
                )
                .build(),
        )
    }

    companion object {
        const val CHANNEL = "heads-up"

        /** Whether the owner gave the permission to notify. */
        fun permitted(context: Context) =
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
}

/** Asks the server for the heads-ups and notifies each one the owner was not warned of yet. */
class Warner(
    private val api: Api,
    private val server: suspend () -> Server?,
    private val warnings: Warnings,
    private val notifier: Notifier,
) {
    /** How many occurrences it warned of; nothing is asked of the server while the warnings are off. */
    suspend fun warn(): Answer<Int> {
        if (!warnings.on.first()) return Answer.Done(0)
        val server = server() ?: return Answer.Refused(0, Reading.UNSET)
        val briefing = when (val answer = api.briefing(server, "today")) {
            is Answer.Done -> answer.value
            is Answer.Refused -> return answer
            is Answer.Failed -> return answer
        }
        // What cannot be shown is not marked as warned: it will be, once the phone allows it.
        if (!notifier.allowed()) return Answer.Done(0)
        val warned = warnings.warned()
        val fresh = briefing.headsUp.filter { it.id !in warned }
        fresh.forEach {
            notifier.notify(it)
            warnings.remember(it.id)
        }
        return Answer.Done(fresh.size)
    }
}

/** The daily job: [Warner] when the phone is online, again later while the server cannot be reached. */
class HeadsUpWorker(context: Context, parameters: WorkerParameters, private val warner: Warner) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = when (warner.warn()) {
        is Answer.Done -> Result.success()
        // A refusal is a matter of the settings (the key), not of the moment.
        is Answer.Refused -> Result.failure()
        is Answer.Failed -> Result.retry()
    }
}
