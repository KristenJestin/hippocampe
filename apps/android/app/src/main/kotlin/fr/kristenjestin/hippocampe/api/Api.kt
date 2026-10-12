package fr.kristenjestin.hippocampe.api

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.quote
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.io.IOException

/** A Hippocampe server and the key the application speaks to it with. */
data class Server(val address: String, val key: String) {
    override fun toString() = "Server($address)"
}

/** What the server answered, or why it did not. */
sealed interface Answer<out T> {
    data class Done<T>(val value: T) : Answer<T>

    /** The server refused, in its own sentence: asking again the same way changes nothing. */
    data class Refused(val status: Int, val message: String) : Answer<Nothing>

    /** The server could not be reached, or failed: asking again later may work. */
    data class Failed(val message: String) : Answer<Nothing>
}

/** The name every item sent from the application carries, to follow it by origin. */
const val ORIGIN = "android"

/** The read API and the inbox, over HTTP; the engine is OkHttp in the application, a mock in tests. */
class Api(engine: HttpClientEngine) {
    private val json = Json { ignoreUnknownKeys = true }

    private val http = HttpClient(engine) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            connectTimeoutMillis = 15_000
            requestTimeoutMillis = 120_000
        }
    }

    /** Which instance the server is, which needs the right `read`. */
    suspend fun about(server: Server): Answer<About> =
        call(server) { http.get(url(server, "/api/about")) { bearerAuth(server.key) } }

    /**
     * Whether the key may add to the inbox, without adding anything: an empty item is refused for
     * what it lacks (400) only once the key is known to hold the right `write`, and for the key
     * (403) otherwise.
     */
    suspend fun mayWrite(server: Server): Answer<Unit> {
        val answer = call<Unit>(server) {
            http.post(url(server, "/api/inbox")) {
                bearerAuth(server.key)
                contentType(ContentType.Application.Json)
                setBody("{}")
            }
        }
        return if (answer is Answer.Refused && answer.status == 400) Answer.Done(Unit) else answer
    }

    /** Puts a text or a link in the inbox. */
    suspend fun send(server: Server, item: InboxSend): Answer<InboxSent> =
        call(server) {
            http.post(url(server, "/api/inbox")) {
                bearerAuth(server.key)
                contentType(ContentType.Application.Json)
                setBody(item)
            }
        }

    /** Puts a file in the inbox, as itself. */
    suspend fun upload(
        server: Server,
        file: File,
        name: String,
        mime: String,
        note: String?,
        clientId: String,
    ): Answer<InboxSent> =
        call(server) {
            http.submitFormWithBinaryData(
                url(server, "/api/inbox"),
                formData {
                    append(
                        "file",
                        file.readBytes(),
                        Headers.build {
                            append(HttpHeaders.ContentType, mime)
                            // Ktor writes `form-data; name="file"` before it: a part with a file name is a file.
                            append(HttpHeaders.ContentDisposition, "filename=${name.quote()}")
                        },
                    )
                    append("name", name)
                    append("origin", ORIGIN)
                    if (note != null) append("note", note)
                    append("client_id", clientId)
                },
            ) { bearerAuth(server.key) }
        }

    /** What became of the items sent with these identifiers, newest first. */
    suspend fun follow(server: Server, clientIds: List<String>): Answer<InboxSentPage> =
        call(server) {
            http.get(url(server, "/api/inbox")) {
                bearerAuth(server.key)
                clientIds.forEach { parameter("client_id", it) }
                parameter("limit", clientIds.size.coerceIn(1, 200))
            }
        }

    private fun url(server: Server, path: String) = server.address.trimEnd('/') + path

    private suspend inline fun <reified T> call(
        server: Server,
        request: () -> HttpResponse,
    ): Answer<T> {
        val response = try {
            request()
        } catch (failure: IOException) {
            return Answer.Failed(unreachable(server))
        }
        val status = response.status.value
        return when {
            status in 200..299 -> try {
                Answer.Done(response.body<T>())
            } catch (failure: Exception) {
                when (failure) {
                    is SerializationException, is IllegalArgumentException, is IOException ->
                        Answer.Refused(status, notHippocampe(server))
                    else -> throw failure
                }
            }
            status == 408 || status == 429 || status >= 500 ->
                Answer.Failed(sentence(response) ?: "Hippocampe answered $status: it will be tried again.")
            else -> Answer.Refused(
                status,
                sentence(response)
                    ?: if (status == 404) notHippocampe(server) else "Hippocampe refused it ($status) without saying why.",
            )
        }
    }

    /** The sentence a refusal carries in its `message`, if it has one. */
    private suspend fun sentence(response: HttpResponse): String? = try {
        json.parseToJsonElement(response.bodyAsText()).jsonObject["message"]?.jsonPrimitive?.contentOrNull
    } catch (failure: Exception) {
        null
    }

    companion object {
        fun unreachable(server: Server) =
            "Hippocampe cannot be reached at ${server.address}: check the address and the network."

        fun notHippocampe(server: Server) =
            "${server.address} does not answer as Hippocampe: check the address."
    }
}
