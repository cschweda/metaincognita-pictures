// Role: device, or admin for a slideshow in their own browser.
import { VARIANT_SIZES } from '../../utils/images'

export default defineEventHandler((event) => {
  const device = event.context.device
  if (!device) {
    return {
      preview: true,
      interval_sec: 8,
      matte: '#000000',
      backdrop: 'solid',
      sleep_start: null,
      sleep_end: null,
      variant: 1920,
    }
  }

  const longestEdge = Math.max(device.screen_w ?? 0, device.screen_h ?? 0) * (device.dpr ?? 1)
  const variant = VARIANT_SIZES.find(size => size >= longestEdge) ?? VARIANT_SIZES.at(-1)

  return {
    preview: false,
    name: device.name,
    interval_sec: device.interval_sec,
    matte: device.matte,
    backdrop: device.backdrop,
    sleep_start: device.sleep_start,
    sleep_end: device.sleep_end,
    variant,
  }
})
