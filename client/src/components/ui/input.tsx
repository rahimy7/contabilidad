import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // El foco engrosa el borde con el acento en vez de dibujar un anillo
          // difuso alrededor: en formularios densos el anillo se solapa con el
          // campo de al lado.
          "flex h-8 w-full rounded-sm border border-input bg-background px-2.5 py-1 text-[13px] file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
