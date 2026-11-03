// Role: admin. Whether two-factor login is on, and how many recovery codes are left.
export default defineEventHandler(() => ({
  two_factor: twoFactorEnabled(),
  recovery_codes_left: twoFactorEnabled() ? recoveryCodesLeft() : 0,
}))
