<script setup lang="ts">
// Two-factor login: off by default, and turned on or off here at any time.
definePageMeta({ middleware: 'admin' })

const headers = { 'X-Requested-With': 'fetch' }
const status = ref<{ two_factor: boolean, recovery_codes_left: number } | null>(null)
async function load() {
  status.value = await $fetch('/api/security')
}
onMounted(load)

const errorOf = (failure: unknown, fallback: string) => (failure as { statusMessage?: string }).statusMessage ?? fallback

// Setting up: password, then scan and confirm a code, then save the recovery codes.
const setupStep = ref<'idle' | 'password' | 'scan' | 'codes'>('idle')
const setupPassword = ref('')
const setupCode = ref('')
const setupError = ref('')
const working = ref(false)
const qr = ref('')
const secret = ref('')
const recoveryCodes = ref<string[]>([])
const saved = ref(false)

function cancelSetup() {
  setupStep.value = 'idle'
  setupPassword.value = ''
  setupCode.value = ''
  setupError.value = ''
  qr.value = ''
  secret.value = ''
}

async function startSetup() {
  working.value = true
  setupError.value = ''
  try {
    const result = await $fetch<{ secret: string, qr: string }>('/api/security/two-factor/setup', { method: 'POST', headers, body: { password: setupPassword.value } })
    qr.value = result.qr
    secret.value = result.secret
    setupStep.value = 'scan'
    nextTick(() => document.getElementById('setup-code')?.focus())
  }
  catch (failure) {
    setupError.value = errorOf(failure, 'Nothing was changed.')
  }
  finally {
    setupPassword.value = ''
    working.value = false
  }
}

async function confirmSetup() {
  working.value = true
  setupError.value = ''
  try {
    const result = await $fetch<{ recovery_codes: string[] }>('/api/security/two-factor/enable', { method: 'POST', headers, body: { code: setupCode.value } })
    recoveryCodes.value = result.recovery_codes
    saved.value = false
    setupStep.value = 'codes'
    qr.value = ''
    secret.value = ''
    await load()
  }
  catch (failure) {
    setupError.value = errorOf(failure, 'That code didn\'t work.')
  }
  finally {
    setupCode.value = ''
    working.value = false
  }
}

