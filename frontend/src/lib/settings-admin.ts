export const SETTINGS_ADMIN_EMAIL = "jhonkeifyd7@gmail.com"

/** Contraseña temporal al crear usuarios desde Configuración (Auth exige ≥ 6 chars). */
export const NEW_USER_TEMP_PASSWORD = "123456"

export function isSettingsAdmin(email: string | undefined | null): boolean {
  return email?.toLowerCase() === SETTINGS_ADMIN_EMAIL.toLowerCase()
}
