package fr.kristenjestin.hippocampe

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import fr.kristenjestin.hippocampe.api.InboxSentKind
import fr.kristenjestin.hippocampe.outbox.Draft
import fr.kristenjestin.hippocampe.outbox.shared
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.nio.file.Files

/** Another application's files, shared for as long as the test lets it. */
class SharingApp : ContentProvider() {
    override fun onCreate() = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, arguments: Array<out String>?, order: String?): Cursor =
        MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME)).apply { addRow(arrayOf(uri.lastPathSegment)) }

    override fun getType(uri: Uri) = "image/jpeg"

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (uri.lastPathSegment == "withheld.jpg") throw SecurityException("No access to $uri")
        return ParcelFileDescriptor.open(File(folder, uri.lastPathSegment!!), ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?) = null

    override fun delete(uri: Uri, selection: String?, arguments: Array<out String>?) = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, arguments: Array<out String>?) = 0

    companion object {
        lateinit var folder: File
    }
}

@RunWith(RobolectricTestRunner::class)
class ShareTest {
    private val fixture = Fixture()
    private val resolver = fixture.context.contentResolver
    private val shared: File = Files.createTempDirectory("shared").toFile()

    @Before
    fun share() {
        SharingApp.folder = shared
        Robolectric.setupContentProvider(SharingApp::class.java, "org.example.gallery")
    }

    @After
    fun close() {
        fixture.close()
        shared.deleteRecursively()
    }

    private fun image(name: String, content: String): Uri {
        File(shared, name).writeText(content)
        return Uri.parse("content://org.example.gallery/$name")
    }

    private fun text(text: String) = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)

    @Test
    fun `a shared link becomes a url item with its note`() = runBlocking {
        val drafts = fixture.outbox.shared(text("  https://example.org/articles/tide-tables  "), resolver)
        assertEquals(listOf(Draft.Link("https://example.org/articles/tide-tables")), drafts)

        fixture.outbox.add(drafts, " for the sailing trip ")
        fixture.attempt()

        val item = fixture.server.inbox.single()
        assertEquals(InboxSentKind.Url, item.kind)
        assertEquals("https://example.org/articles/tide-tables", item.url)
        assertEquals("for the sailing trip", item.note)
        assertEquals("android", item.origin)
    }

    @Test
    fun `a shared text becomes a text item`() = runBlocking {
        val drafts = fixture.outbox.shared(text("Buy oat milk\nand see https://example.org/shop"), resolver)
        fixture.outbox.add(drafts, "")
        fixture.attempt()

        val item = fixture.server.inbox.single()
        assertEquals(InboxSentKind.Text, item.kind)
        assertEquals("Buy oat milk\nand see https://example.org/shop", item.text)
        assertEquals(null, item.note)
    }

    @Test
    fun `a shared image is copied at once and sent as a file`() = runBlocking {
        val uri = image("harbour.jpg", "pixels of a harbour")
        val intent = Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM, uri)

        val copy = fixture.outbox.shared(intent, resolver).single() as Draft.Copy
        // The application that shared it takes it back: only the copy is left.
        File(shared, "harbour.jpg").delete()
        assertTrue(File(copy.path).startsWith(fixture.folder))
        assertEquals(Draft.Copy(copy.path, "harbour.jpg", "image/jpeg", 19), copy)

        fixture.outbox.add(listOf(copy), "the view from the pier")
        fixture.attempt()

        val item = fixture.server.inbox.single()
        assertEquals(InboxSentKind.File, item.kind)
        assertEquals("harbour.jpg", item.name)
        assertEquals("pixels of a harbour", item.bytes)
        assertEquals("the view from the pier", item.note)
        assertTrue("the copy is gone once the inbox has it", !File(copy.path).exists())
    }

    @Test
    fun `several shared images become one item each`() = runBlocking {
        val uris = arrayListOf(image("one.jpg", "first"), image("two.jpg", "second"), image("three.jpg", "third"))
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)

        val drafts = fixture.outbox.shared(intent, resolver)
        val items = fixture.outbox.add(drafts, "labels of the jars")
        fixture.attempt()

        assertEquals(3, items.map { it.clientId }.toSet().size)
        assertEquals(listOf("one.jpg", "two.jpg", "three.jpg"), fixture.server.inbox.map { it.name })
        assertEquals(listOf("first", "second", "third"), fixture.server.inbox.map { it.bytes })
        assertTrue(fixture.server.inbox.all { it.note == "labels of the jars" && it.kind == InboxSentKind.File })
    }

    @Test
    fun `a shared file the phone may not read is left out without closing the sheet`() {
        val uris = arrayListOf(image("one.jpg", "first"), Uri.parse("content://org.example.gallery/withheld.jpg"))
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("image/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)

        val drafts = fixture.outbox.shared(intent, resolver)

        assertEquals(listOf("one.jpg"), drafts.map { (it as Draft.Copy).name })
        assertEquals("no copy is left behind for it", 1, fixture.folder.listFiles()!!.size)
    }
}
