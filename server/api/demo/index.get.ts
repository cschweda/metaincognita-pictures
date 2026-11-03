// Role: admin. Whether the app is in demo or live mode, and how a demo load is going.
export default defineEventHandler(() => ({
  mode: appMode(),
  demo_photos: demoPhotoCount(),
  photos: nukeCounts().photos,
  job: demoJob(),
  demo_count: DEMO_COUNT,
}))
