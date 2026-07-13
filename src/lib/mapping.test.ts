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
})
