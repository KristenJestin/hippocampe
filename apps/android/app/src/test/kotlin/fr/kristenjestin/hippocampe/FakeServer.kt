package fr.kristenjestin.hippocampe

import fr.kristenjestin.hippocampe.api.About
import fr.kristenjestin.hippocampe.api.AboutInstance
import fr.kristenjestin.hippocampe.api.Briefing
import fr.kristenjestin.hippocampe.api.EntryList
import fr.kristenjestin.hippocampe.api.HistoryPage
import fr.kristenjestin.hippocampe.api.InboxGave
import fr.kristenjestin.hippocampe.api.InboxSend
import fr.kristenjestin.hippocampe.api.InboxSent
import fr.kristenjestin.hippocampe.api.InboxSentKind
import fr.kristenjestin.hippocampe.api.InboxSentPage
import fr.kristenjestin.hippocampe.api.InboxSentStatus
import fr.kristenjestin.hippocampe.api.InboxSendKind
import fr.kristenjestin.hippocampe.api.SearchResult
import fr.kristenjestin.hippocampe.api.SearchResults
import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.api.TypeDefinition
import fr.kristenjestin.hippocampe.api.TypeList
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.net.ConnectException

/** What the inbox of [FakeServer] received. */
data class Received(
    val clientId: String,
    val kind: InboxSentKind,
    val text: String? = null,
    val url: String? = null,
    val name: String? = null,
    val bytes: String? = null,
    val note: String? = null,
    val origin: String? = null,
)

/**
 * A Hippocampe server for the tests, on Ktor's mock engine: its inbox keeps an item once per client
 * identifier, and it can be made unreachable, failing, refusing, or losing its answer.
 */
class FakeServer {
    val key = "hk_test_key_0123456789"
    var rights = setOf("read", "write")
    var reachable = true
    var failing: Int? = null
    var refusal: String? = null
    var loseNextAnswer = false
    var silentRefusal = false
    val inbox = mutableListOf<Received>()
    val requests = mutableListOf<HttpRequestData>()

    /** What the read API holds: the entries found by a search, the tree, the types. */
    var found = listOf<SearchResult>()
    var tree = listOf<TreeEntry>()

    /** The entries changed most recently, newest first: what `/api/entries?sort=updated` lists. */
    var recent = listOf<TreeEntry>()
    var types = listOf<TypeDefinition>()
    var briefing = briefingOf()

    /** Each entry as the API reads it, in JSON as the server writes it, by slug and by id. */
    val entries = mutableMapOf<String, String>()
    val histories = mutableMapOf<String, HistoryPage>()

    /** The files served under `/media`, by their address. */
    val media = mutableMapOf<String, ByteArray>()

    /** What agents made of an item, by client identifier. */
    val became = mutableMapOf<String, Triple<InboxSentStatus, String?, List<String>>>()

    private val json = Json { encodeDefaults = false }

    val engine = MockEngine { request ->
        requests += request
        if (!reachable) throw ConnectException("Connection refused")
        if (request.headers[HttpHeaders.Authorization] != "Bearer $key")
            return@MockEngine refuse(HttpStatusCode.Unauthorized, "This key is not known: it was revoked or mistyped.")
        val read = request.method == HttpMethod.Get
        if (read && "read" !in rights)
            return@MockEngine refuse(HttpStatusCode.Forbidden, "This key may not read: ask the owner of Hippocampe for a key with the right `read`.")
        if (!read && "write" !in rights)
            return@MockEngine refuse(HttpStatusCode.Forbidden, "This key may not write: ask the owner of Hippocampe for a key with the right `write`.")
        failing?.let { return@MockEngine refuse(HttpStatusCode.fromValue(it), "The server failed.") }
        when (request.url.encodedPath) {
            "/api/about" -> answer(json.encodeToString(About.serializer(), About(AboutInstance.Development, "Test bench", "1.0.0", "abc1234")))
            "/api/inbox" -> if (read) follow(request) else add(request)
            "/api/search" -> {
                val type = request.url.parameters["type"]
                val results = found.filter { type == null || it.type == type }
                answer(json.encodeToString(SearchResults.serializer(), SearchResults(results, results.size.toLong())))
            }
            "/api/briefing" -> answer(json.encodeToString(Briefing.serializer(), briefing))
            "/api/types" -> answer(json.encodeToString(TypeList.serializer(), TypeList(types)))
            "/api/entries" -> {
                val listed = if (request.url.parameters["sort"] == "updated") recent.take(request.url.parameters["limit"]?.toInt() ?: 50) else tree
                answer(json.encodeToString(EntryList.serializer(), EntryList(listed)))
            }
            else -> readEntry(request.url.encodedPath)
        }
    }

