<script setup lang="ts">
// The nuclear option, made deliberately tedious: four separate confirmations, a forced wait, a
// phrase that has to be typed by hand, and the password. The server checks the same things.
definePageMeta({ middleware: 'admin' })

interface Counts { photos: number, frames: number, playlists: number, tags: number, presets: number }

const step = ref<'intro' | 'sure' | 'really' | 'type' | 'done'>('intro')
const token = ref('')
const counts = ref<Counts | null>(null)
const phrase = ref('')
const waitMs = ref(10_000)
const downloaded = ref(false)
const countdown = ref(0)
const typed = ref('')
const password = ref('')
const pasteRefused = ref(false)
const typing = ref(false)
const working = ref(false)
const error = ref('')
const deleted = ref<Counts | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

const problem = (failure: unknown, fallback: string) => (failure as { statusMessage?: string }).statusMessage ?? fallback
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

function cancel() {
  clearInterval(timer)
  step.value = 'intro'
  token.value = ''
  typed.value = ''
  password.value = ''
  downloaded.value = false
  typing.value = false
  error.value = ''
}

async function begin() {
  error.value = ''
  try {
    const started = await $fetch<{ token: string, counts: Counts, phrase: string, wait_ms: number }>('/api/nuke/start', {
      method: 'POST',
      headers: apiHeaders,
    })
    token.value = started.token
    counts.value = started.counts
    phrase.value = started.phrase
    waitMs.value = started.wait_ms
    step.value = 'sure'
  }
  catch (failure) {
    error.value = problem(failure, 'Couldn\'t start. Reload the page and try again.')
  }
}

function toReally() {
  step.value = 'really'
  countdown.value = Math.ceil(waitMs.value / 1000)
  clearInterval(timer)
  timer = setInterval(() => {
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) clearInterval(timer)
  }, 1000)
}

function toTyping() {
  step.value = 'type'
  typing.value = true
}

// The phrase has to be typed, one key at a time. Pasting, dropping text, and autofill are refused.
function refuse(event: Event) {
  event.preventDefault()
  pasteRefused.value = true
}
function onBeforeInput(event: InputEvent) {
  if (/^insertFrom(Paste|Drop|Yank)|^insertReplacementText/.test(event.inputType)) refuse(event)
}

const phraseMatches = computed(() => typed.value === phrase.value)
const canDelete = computed(() => phraseMatches.value && password.value.length > 0 && !working.value)

