<script setup lang="ts">
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function login() {
  error.value = ''
  submitting.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'X-Requested-With': 'fetch' },
      body: { password: password.value },
    })
    await navigateTo('/admin')
  }
  catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    error.value = status === 429 ? 'Too many attempts. Try again shortly.' : 'That password is not correct.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex items-center justify-center p-4">
    <form class="w-full max-w-xs flex flex-col gap-3" @submit.prevent="login">
      <h1 class="text-5xl font-extrabold tracking-tight">pictures</h1>
      <UFormField label="Password" :error="error || undefined">
        <UInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          autofocus
          class="w-full"
        />
      </UFormField>
      <UButton type="submit" block :loading="submitting">Log in</UButton>
    </form>
  </main>
</template>
