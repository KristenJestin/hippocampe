/**
 * How close a word no entry holds must be to a word of a title, an alias or a slug for a search to
 * find it, as `word_similarity` measures it: a letter missing in the middle of a name of six to
 * eight letters is 0.57 to 0.58, one wrong or doubled letter 0.6 or more. Below that, any short
 * word is near some name. The operator `<%` reads it from the connection, which sets it as it opens.
 */
export const NEAR = 0.55

/** What every connection to the database sets as it opens. */
export const startupParameters = { 'pg_trgm.word_similarity_threshold': String(NEAR) }
