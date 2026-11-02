// A frame shows a filter, not a fixed album (Doc 00 §5). Tags are stored by id, so renaming one is safe.
export interface PhotoFilter {
  tags: string[]
  mode: 'any' | 'all'
}

export function parseFilter(json: string): PhotoFilter {
  try {
    const value = JSON.parse(json) as Partial<PhotoFilter>
    return { tags: Array.isArray(value.tags) ? value.tags : [], mode: value.mode === 'all' ? 'all' : 'any' }
  }
  catch {
    return { tags: [], mode: 'any' }
  }
}

/** Returns a clean filter, or throws a 400. */
export function validateFilter(value: unknown): PhotoFilter {
  const filter = value as Partial<PhotoFilter> | null
  const valid = !!filter
    && Array.isArray(filter.tags)
    && filter.tags.length <= 100
    && filter.tags.every(tag => typeof tag === 'string')
    && (filter.mode === 'any' || filter.mode === 'all')
  if (!valid) throw createError({ statusCode: 400, statusMessage: 'Invalid filter' })
  return { tags: [...new Set(filter.tags)], mode: filter.mode as PhotoFilter['mode'] }
}

/** SQL for matching photos, with its parameters. An empty filter matches everything. */
export function filterClause(filter: PhotoFilter): { sql: string, params: string[] } {
  const { tags, mode } = filter
  if (tags.length === 0) return { sql: '1 = 1', params: [] }

  const slots = tags.map(() => '?').join(', ')
  if (mode === 'any') {
    return {
      sql: `EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = photos.id AND pt.tag_id IN (${slots}))`,
      params: tags,
    }
  }
  return {
    sql: `(SELECT COUNT(DISTINCT pt.tag_id) FROM photo_tags pt
           WHERE pt.photo_id = photos.id AND pt.tag_id IN (${slots})) = ${tags.length}`,
    params: tags,
  }
}
