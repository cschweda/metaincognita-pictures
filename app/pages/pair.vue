<script setup lang="ts">
// Shown on a frame with no valid device cookie. Polls every 3 seconds until approved.
const POLL_MS = 3000
const RETRY_MS = 60_000

const code = ref('')
const pairingId = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

async function start() {
  code.value = ''
  try {
    const pairing = await $fetch<{ pairing_id: string, code: string }>('/api/pair/start', {
      method: 'POST',
      body: { screen_w: screen.width, screen_h: screen.height, dpr: window.devicePixelRatio },
    })
    pairingId.value = pairing.pairing_id
    code.value = pairing.code
    timer = setTimeout(poll, POLL_MS)
  }
  catch {
    timer = setTimeout(start, RETRY_MS)
  }
}

async function poll() {
  try {
    const { status } = await $fetch<{ status: string }>('/api/pair/poll', { query: { id: pairingId.value } })
    if (status === 'approved') return await navigateTo('/', { external: true })
    if (status === 'expired') return await start()
  }
  catch {
    // A failed poll just tries again.
  }
  timer = setTimeout(poll, POLL_MS)
}

onMounted(start)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <main class="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-6 p-6 text-center">
    <template v-if="code">
      <p class="text-[6vmin]">Pair this frame</p>
      <p class="font-mono font-semibold tracking-widest text-[14vmin] leading-none">{{ code }}</p>
      <p class="text-[3vmin] text-white/70">Log in and go to Admin, then Pair a frame.</p>
    </template>
    <p v-else class="text-[4vmin] text-white/70">Getting a code…</p>
  </main>
</template>
