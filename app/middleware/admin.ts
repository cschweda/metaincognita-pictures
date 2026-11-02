export default defineNuxtRouteMiddleware(async () => {
  const fetchWithCookies = useRequestFetch()
  const { admin } = await fetchWithCookies<{ admin: boolean }>('/api/auth/session')
  if (!admin) return navigateTo('/login')
})