const copied = ref(false)
async function copyCodes() {
  await navigator.clipboard.writeText(recoveryCodes.value.join('\n'))
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
function downloadCodes() {
  const text = `OpenMantel recovery codes for ${location.host}\nEach code works once, in place of the code from your app.\n\n${recoveryCodes.value.join('\n')}\n`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  link.download = 'openmantel-recovery-codes.txt'
  link.click()
  URL.revokeObjectURL(link.href)
}
function finishCodes() {
  recoveryCodes.value = []
  setupStep.value = 'idle'
}

// Turning off, or making new recovery codes: both need the password and a code.
const guarded = ref<'disable' | 'recovery' | null>(null)
const guardPassword = ref('')
const guardCode = ref('')
const guardError = ref('')
const guardOpen = computed({
  get: () => guarded.value !== null,
  set: (open) => { if (!open) guarded.value = null },
})
watch(guarded, () => {
  guardPassword.value = ''
  guardCode.value = ''
  guardError.value = ''
})
async function submitGuarded() {
  working.value = true
  guardError.value = ''
  try {
    if (guarded.value === 'disable') {
      await $fetch('/api/security/two-factor/disable', { method: 'POST', headers, body: { password: guardPassword.value, code: guardCode.value } })
    }
    else {
      const result = await $fetch<{ recovery_codes: string[] }>('/api/security/two-factor/recovery-codes', { method: 'POST', headers, body: { password: guardPassword.value, code: guardCode.value } })
      recoveryCodes.value = result.recovery_codes
      saved.value = false
      setupStep.value = 'codes'
    }
    guarded.value = null
    await load()
  }
  catch (failure) {
    guardError.value = errorOf(failure, 'Nothing was changed.')
    guardPassword.value = ''
    guardCode.value = ''
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <AdminShell title="Security">
    <section aria-labelledby="two-factor" class="flex max-w-3xl flex-col gap-4 rounded-lg border border-default p-4">
      <div class="flex flex-wrap items-center gap-3">
        <h2 id="two-factor" class="text-xl font-bold">Two-factor login</h2>
        <UBadge v-if="status" :color="status.two_factor ? 'success' : 'neutral'" variant="subtle">
          {{ status.two_factor ? 'On' : 'Off' }}
        </UBadge>
      </div>

      <!-- Recovery codes, shown once, after setting up or making new ones. -->
      <template v-if="setupStep === 'codes'">
        <p class="font-medium">Save these recovery codes now. They won't be shown again.</p>
        <p class="text-muted">
          If you lose your phone, each code logs you in once in place of the code from the app. Keep them somewhere safe
          that isn't your phone: a password manager, or printed and put away.
        </p>
        <ol class="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-elevated p-4 font-mono text-lg" aria-label="Recovery codes">
          <li v-for="item in recoveryCodes" :key="item">{{ item }}</li>
        </ol>
        <div class="flex flex-wrap gap-2">
          <UButton variant="soft" color="neutral" icon="i-lucide-copy" @click="copyCodes">{{ copied ? 'Copied' : 'Copy' }}</UButton>
          <UButton variant="soft" color="neutral" icon="i-lucide-download" @click="downloadCodes">Download</UButton>
        </div>
        <UCheckbox v-model="saved" label="I've saved my recovery codes" />
        <UButton class="self-start" :disabled="!saved" @click="finishCodes">Done</UButton>
      </template>

      <template v-else-if="status && !status.two_factor">
        <p class="text-muted">
          Off by default. When it's on, logging in needs your password and then a 6-digit code from an authenticator app on your phone,
          such as Google Authenticator, 1Password, or Authy. Someone who learns your password still can't get in. Frames aren't affected.
        </p>

        <UButton v-if="setupStep === 'idle'" class="self-start" icon="i-lucide-shield-check" @click="setupStep = 'password'">Turn on two-factor login</UButton>

        <form v-else-if="setupStep === 'password'" class="flex max-w-sm flex-col gap-3" @submit.prevent="startSetup">
          <UFormField label="Your admin password" :error="setupError || undefined">
            <UInput v-model="setupPassword" type="password" name="setup-password" autocomplete="current-password" required autofocus class="w-full" />
          </UFormField>
          <div class="flex gap-2">
            <UButton type="submit" :loading="working" :disabled="!setupPassword">Continue</UButton>
            <UButton variant="soft" color="neutral" :disabled="working" @click="cancelSetup">Cancel</UButton>
          </div>
        </form>

        <form v-else-if="setupStep === 'scan'" class="flex flex-col gap-4" @submit.prevent="confirmSetup">
          <ol class="flex list-decimal flex-col gap-2 ps-5">
            <li>In your authenticator app, add an account and scan this code.</li>
            <li>Type the 6-digit code the app shows for OpenMantel.</li>
          </ol>
          <!-- Made on the server from the secret below; it contains no outside content. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="size-56 rounded-md bg-white p-2" role="img" aria-label="QR code for your authenticator app" v-html="qr" />
          <details class="text-sm">
            <summary class="cursor-pointer text-muted">Can't scan it? Type this key instead</summary>
            <p class="mt-2 select-all font-mono text-base tracking-wider">{{ secret }}</p>
            <p class="mt-1 text-muted">Time-based, 6 digits, every 30 seconds.</p>
          </details>
          <UFormField label="Code from the app" :error="setupError || undefined" class="max-w-xs">
            <UInput
              id="setup-code"
              v-model="setupCode"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="[0-9]{6}"
              placeholder="123456"
              required
              class="w-full font-mono tracking-widest"
            />
          </UFormField>
          <div class="flex gap-2">
            <UButton type="submit" :loading="working" :disabled="setupCode.length !== 6">Turn on</UButton>
            <UButton variant="soft" color="neutral" :disabled="working" @click="cancelSetup">Cancel</UButton>
          </div>
        </form>
      </template>

      <template v-else-if="status">
        <p class="text-muted">
          Logging in needs your password and then the code from your authenticator app.
          You have {{ status.recovery_codes_left }} unused recovery {{ status.recovery_codes_left === 1 ? 'code' : 'codes' }}.
        </p>
        <p v-if="status.recovery_codes_left <= 3" class="text-warning">Running low on recovery codes. Make new ones and save them.</p>
        <div class="flex flex-wrap gap-2">
          <UButton variant="soft" color="neutral" icon="i-lucide-refresh-cw" @click="guarded = 'recovery'">New recovery codes</UButton>
          <UButton variant="soft" color="error" icon="i-lucide-shield-off" @click="guarded = 'disable'">Turn off two-factor login</UButton>
        </div>
      </template>
    </section>

    <section aria-labelledby="locked-out" class="flex max-w-3xl flex-col gap-2 rounded-lg border border-default p-4">
      <h2 id="locked-out" class="text-xl font-bold">If you lose your phone and your recovery codes</h2>
      <p class="text-muted">
        Someone with access to the server can turn two-factor login off there, then log in with the password alone:
      </p>
      <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-sm"><code>pnpm security:reset-2fa</code></pre>
      <p class="text-sm text-muted">With Docker: <code>docker compose exec app pnpm security:reset-2fa</code>. It's recorded in Activity.</p>
    </section>

    <UModal
      v-model:open="guardOpen"
      :title="guarded === 'disable' ? 'Turn off two-factor login?' : 'Make new recovery codes?'"
      :description="guarded === 'disable' ? 'Logging in will need only your password' : 'Your old recovery codes stop working'"
      :dismissible="!working"
    >
      <template #body>
        <form class="flex flex-col gap-4" @submit.prevent="submitGuarded">
          <UFormField label="Your admin password">
            <UInput v-model="guardPassword" type="password" name="guard-password" autocomplete="current-password" required class="w-full" />
          </UFormField>
          <UFormField label="Code from the app, or a recovery code">
            <UInput v-model="guardCode" name="guard-code" inputmode="text" autocomplete="one-time-code" maxlength="11" required class="w-full font-mono tracking-widest" />
          </UFormField>
          <p v-if="guardError" role="alert" class="text-sm text-error">{{ guardError }}</p>
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton size="lg" color="neutral" variant="soft" class="justify-center" :disabled="working" @click="guarded = null">Cancel</UButton>
            <UButton
              type="submit"
              size="lg"
              :color="guarded === 'disable' ? 'error' : 'primary'"
              class="justify-center"
              :disabled="!guardPassword || !guardCode || working"
              :loading="working"
            >
              {{ guarded === 'disable' ? 'Turn off' : 'Make new codes' }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </AdminShell>
</template>
