package fr.kristenjestin.hippocampe

import android.util.Base64
import fr.kristenjestin.hippocampe.api.Briefing
import fr.kristenjestin.hippocampe.api.BriefingOccurrence
import fr.kristenjestin.hippocampe.api.BriefingOccurrenceEntry
import fr.kristenjestin.hippocampe.api.BriefingWaiting
import fr.kristenjestin.hippocampe.api.BriefingWaitingInbox
import fr.kristenjestin.hippocampe.api.BriefingWaitingPendingReferences
import fr.kristenjestin.hippocampe.api.BriefingWaitingSupposed
import fr.kristenjestin.hippocampe.api.FieldDefinition
import fr.kristenjestin.hippocampe.api.FieldDefinitionKind
import fr.kristenjestin.hippocampe.api.SearchResult
import fr.kristenjestin.hippocampe.api.TreeEntry
import fr.kristenjestin.hippocampe.api.TreePlace
import fr.kristenjestin.hippocampe.api.TypeDefinition

/** A 1×1 PNG, the file behind every image the fake server serves. */
val PIXEL: ByteArray = Base64.decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    Base64.DEFAULT,
)

/** A tiny PDF-ish file, the one behind the medium that is not an image. */
val CARD: ByteArray = "%PDF-1.4 a printable card".encodeToByteArray()

val recipeTypes = listOf(
    TypeDefinition(
        name = "recipe",
        label = "Recipe",
        description = "A recipe.",
        fields = listOf(
            FieldDefinition("servings", FieldDefinitionKind.Integer),
            FieldDefinition("prep_time", FieldDefinitionKind.Duration),
            FieldDefinition("difficulty", FieldDefinitionKind.Enum, values = listOf("easy", "hard")),
            FieldDefinition("website", FieldDefinitionKind.Url),
            FieldDefinition("source", FieldDefinitionKind.Entry, types = listOf("book")),
            FieldDefinition("budget", FieldDefinitionKind.Money, sensitive = true),
            FieldDefinition("season", FieldDefinitionKind.Text),
        ),
    ),
    TypeDefinition(name = "book", label = "Book", description = "A book.", fields = emptyList()),
    TypeDefinition(
        name = "component",
        label = "Component",
        description = "A part of a recipe.",
        fields = listOf(FieldDefinition("weight", FieldDefinitionKind.Text)),
    ),
)

fun found(slug: String, title: String, type: String, path: List<String>, excerpt: String) =
    SearchResult(id = "id-$slug", slug = slug, type = type, title = title, summary = "", path = path, excerpt = excerpt, rank = 1.0)

val someResults = listOf(
    found("plum-tart", "Plum tart", "recipe", listOf("Kitchen", "Desserts"), "A <mark>plum</mark> tart with <mark>plums</mark>."),
    found("orchard-cookbook", "Orchard cookbook", "book", emptyList(), "Every <mark>plum</mark> variety."),
)

private fun place(id: String, inParent: Boolean = false) = TreePlace(id, inParent)

/** A small tree: two top-level entries, a recipe under the first, a part of it, and a note under the part. */
val someTree = listOf(
    TreeEntry("10-kitchen", "kitchen", "area", "Kitchen", emptyList()),
    TreeEntry("12-garage", "garage", "area", "Garage", emptyList()),
    TreeEntry("01-plum-tart", "plum-tart", "recipe", "Plum tart", listOf(place("10-kitchen"))),
    TreeEntry("05-crust-part", "tart-crust", "component", "Tart crust", listOf(place("01-plum-tart", inParent = true))),
    TreeEntry("13-oven", "oven-notes", "note", "Oven notes", listOf(place("05-crust-part"))),
)

/**
 * The entry `plum-tart` as the read API gives it, in JSON as the server writes it: every field, a
 * known value and a supposed one, a value the key may not read, an entry field, a body with
 * references and an image, links both ways, parts, dated parts, a file and an image.
 */
