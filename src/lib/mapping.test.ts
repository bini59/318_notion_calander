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
