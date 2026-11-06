"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "border-cyan-400/55 bg-zinc-950 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]",
      "data-[state=unchecked]:border-cyan-500/50 data-[state=unchecked]:bg-zinc-900",
      "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
      "data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--primary)/0.75),0_0_14px_hsl(var(--primary)/0.5),0_0_26px_hsl(var(--primary)/0.25)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full border border-zinc-600/90 bg-zinc-100 shadow-md ring-0 transition-transform",
        "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5",
        "data-[state=checked]:border-primary/50 data-[state=checked]:bg-primary-foreground",
        "data-[state=checked]:shadow-[0_0_10px_hsl(var(--primary)/0.4)]",
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