fun plumTart(
    provenance: String = """{"servings":"extracted","season":"inferred","difficulty":"extracted"}""",
    body: String = "## Method\\n\\nRoll the **crust** thin, see [[crust-basics]] and [[crust-basics|the basics]]. " +
        "Ask [[nobody-yet]].\\n\\n- 800 g plums\\n- 1 sheet of pastry\\n\\n![The finished tart](/media/aa11)\\n\\n" +
        "Source: [the site](https://example.org/plum-tart)",
    backlinkProvenance: String = "inferred",
) = """
{
  "entry": {
    "id": "01-plum-tart", "type": "recipe", "title": "Plum tart", "slug": "plum-tart",
    "aliases": [], "tags": ["dessert"],
    "fields": {
      "servings": 6, "prep_time": "PT30M", "difficulty": "easy", "website": "https://example.org/plum-tart",
      "source": "01-cookbook", "budget": "[hidden]", "season": "late summer"
    },
    "provenance": $provenance,
    "sources": [],
    "body": "$body",
    "summary": "A tart of the late plums.",
    "created": "2026-08-01T10:00:00.000Z", "updated": "2026-09-30T08:00:00.000Z",
    "valid_from": null, "valid_until": null, "superseded_by": null, "archived_at": null, "archived_reason": null
  },
  "path": ["Kitchen", "Desserts"],
  "part_of": [],
  "references": [
    {"reference": "crust-basics", "id": "02-crust", "title": "Crust basics"},
    {"reference": "nobody-yet", "id": null, "title": null}
  ],
  "ancestors": [{"id": "10-kitchen", "title": "Kitchen"}, {"id": "11-desserts", "title": "Desserts"}],
  "links": [
    {"relation": "uses", "period": null, "field": null, "provenance": "extracted", "note": "from the pantry",
     "valid_from": "2026-01-01", "valid_until": null, "id": "03-jam", "slug": "plum-jam", "title": "Plum jam"}
  ],
  "media": [
    {"id": "m1", "kind": "image", "mime": "image/png", "size": 48210, "sha256": "aa11", "width": 1, "height": 1,
     "duration": null, "source_url": null, "alt": "The finished tart", "position": 1, "url": "/media/aa11"},
    {"id": "m2", "kind": "pdf", "mime": "application/pdf", "size": 182044, "sha256": "bb22", "width": null, "height": null,
     "duration": null, "source_url": null, "alt": "Printable card", "position": 2, "url": "/media/bb22"}
  ],
  "backlinks": [
    {"relation": "includes", "period": null, "field": null, "provenance": "$backlinkProvenance", "note": null,
     "valid_from": null, "valid_until": null, "id": "04-lunch", "slug": "sunday-lunch", "title": "Sunday lunch"}
  ],
  "titles": {"01-cookbook": "Orchard cookbook"},
  "children": [
    {"id": "05-crust-part", "slug": "tart-crust", "type": "component", "title": "Tart crust",
     "summary": "Shortcrust, rested.", "in_parent": true, "fields": {"weight": "300 g"}},
    {"id": "06-glaze", "slug": "tart-glaze", "type": "component", "title": "Glaze", "summary": "", "in_parent": false}
  ],
  "hidden_children": 1,
  "dated": [
    {"id": "07-bake", "slug": "bake-day", "type": "event", "title": "Baked for the fair", "date": "2026-08-30",
     "summary": "Twelve tarts."}
  ],
  "more_dated": 0,
  "cited_by": [{"id": "08-notes", "slug": "fair-notes", "title": "Fair notes"}]
}
""".trimIndent()

/** The server of the read tests: types, a search, a tree, the tart, and the files it names. */
fun FakeServer.stockRecipes() {
    types = recipeTypes
    found = someResults
    tree = someTree
    val tart = plumTart()
    entries["plum-tart"] = tart
    entries["01-plum-tart"] = tart
    media["/media/aa11"] = PIXEL
    media["/media/bb22"] = CARD
}

/** One time a date comes back, as the briefing gives it: its `id` is the entry, the field and the date. */
fun occurrence(slug: String, title: String, type: String, field: String, date: String, daysLeft: Long?, deadline: Boolean = true) =
    BriefingOccurrence(
        id = "id-$slug:$field:$date",
        entry = BriefingOccurrenceEntry("id-$slug", slug, title, type),
        field = field,
        date = date,
        period = date,
        daysLeft = daysLeft,
        age = null,
        deadline = deadline,
    )

/** What the briefing says, with [inbox] items pending in the inbox. */
fun briefingOf(
    upcoming: List<BriefingOccurrence> = emptyList(),
    headsUp: List<BriefingOccurrence> = emptyList(),
    overdue: List<BriefingOccurrence> = emptyList(),
    inbox: Long = 0,
) = Briefing(
    from = "2026-10-12",
    to = "2026-10-18",
    upcoming = upcoming,
    overdue = overdue,
    headsUp = headsUp,
    waiting = BriefingWaiting(
        BriefingWaitingInbox(inbox, emptyList()),
        BriefingWaitingSupposed(0, emptyList()),
        BriefingWaitingPendingReferences(0, emptyList()),
    ),
)

val internetPlanEnds = occurrence("internet-plan", "Internet plan", "contract", "end", "2026-11-20", 39)
val camilleBirthday = occurrence("camille-test", "Camille Test", "person", "birthday", "2026-10-18", 6, deadline = false)
val warrantyEnds = occurrence("washing-machine", "Washing machine", "appliance", "warranty_end", "2026-10-14", 2)
