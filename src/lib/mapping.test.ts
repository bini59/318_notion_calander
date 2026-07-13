import { describe, expect, it } from 'vitest'
import {
  autoDetectMapping,
  mappingSchema,
  validateMappingAgainstProperties,
  type NotionProperty,
} from './mapping'

const props: NotionProperty[] = [
  { name: 'Name', type: 'title' },
  { name: 'When', type: 'date' },
  { name: 'Due', type: 'date' },
  { name: 'Notes', type: 'rich_text' },
  { name: 'Place', type: 'select' },
  { name: 'Status', type: 'status' },
  { name: 'Done', type: 'checkbox' },
]

describe('mappingSchema', () => {
  it('parses a full valid mapping', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      end: 'Due',
      description: 'Notes',
      location: 'Place',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a mapping missing the required start field', () => {
    const parsed = mappingSchema.safeParse({ title: 'Name' })
    expect(parsed.success).toBe(false)
  })

  it('rejects empty-string field values', () => {
    const parsed = mappingSchema.safeParse({ title: '', start: 'When' })
    expect(parsed.success).toBe(false)
  })

  it('accepts filters within the MVP ceiling (select/status/checkbox, equals/does_not_equal)', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      filters: [
        { type: 'status', property: 'Status', condition: 'does_not_equal', value: 'Done' },
        { type: 'select', property: 'Place', condition: 'equals', value: 'HQ' },
        { type: 'checkbox', property: 'Done', value: true },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a filter type outside the ceiling (date/number/text — no arbitrary builder)', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      filters: [{ type: 'date', property: 'When', condition: 'equals', value: '2026-01-01' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unsupported condition (contains/greater_than not allowed)', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      filters: [{ type: 'select', property: 'Place', condition: 'contains', value: 'HQ' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a checkbox filter with a non-boolean value', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      filters: [{ type: 'checkbox', property: 'Done', value: 'true' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('accepts all four relation conditions (#16)', () => {
    for (const condition of ['contains', 'does_not_contain'] as const) {
      const parsed = mappingSchema.safeParse({
        title: 'Name',
        start: 'When',
        filters: [{ type: 'relation', property: 'Project', condition, value: 'page-uuid' }],
      })
      expect(parsed.success).toBe(true)
    }
    for (const condition of ['is_empty', 'is_not_empty'] as const) {
      const parsed = mappingSchema.safeParse({
        title: 'Name',
        start: 'When',
        filters: [{ type: 'relation', property: 'Project', condition }],
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('rejects relation contains/does_not_contain without a value (refine)', () => {
    for (const condition of ['contains', 'does_not_contain'] as const) {
      const parsed = mappingSchema.safeParse({
        title: 'Name',
        start: 'When',
        filters: [{ type: 'relation', property: 'Project', condition }],
      })
      expect(parsed.success).toBe(false)
    }
  })

  it('rejects an unsupported relation condition (equals not allowed)', () => {
    const parsed = mappingSchema.safeParse({
      title: 'Name',
      start: 'When',
      filters: [{ type: 'relation', property: 'Project', condition: 'equals', value: 'x' }],
    })
    expect(parsed.success).toBe(false)
  })

  it("accepts descriptionSource 'property'/'body' and its absence (#17 하위호환)", () => {
    for (const descriptionSource of ['property', 'body'] as const) {
      expect(mappingSchema.safeParse({ title: 'Name', start: 'When', descriptionSource }).success).toBe(true)
    }
    // 부재 = 기존 저장 mapping (falsy → 'property'로 해석).
    expect(mappingSchema.safeParse({ title: 'Name', start: 'When' }).success).toBe(true)
  })

  it('rejects an unknown descriptionSource value', () => {
    const parsed = mappingSchema.safeParse({ title: 'Name', start: 'When', descriptionSource: 'summary' })
    expect(parsed.success).toBe(false)
  })
})

describe('autoDetectMapping', () => {
  it('picks the title property and the first date property', () => {
    expect(autoDetectMapping(props)).toEqual({ title: 'Name', start: 'When' })
  })

  it('omits start when there is no date property (0 date → generation blocked upstream)', () => {
    expect(autoDetectMapping([{ name: 'Name', type: 'title' }])).toEqual({ title: 'Name' })
  })

  it('with multiple date properties still proposes only the first (user overrides)', () => {
    const detected = autoDetectMapping(props)
    expect(detected.start).toBe('When')
  })

  it('omits title when the DB has no title property (abnormal DB)', () => {
    expect(autoDetectMapping([{ name: 'When', type: 'date' }])).toEqual({ start: 'When' })
  })
})

describe('validateMappingAgainstProperties', () => {
  it('returns null for a valid mapping', () => {
    expect(
      validateMappingAgainstProperties(
        { title: 'Name', start: 'When', end: 'Due', description: 'Notes', location: 'Place' },
        props,
      ),
    ).toBeNull()
  })

  it('rejects a start that is not a date property', () => {
    const reason = validateMappingAgainstProperties({ title: 'Name', start: 'Notes' }, props)
    expect(reason).toMatch(/date/)
  })

  it('rejects a title that is not a title property', () => {
    const reason = validateMappingAgainstProperties({ title: 'When', start: 'When' }, props)
    expect(reason).toMatch(/title/)
  })

  it('rejects an end that is not a date property', () => {
    const reason = validateMappingAgainstProperties(
      { title: 'Name', start: 'When', end: 'Notes' },
      props,
    )
    expect(reason).toMatch(/date/)
  })

  it('rejects a mapping that references a non-existent property (forged client mapping)', () => {
    const reason = validateMappingAgainstProperties({ title: 'Name', start: 'Ghost' }, props)
    expect(reason).toMatch(/존재하지 않/)
  })

  it('accepts description/location of any type as long as they exist', () => {
    expect(
      validateMappingAgainstProperties(
        { title: 'Name', start: 'When', description: 'Place', location: 'Notes' },
        props,
      ),
    ).toBeNull()
  })

  it('rejects a description that does not exist', () => {
    const reason = validateMappingAgainstProperties(
      { title: 'Name', start: 'When', description: 'Ghost' },
      props,
    )
    expect(reason).toMatch(/존재하지 않/)
  })

  it('accepts filters whose property exists and matches the declared type', () => {
    expect(
      validateMappingAgainstProperties(
        {
          title: 'Name',
          start: 'When',
          filters: [{ type: 'status', property: 'Status', condition: 'does_not_equal', value: 'Done' }],
        },
        props,
      ),
    ).toBeNull()
  })

  it('rejects a filter property that does not exist (forged client filter)', () => {
    const reason = validateMappingAgainstProperties(
      {
        title: 'Name',
        start: 'When',
        filters: [{ type: 'select', property: 'Ghost', condition: 'equals', value: 'x' }],
      },
      props,
    )
    expect(reason).toMatch(/존재하지 않/)
  })

  it("skips description property existence check when descriptionSource is 'body' (#17)", () => {
    // 'body' 소스면 description은 property가 아니라 페이지 본문 → 존재하지 않는 이름이어도(또는 없어도) 통과.
    expect(
      validateMappingAgainstProperties(
        { title: 'Name', start: 'When', description: 'Ghost', descriptionSource: 'body' },
        props,
      ),
    ).toBeNull()
    expect(
      validateMappingAgainstProperties(
        { title: 'Name', start: 'When', descriptionSource: 'body' },
        props,
      ),
    ).toBeNull()
  })

  it("still validates description existence for the default 'property' source (#17)", () => {
    const reason = validateMappingAgainstProperties(
      { title: 'Name', start: 'When', description: 'Ghost', descriptionSource: 'property' },
      props,
    )
    expect(reason).toMatch(/존재하지 않/)
  })

  it('rejects a filter whose declared type mismatches the real property type', () => {
    // 'Place' is a select, but the client claims it is a status.
    const reason = validateMappingAgainstProperties(
      {
        title: 'Name',
        start: 'When',
        filters: [{ type: 'status', property: 'Place', condition: 'equals', value: 'x' }],
      },
      props,
    )
    expect(reason).toMatch(/타입은 'status'/)
  })
})
