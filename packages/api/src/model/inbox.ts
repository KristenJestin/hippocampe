import { Schema } from 'effect'

const CLIENT_ID = Schema.String.annotate({
  description:
    'An identifier the sender chose for the item, a UUID: sent again with it, the item is kept once; with another content, it is refused.',
})

const NOTE = Schema.String.annotate({
  description:
    'Why the item is sent, in a few words ("for the reference board"), for the agent that takes it.',
})

const ORIGIN = Schema.String.annotate({
  description: 'Where the item comes from, such as an app or a device, to follow it by origin.',
})

/** A text or a link put into the inbox, as JSON; a file is sent as `InboxUpload`. */
export const InboxSend = Schema.Struct({
  kind: Schema.Literals(['text', 'url']).annotate({
    description:
      'What the item is: a `text` (with `text`) or a `url` (with `url`). A file is sent as multipart/form-data.',
  }),
  text: Schema.optionalKey(Schema.String).annotate({ description: 'For a `text` item: the text.' }),
  url: Schema.optionalKey(Schema.String).annotate({
    description: 'For a `url` item: an http or https address, kept as given.',
  }),
  origin: Schema.optionalKey(ORIGIN),
  note: Schema.optionalKey(NOTE),
  client_id: Schema.optionalKey(CLIENT_ID),
}).annotate({ identifier: 'InboxSend' })
export type InboxSend = typeof InboxSend.Type

/** The fields of a file put into the inbox, beside the file itself. */
export const InboxUploadFields = {
  name: Schema.optionalKey(Schema.String).annotate({
    description: 'The name of the file, with its extension; the name of the part when not given.',
  }),
  origin: Schema.optionalKey(ORIGIN),
  note: Schema.optionalKey(NOTE),
  client_id: Schema.optionalKey(CLIENT_ID),
}

/** An item as its sender follows it: where it stands and what it gave, never what it holds. */
export const InboxSent = Schema.Struct({
  id: Schema.String,
  client_id: Schema.NullOr(Schema.String),
  kind: Schema.Literals(['text', 'url', 'file']),
  name: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.Int).annotate({
    description: 'The size of a file, or the length of a text, in bytes.',
  }),
  mime: Schema.NullOr(Schema.String),
  origin: Schema.String,
  received_at: Schema.String,
  status: Schema.Literals(['pending', 'taken', 'processed', 'dismissed']),
  reason: Schema.NullOr(Schema.String).annotate({ description: 'Why it was dismissed.' }),
  entries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      slug: Schema.String,
      title: Schema.String,
      type: Schema.String,
    }).annotate({ identifier: 'InboxGave' }),
  ).annotate({
    description: 'Once processed, the entries it gave that the key may read.',
  }),
}).annotate({ identifier: 'InboxSent' })
export type InboxSent = typeof InboxSent.Type