async function nuke() {
  if (!canDelete.value) return
  working.value = true
  error.value = ''
  try {
    const result = await $fetch<{ deleted: Counts }>('/api/nuke/confirm', {
      method: 'POST',
      headers: apiHeaders,
      body: { token: token.value, phrase: typed.value, password: password.value },
    })
    deleted.value = result.deleted
    typing.value = false
    step.value = 'done'
  }
  catch (failure) {
    error.value = problem(failure, 'Nothing was deleted.')
    password.value = ''
    // An expired or used token means starting over from the first step.
    if ((failure as { statusCode?: number }).statusCode === 403) {
      typing.value = false
      step.value = 'intro'
    }
  }
  finally {
    working.value = false
  }
}

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <AdminShell title="Start over">
    <div class="flex max-w-2xl flex-col gap-5">
      <p class="text-lg text-muted">
        Deletes every photo and every frame, so you can begin again with an empty library. This is meant to be hard to do by accident, and it is.
      </p>

      <p v-if="error" role="alert" class="rounded-lg border border-error p-3 text-error">{{ error }}</p>

      <section v-if="step === 'intro'" class="flex flex-col gap-4 rounded-lg border border-default p-5">
        <h2 class="text-2xl font-extrabold tracking-tight">What gets deleted</h2>
        <ul class="list-disc ps-5 text-muted">
          <li>Every photo: the originals and every frame image, from the server's disk.</li>
          <li>Every frame. Each goes back to its pairing screen, and has to be paired again.</li>
          <li>Every playlist, tag, and preset.</li>
        </ul>
        <p class="text-muted">
          You stay logged in. The server's nightly database backups are left alone, so a backup could still bring the library's records back, but only if the photo files are backed up too.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton href="/api/photos/export" external download variant="soft" icon="i-lucide-download">Download all my photos first</UButton>
          <UButton color="error" variant="outline" icon="i-lucide-triangle-alert" @click="begin">I want to delete everything</UButton>
        </div>
      </section>

      <section v-else-if="step === 'sure' && counts" class="flex flex-col gap-4 rounded-lg border-2 border-error p-5">
        <h2 class="text-2xl font-extrabold tracking-tight">Are you sure?</h2>
        <p>This deletes, for good:</p>
        <ul class="list-disc ps-5 text-lg font-bold">
          <li>{{ plural(counts.photos, 'photo') }}</li>
          <li>{{ plural(counts.frames, 'frame') }}</li>
          <li>{{ plural(counts.playlists, 'playlist') }}, {{ plural(counts.tags, 'tag') }}, and {{ plural(counts.presets, 'preset') }}</li>
        </ul>
        <UCheckbox v-model="downloaded" label="I've downloaded my photos, or I don't want them" />
        <div class="flex flex-wrap gap-2">
          <UButton size="lg" icon="i-lucide-shield-check" autofocus @click="cancel">No, keep everything</UButton>
          <UButton size="lg" color="error" variant="soft" :disabled="!downloaded" @click="toReally">Yes, continue</UButton>
        </div>
      </section>

      <section v-else-if="step === 'really'" class="flex flex-col gap-4 rounded-lg border-2 border-error bg-error/10 p-5">
        <h2 class="text-2xl font-extrabold tracking-tight">Are you really sure?</h2>
        <p class="text-lg">There is no undo, no trash, and no recycle bin. Once this runs, the photos are gone from this server.</p>
        <p class="text-muted">Take a moment. The button unlocks after {{ Math.ceil(waitMs / 1000) }} seconds.</p>
        <div class="flex flex-wrap gap-2">
          <UButton size="lg" icon="i-lucide-shield-check" autofocus @click="cancel">No, stop</UButton>
          <UButton size="lg" color="error" :disabled="countdown > 0" @click="toTyping">
            {{ countdown > 0 ? `Yes, I'm sure (${countdown})` : 'Yes, I\'m sure' }}
          </UButton>
        </div>
      </section>

      <section v-else-if="step === 'done' && deleted" class="flex flex-col gap-4 rounded-lg border border-default p-5" role="status">
        <h2 class="text-2xl font-extrabold tracking-tight">Everything is deleted</h2>
        <p>
          {{ plural(deleted.photos, 'photo') }}, {{ plural(deleted.frames, 'frame') }}, {{ plural(deleted.playlists, 'playlist') }},
          {{ plural(deleted.tags, 'tag') }}, and {{ plural(deleted.presets, 'preset') }} are gone. You're starting from scratch.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton to="/admin" icon="i-lucide-upload">Add photos</UButton>
          <UButton to="/admin/pair" variant="soft" icon="i-lucide-plus">Pair a frame</UButton>
        </div>
      </section>
    </div>

    <UModal v-model:open="typing" title="Type it to confirm" :dismissible="false" :close="false" @update:open="(open) => { if (!open) cancel() }">
      <template #body>
        <form class="flex flex-col gap-4" @submit.prevent="nuke">
          <p>Type this sentence exactly, by hand. Pasting is turned off.</p>
          <p class="select-none rounded-md bg-elevated p-3 font-mono text-lg" aria-hidden="true" @copy.prevent @contextmenu.prevent>{{ phrase }}</p>
          <span class="sr-only">The sentence is: {{ phrase }}</span>
          <UFormField label="The sentence" :error="typed && !phrase.startsWith(typed) ? 'That doesn\'t match yet. Check capitals and spaces.' : undefined">
            <UInput
              v-model="typed"
              name="nuke-phrase"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              :spellcheck="false"
              class="w-full font-mono"
              @paste="refuse"
              @drop="refuse"
              @beforeinput="onBeforeInput"
            />
          </UFormField>
          <p v-if="pasteRefused && !phraseMatches" role="alert" class="text-sm text-error">Pasting doesn't work here. Type it.</p>
          <UFormField label="Your admin password" help="The same one you log in with">
            <UInput v-model="password" type="password" name="nuke-password" autocomplete="current-password" class="w-full" />
          </UFormField>
          <p v-if="error" role="alert" class="text-sm text-error">{{ error }}</p>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton size="lg" color="neutral" variant="soft" class="justify-center" @click="cancel">Cancel, keep everything</UButton>
            <UButton type="submit" size="lg" color="error" icon="i-lucide-bomb" class="justify-center" :disabled="!canDelete" :loading="working">
              Delete everything forever
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </AdminShell>
</template>
