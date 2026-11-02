<script setup lang="ts">
// Type-ahead tag picker. New tags are added inline.
const model = defineModel<string[]>({ required: true })
defineProps<{ label: string, options: string[] }>()

function create(name: string) {
  const clean = name.replaceAll(',', ' ').trim().slice(0, 40)
  if (clean && !model.value.includes(clean)) model.value = [...model.value, clean]
}
</script>

<template>
  <UFormField :label="label">
    <UInputMenu
      v-model="model"
      :items="options"
      multiple
      create-item
      name="tags"
      placeholder="Pick or type tags"
      class="w-full"
      @create="create"
    />
  </UFormField>
</template>
