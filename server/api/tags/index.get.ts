// Role: admin. Every tag, with how many photos carry it.
import { db } from '../../db'

export default defineEventHandler(() => ({
  tags: db.prepare(
    `SELECT t.id, t.name, COUNT(pt.photo_id) AS photos
     FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
  ).all(),
}))
