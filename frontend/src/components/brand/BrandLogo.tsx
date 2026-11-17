import { cn } from "@/lib/utils";

const LOGO_LIGHT = "/BalanceHome_logo_lightmode.png";
const LOGO_DARK = "/BalanceHome_logo_darkmode.png";
export const BRAND_ICON = "/BalanceHome_icon.png";

type BrandLogoProps = {
    className?: string;
    /** Logo completo con nombre; usa el asset según el tema activo. */
    variant?: "full" | "icon";
};

export function BrandLogo({ className, variant = "full" }: BrandLogoProps) {
    if (variant === "icon") {
        return (
            <img
                src={BRAND_ICON}
                alt="Balance Home"
                className={cn("object-contain", className)}
            />
        );
    }

    // El cambio de tema se resuelve por CSS (clase .dark en <html>), así el logo
    // se actualiza al instante sin depender del estado de otro componente.
    return (
        <>
            <img
                src={LOGO_LIGHT}
                alt="Balance Home"
                className={cn("object-contain object-left dark:hidden", className)}
            />
            <img
                src={LOGO_DARK}
                alt="Balance Home"
                className={cn("hidden object-contain object-left dark:block", className)}
            />
        </>
    );
}
