/**
 * The invented instance the screenshots show: types, entries, links and inbox items, written
 * through MCP as an agent would. Every name, address and amount is made up. The dates are counted
 * from the day of the run, so what is due this week stays due this week.
 */

/** A call of an MCP tool: its name and its arguments. */
export interface Call {
  readonly tool: string
  readonly arguments: Readonly<Record<string, Argument>>
}
type Argument =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<Argument>
  | { readonly [key: string]: Argument }

/** The day `days` after `today`, as `YYYY-MM-DD`. */
const after = (today: string, days: number) => {
  const date = new Date(`${today}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const types: ReadonlyArray<Call> = [
  {
    tool: 'define_type',
    arguments: {
      name: 'area',
      label: 'Area',
      description:
        'A part of life that groups other entries: the kitchen, the home, the car, health, reading.',
      fields: [],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'person',
      label: 'Person',
      description: 'Someone the user knows: a friend, a relative, a doctor, a craftsman.',
      fields: [
        { name: 'occupation', kind: 'text', description: 'What they do, in a few words.' },
        { name: 'birthday', kind: 'date', recurs: { every: 'yearly', notice: 'P14D' } },
      ],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'recipe',
      label: 'Recipe',
      description: 'A recipe to cook again, with its ingredients and steps in the body.',
      fields: [
        { name: 'servings', kind: 'integer' },
        {
          name: 'time',
          kind: 'text',
          description: 'The total time, preparation and cooking, such as 1 h 10 min.',
        },
        { name: 'source', kind: 'url', description: 'The page the recipe comes from.' },
      ],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'contract',
      label: 'Contract',
      description: 'A contract followed over time: an insurance, a subscription, an energy supply.',
      fields: [
        {
          name: 'provider',
          kind: 'text',
          required: true,
          description: 'The company that sells it.',
        },
        { name: 'start', kind: 'date', required: true },
        { name: 'end', kind: 'date', due: { notice: 'P30D' } },
        { name: 'renewal', kind: 'enum', values: ['tacit', 'manual', 'none'] },
        { name: 'monthly_cost', kind: 'money' },
      ],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'project',
      label: 'Project',
      description:
        'Something the user is doing at home or elsewhere, with a status and a deadline.',
      fields: [
        { name: 'status', kind: 'enum', values: ['idea', 'active', 'done'] },
        { name: 'deadline', kind: 'date', due: { notice: 'P7D' } },
      ],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'appointment',
      label: 'Appointment',
      description: 'A meeting at a given day: a doctor, a garage, a visit.',
      dated_by: 'date',
      fields: [
        { name: 'date', kind: 'date', required: true, due: { notice: 'P7D' } },
        {
          name: 'with',
          kind: 'entry',
          types: ['person'],
          description: 'Who the appointment is with.',
        },
      ],
    },
  },
  {
    tool: 'define_type',
    arguments: {
      name: 'bookmark',
      label: 'Bookmark',
      description: 'A page kept to find again, with what it says and why it is kept.',
      fields: [{ name: 'url', kind: 'url', required: true }],
    },
  },
]

/** An entry written as known, said by the owner, all its values and its body included. */
const entry = (
  said: string,
  type: string,
  title: string,
  parent: string | undefined,
  summary: string,
  fields: Readonly<Record<string, Argument>>,
  body: string,
) => {
  const place = parent === undefined ? [] : [['parent', parent]]
  const known = ['summary', 'body', ...Object.keys(fields), ...place.map(([name]) => name)]
  return {
    type,
    title,
    summary,
    fields,
    body,
    sources: [{ said_by: 'owner', on: said }],
    provenance: Object.fromEntries(known.map((name) => [name, 'extracted'])),
    ...Object.fromEntries(place),
  }
}

const recipe = (ingredients: ReadonlyArray<string>, steps: ReadonlyArray<string>, note: string) =>
  [
    '## Ingredients',
    '',
    ...ingredients.map((line) => `- ${line}`),
    '',
    '## Steps',
    '',
    ...steps.map((line, index) => `${index + 1}. ${line}`),
    '',
    note,
    '',
  ].join('\n')

const entries = (today: string, said: string) => [
  entry(
    said,
    'area',
    'Kitchen',
    undefined,
    'Recipes and what the kitchen needs.',
    {},
    'What we cook, and what we want to cook again.\n',
  ),
  entry(
    said,
    'area',
    'Home',
    undefined,
    'The flat, its works and its contracts.',
    {},
    'Everything about the flat: the works, the energy, the insurance.\n',
  ),
  entry(
    said,
    'area',
    'Car',
    undefined,
    'The car, its insurance and its upkeep.',
    {},
    'The car and what keeps it on the road.\n',
  ),
  entry(
    said,
    'area',
    'Health',
    undefined,
    'Doctors and appointments.',
    {},
    'Who looks after us, and when to see them.\n',
  ),
  entry(
    said,
    'area',
    'Reading',
    undefined,
    'Pages kept to read again.',
    {},
    'Articles and guides worth keeping.\n',
  ),
  entry(
    said,
    'person',
    'Claire Morel',
    undefined,
    'A friend from the climbing club, who bakes better than anyone.',
    { occupation: 'Pastry chef', birthday: after(today, 5) },
    'Met at the climbing club. Gave us her recipe for the [[lemon-tart]].\n\nLikes: dark chocolate, long walks, board games.\n',
  ),
  entry(
    said,
    'person',
    'Dr Léa Fontaine',
    'health',
    'Our dentist, at the practice on the square.',
    { occupation: 'Dentist' },
    'Check-up every year in the autumn. Prefers to be called in the morning.\n',
  ),
  entry(
    said,
    'person',
    'Hugo Bernard',
    'home',
    'The carpenter who is redoing the kitchen.',
    { occupation: 'Carpenter' },
    'Recommended by the neighbours. Works in oak and ash; quotes within a week.\n',
  ),
  entry(
    said,
    'person',
    'Nadia Roux',
    undefined,
    'A colleague, who lends us her trailer.',
    { occupation: 'Engineer' },
    'Has a trailer we can borrow for the shed. Allergic to nuts.\n',
  ),
  entry(
    said,
    'recipe',
    'Lemon tart',
    'kitchen',
    'A sharp lemon curd in a crisp sweet pastry, from Claire.',
    { servings: 6, time: '1 h 10 min', source: 'https://recipes.example/lemon-tart' },
    recipe(
      [
        '250 g flour',
        '125 g butter, cold',
        '80 g icing sugar',
        '4 lemons',
        '3 eggs',
        '150 g caster sugar',
      ],
      [
        'Rub the butter into the flour and sugar, bind with an egg, rest 30 minutes.',
        'Blind-bake the case at 180 °C for 15 minutes.',
        'Whisk the juice and zest of the lemons with the eggs and sugar over a low heat until thick.',
        'Pour into the case and bake 10 minutes more. Leave to set before cutting.',
      ],
      'Claire adds a pinch of salt to the pastry; it makes all the difference.',
    ),
  ),
  entry(
    said,
    'recipe',
    'Ratatouille',
    'kitchen',
    'Summer vegetables slowly cooked, better the next day.',
    { servings: 4, time: '1 h 30 min' },
    recipe(
      [
        '2 aubergines',
        '2 courgettes',
        '2 peppers',
        '4 tomatoes',
        '1 onion',
        'Basil, thyme, olive oil',
      ],
      [
        'Cook each vegetable apart in olive oil.',
        'Bring them together with the tomatoes and herbs.',
        'Simmer for 45 minutes.',
      ],
      'The basil comes from the balcony, see [[balcony-herb-garden]].',
    ),
  ),
  entry(
    said,
    'recipe',
    'Buckwheat crêpes',
    'kitchen',
    'Savoury crêpes with ham, cheese and an egg.',
    { servings: 4, time: '40 min' },
    recipe(
      ['250 g buckwheat flour', '1 egg', '600 ml water', 'Salt', 'Ham, grated cheese, eggs'],
      [
        'Whisk the flour, egg, water and salt; rest the batter 2 hours.',
        'Cook thin crêpes in a hot buttered pan.',
        'Fill with ham, cheese and an egg, fold the edges.',
      ],
      'Rest the batter overnight when there is time.',
    ),
  ),
  entry(
    said,
    'recipe',
    'Mushroom risotto',
    'kitchen',
    'A creamy risotto with chestnut mushrooms and thyme.',
    { servings: 3, time: '45 min' },
    recipe(
      [
        '300 g arborio rice',
        '400 g chestnut mushrooms',
        '1 shallot',
        '1 l vegetable stock',
        'Parmesan, butter, thyme',
      ],
      [
        'Brown the mushrooms and set aside.',
        'Soften the shallot, toast the rice.',
        'Add the stock a ladle at a time, stirring.',
        'Finish with the mushrooms, butter and parmesan.',
      ],
      'Keep the stock simmering beside the pan.',
    ),
  ),
  entry(
    said,
    'recipe',
    'Plum crumble',
    'kitchen',
    'Late-summer plums under a crunchy oat topping.',
    { servings: 6, time: '50 min' },
    recipe(
      ['800 g plums', '100 g flour', '60 g oats', '90 g butter', '80 g brown sugar'],
      [
        'Halve and stone the plums into a dish.',
        'Rub the flour, oats, butter and sugar to crumbs.',
        'Scatter over the fruit and bake 35 minutes at 180 °C.',
      ],
      'Good with a spoon of crème fraîche.',
    ),
  ),
  entry(
    said,
    'recipe',
    'Miso soup',
    'kitchen',
    'A quick soup of miso, tofu and spring onions.',
    { servings: 2, time: '15 min' },
    recipe(
      ['700 ml dashi', '3 tbsp white miso', '150 g silken tofu', '2 spring onions', 'Wakame'],
      [
        'Warm the dashi without boiling.',
        'Dissolve the miso in a ladle of it, stir back in.',
        'Add the tofu, wakame and onions.',
      ],
      'Never let it boil once the miso is in.',
    ),
  ),
  entry(
    said,
    'contract',
    'Comprehensive insurance',
    'car',
    'Comprehensive cover for the car, with Calder Mutual.',
    {
      provider: 'Calder Mutual',
      start: '2024-03-01',
      end: after(today, 20),
      renewal: 'manual',
      monthly_cost: '38.40 EUR',
    },
    '## Cover\n\n- Comprehensive, with a 300 EUR excess\n- Breakdown assistance from 0 km\n- Replacement car for 7 days\n\n## To do before the end\n\nCompare two other quotes before renewing; ask for the no-claims bonus to be carried over.\n',
  ),
  entry(
    said,
    'contract',
    'Tenant insurance',
    'home',
    'Tenant cover for the flat, with Lindenhall Insurance.',
    {
      provider: 'Lindenhall Insurance',
      start: '2023-09-15',
      renewal: 'tacit',
      monthly_cost: '14.90 EUR',
    },
    'Covers water damage, theft and liability. The certificate is renewed every September.\n',
  ),
  entry(
    said,
    'contract',
    'Internet plan',
    'home',
    'Fibre at home, 1 Gbit/s, with Brightwave.',
    {
      provider: 'Brightwave',
      start: '2025-01-10',
      end: after(today, 4),
      renewal: 'manual',
      monthly_cost: '29.99 EUR',
    },
    'The promotional price ends with the first term. Call them before the end to keep it.\n',
  ),
  entry(
    said,
    'contract',
    'Electricity',
    'home',
    'Green electricity supply for the flat, with Solvane Energy.',
    {
      provider: 'Solvane Energy',
      start: '2024-06-01',
      renewal: 'tacit',
      monthly_cost: '52.00 EUR',
    },
    'Monthly payments, adjusted each June on the meter reading.\n',
  ),
  entry(
    said,
    'project',
    'Kitchen renovation',
    'home',
    'New oak worktop and shelves, with Hugo the carpenter.',
    { status: 'active', deadline: after(today, 3) },
    '## Plan\n\n- [x] Choose the oak worktop\n- [x] Quote from [[hugo-bernard]]\n- [ ] Empty the cupboards before he comes\n- [ ] Order the new tap\n\nThe old shelves go to the shed, see [[garden-shed]].\n',
  ),
  entry(
    said,
    'project',
    'Garden shed',
    'home',
    'A small wooden shed at the end of the garden.',
    { status: 'idea' },
    'Borrow the trailer from [[nadia-roux]] to bring the planks.\n',
  ),
  entry(
    said,
    'project',
    'Balcony herb garden',
    'home',
    'Basil, thyme and mint in pots on the balcony.',
    { status: 'done' },
    'Basil in the sun, mint in its own pot. Water every other evening in summer.\n',
  ),
  entry(
    said,
    'appointment',
    'Dental check-up',
    'health',
    'The yearly check-up with Dr Fontaine.',
    { date: after(today, 2), with: 'dr-lea-fontaine' },
    'At 9:30. Bring the card of the health insurance.\n',
  ),
  entry(
    said,
    'appointment',
    'Yearly service',
    'car',
    'The yearly service at the garage.',
    { date: after(today, 9) },
    'Oil, filters and brakes. Ask about the noise of the rear left wheel.\n',
  ),
  entry(
    said,
    'bookmark',
    'Keeping a sourdough starter',
    'reading',
    'How to feed a starter and keep it alive through the holidays.',
    { url: 'https://bread.example/sourdough-starter' },
    'Feed it 1:1:1, keep it in the fridge when away, and wake it two days before baking.\n',
  ),
  entry(
    said,
    'bookmark',
    'Bleeding a radiator',
    'reading',
    'A step-by-step guide to bleed the radiators before winter.',
    { url: 'https://home.example/bleed-a-radiator' },
    'Heating off, a cloth under the valve, a quarter turn until water comes.\n',
  ),
  entry(
    said,
    'bookmark',
    'Plain-text accounting',
    'reading',
    'Keeping the household accounts in a text file.',
    { url: 'https://ledger.example/plain-text-accounting' },
    'One line per transaction; a report per month. Worth trying in January.\n',
  ),
  entry(
    said,
    'bookmark',
    'Fermenting vegetables',
    'reading',
    'Salt, a jar and patience: a guide to lacto-fermentation.',
    { url: 'https://kitchen.example/fermenting-vegetables' },
    '2 % salt by weight, vegetables under the brine, a week at room temperature.\n',
  ),
]

/** The links between the entries, each known (the source entries say who told it). */
const links: ReadonlyArray<Call> = [
  ['lemon-tart', 'claire-morel', 'from', 'her recipe'],
  ['kitchen-renovation', 'hugo-bernard', 'works_with', 'carpenter'],
  ['garden-shed', 'nadia-roux', 'borrows_from', 'the trailer'],
  ['ratatouille', 'balcony-herb-garden', 'uses', 'the basil'],
  ['claire-morel', 'nadia-roux', 'knows', 'climbing club'],
].map(([source, target, relation, note]) => ({
  tool: 'link',
  arguments: { source, target, relation, note, provenance: 'extracted' },
}))

/** What waits in the inbox: a link, a text, and one already turned into an entry. */
const inbox: ReadonlyArray<Call> = [
  {
    tool: 'inbox_add',
    arguments: {
      kind: 'url',
      url: 'https://recipes.example/apple-galette',
      origin: 'phone',
      note: 'for Sunday',
    },
  },
  {
    tool: 'inbox_add',
    arguments: {
      kind: 'text',
      text: 'The plumber can come on Thursday morning, call back to confirm.',
      origin: 'phone',
    },
  },
]

/** Every call, in the order they are made: the types, the entries in one batch, the links, the inbox. */
export const calls = (today: string): ReadonlyArray<Call> => [
  ...types,
  { tool: 'write', arguments: { entries: entries(today, after(today, -30)) } },
  ...links,
  ...inbox,
]
