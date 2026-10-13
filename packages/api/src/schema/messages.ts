import { Match, Predicate, Schema, SchemaAST, SchemaIssue } from 'effect'
import type { StandardSchemaV1 } from 'effect/StandardSchema'

/**
 * Schema's own messages are written for developers ("Expected number, got \"x\""). What a person
 * reads says which field is wrong and how, in one short sentence; no raw Schema message reaches a
 * screen.
 */
const problemOf: SchemaIssue.LeafHook = (issue) =>
  Match.value(issue).pipe(
    Match.tag('MissingKey', () => 'is missing'),
    Match.tag('InvalidType', ({ ast }) =>
      Predicate.isString(ast.annotations?.expected)
        ? `must be ${ast.annotations.expected}`
        : mustBe(ast),
    ),
    Match.tag('UnexpectedKey', () => 'is not expected'),
    Match.tag('InvalidValue', ({ annotations }) =>
      Predicate.isString(annotations?.message) ? annotations.message : 'is not valid',
    ),
    Match.orElse(() => 'is not valid'),
  )

/**
 * A failed refinement says what it expects: Schema's checks carry it in plain English. A check
 * that names its own problem, as a check across several fields does, is reported at the field it
 * points to.
 */
const problemOfCheck: SchemaIssue.CheckHook = ({ filter, issue }) => {
  const expected = filter.annotations?.expected
  if (Predicate.isString(expected)) return `must be ${expected}`
  return Predicate.isTagged(issue, 'InvalidValue') ? problemOf(issue) : undefined
}

const mustBe = (ast: SchemaAST.AST): string =>
  Match.value(ast).pipe(
    Match.tag('String', () => 'must be text'),
    Match.tag('Number', () => 'must be a number'),
    Match.tag('Boolean', () => 'must be true or false'),
    Match.tag('Arrays', () => 'must be a list'),
    Match.tag('Objects', () => 'must be a set of fields'),
    Match.orElse(() => 'is not valid'),
  )

/**
 * The fields an object accepts, in the order its schema declares them, the required ones marked:
 * "`query` (required), `type`, `limit`". Read from the schema that refused, never written by hand.
 */
const acceptedBy = (ast: SchemaAST.AST): string | undefined =>
  Predicate.isTagged(ast, 'Objects') && ast.propertySignatures.length > 0
    ? ast.propertySignatures
        .map(
          ({ name, type }) =>
            `\`${String(name)}\`${SchemaAST.isOptional(type) ? '' : ' (required)'}`,
        )
        .join(', ')
    : undefined

/** An agent that sends a field not expected is told what to send instead, in the same sentence. */
const problemNamingAccepted: SchemaIssue.LeafHook = (issue) => {
  const accepted = Predicate.isTagged(issue, 'UnexpectedKey') ? acceptedBy(issue.ast) : undefined
  return accepted === undefined ? problemOf(issue) : `is not expected; it takes ${accepted}`
}

const problems = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: problemNamingAccepted,
  checkHook: problemOfCheck,
})

/** One sentence per problem: "The field `port` must be a number." */
export function formatSchemaError(error: Schema.SchemaError): string {
  return problems(error.issue)
    .issues.map(({ path, message }) =>
      path === undefined || path.length === 0
        ? `The value ${message}.`
        : `The field \`${path.map(String).join('.')}\` ${message}.`,
    )
    .join(' ')
}

/**
 * The Standard Schema a form validates with. Each field in error receives one sentence written
 * for the person filling the form: "This field must be a number."
 */
export function toFormSchema<S extends Schema.Decoder<unknown>>(
  schema: S,
): StandardSchemaV1<S['Encoded'], S['Type']> & S {
  return Schema.toStandardSchemaV1(schema, {
    leafHook: (issue) => `This field ${problemOf(issue)}.`,
    checkHook: (issue) => {
      const problem = problemOfCheck(issue)
      return problem === undefined ? undefined : `This field ${problem}.`
    },
  })
}