    private fun MockRequestHandleScope.readEntry(path: String): HttpResponseData {
        val medium = media[path]
        if (medium != null) return respond(medium, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "image/png"))
        val name = Regex("^/api/entries/([^/]+)(/history)?$").find(path) ?: return refuse(HttpStatusCode.NotFound, "Nothing here.")
        val entry = name.groupValues[1]
        if (entry !in entries) return refuse(HttpStatusCode.NotFound, "No entry is named `$entry`: search for it, or check its slug.")
        if (name.groupValues[2].isEmpty()) return answer(entries.getValue(entry))
        val page = histories[entry] ?: HistoryPage(emptyList(), null)
        return answer(json.encodeToString(HistoryPage.serializer(), page))
    }

    private suspend fun MockRequestHandleScope.add(request: HttpRequestData) = run {
        val body = request.body.toByteArray().decodeToString()
        val multipart = request.body.contentType?.match(ContentType.MultiPart.FormData) == true
        // As the server does: a file is a part named `file` with a file name, and a payload it cannot
        // read is refused with no sentence at all.
        if (multipart && !Regex("Content-Disposition: form-data; name=\"?file\"?; filename=").containsMatchIn(body))
            return@run respond("", HttpStatusCode.BadRequest)
        val item = if (multipart) {
            fun part(name: String) = Regex("name=\"?$name\"?[^\\r\\n]*\\r\\n(?:[^\\r\\n]+\\r\\n)*\\r\\n(.*?)\\r\\n--", RegexOption.DOT_MATCHES_ALL)
                .find(body)?.groupValues?.get(1)
            Received(
                part("client_id").orEmpty(),
                InboxSentKind.File,
                name = part("name"),
                bytes = part("file"),
                note = part("note"),
                origin = part("origin"),
            )
        } else {
            val sent = try {
                json.decodeFromString(InboxSend.serializer(), body)
            } catch (failure: Exception) {
                return@run refuse(HttpStatusCode.BadRequest, "An item of the inbox is a text, a URL or a file.")
            }
            Received(
                sent.clientId.orEmpty(),
                if (sent.kind == InboxSendKind.Url) InboxSentKind.Url else InboxSentKind.Text,
                text = sent.text,
                url = sent.url,
                note = sent.note,
                origin = sent.origin,
            )
        }
        refusal?.let { return@run refuse(HttpStatusCode.BadRequest, it) }
        if (silentRefusal) return@run respond("", HttpStatusCode.BadRequest)
        if (inbox.none { it.clientId == item.clientId }) inbox += item
        if (loseNextAnswer) {
            loseNextAnswer = false
            throw ConnectException("Connection reset")
        }
        answer(json.encodeToString(InboxSent.serializer(), sent(item)))
    }

    private fun MockRequestHandleScope.follow(request: HttpRequestData) = run {
        val asked = request.url.parameters.getAll("client_id").orEmpty()
        val items = inbox.filter { it.clientId in asked }.reversed().map(::sent)
        answer(json.encodeToString(InboxSentPage.serializer(), InboxSentPage(items, null)))
    }

    /** The inbox's own identifier of an item. */
    fun idOf(clientId: String) = "inbox-${inbox.indexOfFirst { it.clientId == clientId }}"

    private fun sent(item: Received): InboxSent {
        val (status, reason, titles) = became[item.clientId] ?: Triple(InboxSentStatus.Pending, null, emptyList())
        return InboxSent(
            id = idOf(item.clientId),
            clientId = item.clientId,
            kind = item.kind,
            name = item.name,
            size = null,
            mime = null,
            origin = item.origin.orEmpty(),
            receivedAt = "2026-01-02T03:04:05.000Z",
            status = status,
            reason = reason,
            entries = titles.mapIndexed { index, title -> InboxGave("entry-$index", "entry-$index", title, "note") },
        )
    }

    private fun MockRequestHandleScope.answer(body: String) =
        respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))

    private fun MockRequestHandleScope.refuse(status: HttpStatusCode, message: String) =
        respond(
            """{"_tag":"Refused","message":${Json.encodeToString(String.serializer(), message)}}""",
            status,
            headersOf(HttpHeaders.ContentType, "application/json"),
        )
}
