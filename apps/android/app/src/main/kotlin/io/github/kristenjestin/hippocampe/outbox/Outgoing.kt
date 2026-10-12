package io.github.kristenjestin.hippocampe.outbox

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import io.github.kristenjestin.hippocampe.api.InboxSentKind
import kotlinx.coroutines.flow.Flow

/** Where a thing to send stands on the phone. */
enum class Standing {
    /** Kept on the phone until the server takes it. */
    Waiting,

    /** In the inbox: [Outgoing.inboxId] names it there. */
    Sent,

    /** Refused by the server for a reason a retry cannot fix, said in [Outgoing.refusal]. */
    Refused,
}

/**
 * A thing to put into the inbox, kept on the phone from the moment it is given: a text, a link, or
 * a file copied into the application's own storage ([file]). [clientId] is chosen at once and sent
 * with every attempt, so that the server keeps it once.
 */
@Entity(tableName = "outgoing")
data class Outgoing(
    @PrimaryKey val clientId: String,
    val kind: InboxSentKind,
    val text: String? = null,
    val url: String? = null,
    val file: String? = null,
    val name: String? = null,
    val mime: String? = null,
    val size: Long? = null,
    val note: String? = null,
    val createdAt: Long,
    val standing: Standing = Standing.Waiting,
    val refusal: String? = null,
    val inboxId: String? = null,
)

@Dao
interface OutgoingDao {
    @Insert
    suspend fun insert(items: List<Outgoing>)

    @Query("SELECT * FROM outgoing ORDER BY createdAt DESC, rowid DESC")
    fun all(): Flow<List<Outgoing>>

    @Query("SELECT * FROM outgoing WHERE standing = 'Waiting' ORDER BY createdAt, rowid")
    suspend fun waiting(): List<Outgoing>

    @Query("SELECT * FROM outgoing WHERE clientId = :clientId")
    suspend fun get(clientId: String): Outgoing?

    @Query("UPDATE outgoing SET standing = 'Sent', inboxId = :inboxId, file = NULL WHERE clientId = :clientId")
    suspend fun sent(clientId: String, inboxId: String)

    @Query("UPDATE outgoing SET standing = 'Refused', refusal = :refusal, file = NULL WHERE clientId = :clientId")
    suspend fun refused(clientId: String, refusal: String)

    @Query("DELETE FROM outgoing WHERE clientId = :clientId AND standing != 'Sent'")
    suspend fun delete(clientId: String): Int
}

@Database(entities = [Outgoing::class], version = 1)
abstract class OutboxDatabase : RoomDatabase() {
    abstract fun outgoing(): OutgoingDao
}
