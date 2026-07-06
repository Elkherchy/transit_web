import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, lang, dir, ...props }: React.ComponentProps<"input">) {
  // Les champs numériques doivent toujours afficher des chiffres occidentaux
  // (0-9) et se lire de gauche à droite, même quand la page est en arabe
  // (lang="ar") — sinon Chrome rend la valeur en chiffres arabes (٠١٢٣).
  const isNumber = type === "number";
  return (
    <input
      type={type}
      lang={lang ?? (isNumber ? "fr" : undefined)}
      dir={dir ?? (isNumber ? "ltr" : undefined)}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
