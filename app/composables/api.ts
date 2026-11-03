// Every state-changing admin request needs this header (Doc 06 §4).
export const apiHeaders = { 'X-Requested-With': 'fetch' }

export interface Tag {
  id: string
  name: string
  photos?: number
}

export interface PhotoFilter {
  tags: string[]
  mode: 'any' | 'all'
}

export interface Preset {
  id: string
  name: string
  filter: PhotoFilter
}

export interface Frame {
  id: string
  name: string
  filter: PhotoFilter
  sort: string
  screen_w: number | null
  screen_h: number | null
  interval_sec: number
  matte: string
  backdrop: string
  sleep_start: string | null
  sleep_end: string | null
  paired_at: string
  last_seen_at: string | null
  current_photo_id: string | null
  online: boolean
  dormant: boolean
  match_shape: boolean
  memories_first: boolean
  show_captions: boolean
  schedule_preset_id: string | null
  schedule_days: number[]
  schedule_start: string | null
  schedule_end: string | null
  playlist_id: string | null
}

export interface Playlist {
  id: string
  name: string
  photos: number
  frames: string[]
  cover: string | null
}

/** Finds or creates tags by name, and returns their ids. */
export async function ensureTags(names: string[]): Promise<string[]> {
  const results = await Promise.all(names.map(name =>
    $fetch<{ tag: Tag }>('/api/tags', { method: 'POST', headers: apiHeaders, body: { name } }),
  ))
  return results.map(result => result.tag.id)
}

/** The tag chosen in the admin. Empty means every photo. */
export function useTagFilter() {
  return useState('tag-filter', () => '')
}

export type SlideshowOrder = 'random' | 'sequential'

/** The playlist Start slideshow plays, by id. Empty means all photos, narrowed by the Show tag. */
export function useSlideshowPlaylist() {
  return useState('slideshow-playlist', () => '')
}

/** What Start slideshow plays: a playlist as `playlist:<id>`, or else the Show tag. */
export function useSlideshowShow() {
  const tagFilter = useTagFilter()
  const playlist = useSlideshowPlaylist()
  return computed(() => playlist.value ? `playlist:${playlist.value}` : tagFilter.value)
}

/** Where Start slideshow plays: 'all' frames, one frame's id, or 'screen' for this browser. */
export function useSlideshowTarget() {
  return useState<string>('slideshow-target', () => 'all')
}

/** How the admin's slideshow plays. Either way it starts again after the last photo. */
export function useSlideshowOrder() {
  return useState<SlideshowOrder>('slideshow-order', () => 'random')
}

/** The tag list, shared so a new tag appears everywhere at once. */
export function useTags() {
  const tags = useState<Tag[]>('tags', () => [])
  async function loadTags() {
    tags.value = (await $fetch<{ tags: Tag[] }>('/api/tags')).tags
  }
  return { tags, loadTags }
}
