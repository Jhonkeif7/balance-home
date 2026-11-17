import { useEffect, useState } from "react"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/Button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { BrandLogo, BRAND_ICON } from "@/components/brand/BrandLogo"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2, Mail, Lock, Moon, Sun } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

/** Varias casas tenues en el fondo (solo escritorio / tablet). */
const BG_ICONS = [
  { top: "8%", left: "6%", size: "9rem", rotate: "-12deg", opacity: 0.07 },
  { top: "18%", right: "8%", size: "7rem", rotate: "18deg", opacity: 0.06 },
  { bottom: "12%", left: "10%", size: "11rem", rotate: "8deg", opacity: 0.08 },
  { bottom: "18%", right: "6%", size: "8.5rem", rotate: "-16deg", opacity: 0.07 },
  { top: "42%", left: "2%", size: "6rem", rotate: "22deg", opacity: 0.05 },
  { top: "55%", right: "3%", size: "10rem", rotate: "-8deg", opacity: 0.06 },
  { top: "70%", left: "28%", size: "5.5rem", rotate: "14deg", opacity: 0.04 },
  { top: "12%", left: "42%", size: "5rem", rotate: "-20deg", opacity: 0.04 },
] as const

const LoginPage = () => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isOpenModal, setIsOpenModal] = useState(false)
  const navigate = useNavigate()
  const { session, signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const isFormValid = email.trim() !== "" && password.trim() !== ""

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true })
  }, [session, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || isLoading) return

    setFormError(null)
    setIsLoading(true)

    try {
      await signIn(email.trim(), password)
      toast.success("Inicio de sesión exitoso")
      navigate("/dashboard", { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Correo o contraseña incorrectos"
      const friendly =
        message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : message
      setFormError(friendly)
      toast.error(friendly)
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      {/* Fondo: varios íconos de casa tenues (ocultos en pantallas pequeñas) */}
      <div
        className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block"
        aria-hidden="true"
      >
        {BG_ICONS.map((icon, i) => (
          <img
            key={i}
            src={BRAND_ICON}
            alt=""
            className="absolute object-contain select-none"
            style={{
              top: "top" in icon ? icon.top : undefined,
              bottom: "bottom" in icon ? icon.bottom : undefined,
              left: "left" in icon ? icon.left : undefined,
              right: "right" in icon ? icon.right : undefined,
              width: icon.size,
              height: icon.size,
              opacity: icon.opacity,
              transform: `rotate(${icon.rotate})`,
            }}
          />
        ))}
      </div>

      {/* Toggle de tema (accesible desde el login) */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-3 right-3 z-20 text-muted-foreground hover:text-foreground"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      {/* Contenedor con scroll vertical (teclado / pantallas bajas) */}
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6">
        <div
          className={cn(
            "w-full max-w-[440px] rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
            "p-6 sm:p-8"
          )}
        >
          {/* Logo horizontal según tema */}
          <BrandLogo className="mb-6 h-14 w-auto max-w-[280px] sm:h-16 sm:max-w-[320px]" />

          <header className="mb-6 space-y-2 text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Inicia sesión
            </h1>
            <p className="text-sm font-normal leading-relaxed text-muted-foreground sm:text-base">
              Accede a tu hogar en{" "}
              <span className="text-lg font-semibold text-primary sm:text-xl">
                Balance Home
              </span>
              .
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email" className="font-semibold text-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Correo electrónico
              </Label>
              <Input
                id="email"
                name="username"
                type="email"
                placeholder="nombre@correo.com"
                required
                autoComplete="username"
                disabled={isLoading}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (formError) setFormError(null)
                }}
                aria-invalid={formError ? true : undefined}
                className="h-11 bg-muted/40"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-semibold text-foreground">
                <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Introduce tu contraseña"
                  required
                  autoComplete="current-password"
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (formError) setFormError(null)
                  }}
                  aria-invalid={formError ? true : undefined}
                  className="h-11 bg-muted/40 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
                  onClick={() => setIsOpenModal(true)}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 min-h-[44px] w-full font-semibold"
              disabled={!isFormValid || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Iniciando sesión…
                </>
              ) : (
                "Iniciar sesión"
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Recuperación de contraseña */}
      <Dialog
        open={isOpenModal}
        onOpenChange={(open) => {
          if (!open) setIsOpenModal(false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu correo para recuperar tu contraseña
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
            <p className="text-center text-sm text-warning">
              Estamos trabajando en esta funcionalidad
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setIsOpenModal(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LoginPage
