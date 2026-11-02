// Role: admin. Server health, and roughly how many more photos will fit.
import { readFile, readdir, stat, statfs } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { db } from '../../db'

const CPU_SAMPLE_MS = 200
const USABLE_DISK_SHARE = 0.8 // The plan is to add a Volume at 80% full.
const ESTIMATED_PHOTO_BYTES = 7 * 1024 * 1024 // Original plus four sizes.
const MIN_PHOTOS_FOR_AVERAGE = 200 // Fewer than this says little about real photos, and samples are small.
const SIZE_CACHE_MS = 60_000

function cpuTimes() {
  return os.cpus().reduce((sum, cpu) => {
    const times = Object.values(cpu.times).reduce((a, b) => a + b, 0)
    return { total: sum.total + times, idle: sum.idle + cpu.times.idle }
  }, { total: 0, idle: 0 })
}

async function cpuPercent() {
  const before = cpuTimes()
  await new Promise(resolve => setTimeout(resolve, CPU_SAMPLE_MS))
  const after = cpuTimes()
  const total = after.total - before.total
  return total > 0 ? Math.round((1 - (after.idle - before.idle) / total) * 100) : 0
}

/** Linux counts reclaimable cache as available, which os.freemem() doesn't. */
async function memory() {
  const fallback = { total: os.totalmem(), available: os.freemem(), swapTotal: 0, swapFree: 0 }
  const text = await readFile('/proc/meminfo', 'utf8').catch(() => null)
  if (!text) return fallback

  const read = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)?.[1] ?? 0) * 1024
  return {
    total: read('MemTotal') || fallback.total,
    available: read('MemAvailable') || fallback.available,
    swapTotal: read('SwapTotal'),
    swapFree: read('SwapFree'),
  }
}

async function folderBytes(path: string) {
  const files = await readdir(path).catch(() => [] as string[])
  const sizes = await Promise.all(files.map(file => stat(join(path, file)).then(info => info.size, () => 0)))
  return sizes.reduce((a, b) => a + b, 0)
}

let cachedLibrary = { bytes: 0, at: 0 }

async function libraryBytes() {
  if (Date.now() - cachedLibrary.at > SIZE_CACHE_MS) {
    const [originals, variants] = await Promise.all([folderBytes(picturesPath('orig')), folderBytes(picturesPath('v'))])
    cachedLibrary = { bytes: originals + variants, at: Date.now() }
  }
  return cachedLibrary.bytes
}

export default defineEventHandler(async () => {
  const [cpu, ram, library, disk] = await Promise.all([cpuPercent(), memory(), libraryBytes(), statfs(picturesPath())])

  const photos = db.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM photos`).get()?.count ?? 0
  const diskTotal = disk.blocks * disk.bsize
  const diskFree = disk.bavail * disk.bsize

  const usesAverage = photos >= MIN_PHOTOS_FOR_AVERAGE
  const photoBytes = usesAverage ? library / photos : ESTIMATED_PHOTO_BYTES
  const usableBytes = Math.max(0, diskFree - diskTotal * (1 - USABLE_DISK_SHARE))

  return {
    cpu_percent: cpu,
    cores: os.cpus().length,
    load_1m: os.loadavg()[0],
    memory_total: ram.total,
    memory_available: ram.available,
    swap_total: ram.swapTotal,
    swap_free: ram.swapFree,
    disk_total: diskTotal,
    disk_free: diskFree,
    library_bytes: library,
    app_memory: process.memoryUsage().rss,
    uptime_seconds: Math.round(os.uptime()),
    app_uptime_seconds: Math.round(process.uptime()),
    node: process.version,
    photo_bytes: Math.round(photoBytes),
    photo_size_is_estimate: !usesAverage,
    photos_remaining: Math.floor(usableBytes / photoBytes),
  }
})
