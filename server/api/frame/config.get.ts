// Role: device. Display settings for this frame.
import { VARIANT_SIZES } from '../../utils/images'

export default defineEventHandler((event) => {
  const device = event.context.device!
  const longestEdge = Math.max(device.screen_w ?? 0, device.screen_h ?? 0) * (device.dpr ?? 1)
  const variant = VARIANT_SIZES.find(size => size >= longestEdge) ?? VARIANT_SIZES.at(-1)

  return {
    name: device.name,
    interval_sec: device.interval_sec,
    matte: device.matte,
    backdrop: device.backdrop,
    sleep_start: device.sleep_start,
    sleep_end: device.sleep_end,
    variant,
  }
})
