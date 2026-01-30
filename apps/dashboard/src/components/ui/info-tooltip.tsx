/**
 * Purpose: Reusable info tooltip component with question mark trigger.
 * Uses Radix UI Tooltip for accessibility and consistent styling.
 */
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Info tooltip with question mark icon trigger.
 * Shows explanatory text on hover/focus.
 */
export function InfoTooltip({ content, side = "top", className }: InfoTooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center justify-center rounded-full",
              "w-4 h-4 text-[10px] font-medium",
              "border border-border text-foreground-muted",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
              "transition-colors",
              className
            )}
            aria-label="More information"
          >
            ?
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={4}
            className={cn(
              "z-50 max-w-xs px-3 py-2 text-sm",
              "bg-background-raised border border-border rounded shadow-md",
              "text-foreground-muted font-normal",
              "animate-in fade-in-0 zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-2",
              "data-[side=left]:slide-in-from-right-2",
              "data-[side=right]:slide-in-from-left-2",
              "data-[side=top]:slide-in-from-bottom-2"
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-background-raised" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/**
 * Wrapper to add info tooltip next to any content.
 * Provides consistent spacing and alignment.
 */
export function WithInfoTooltip({
  children,
  tooltip,
  side = "top",
}: {
  children: React.ReactNode;
  tooltip: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTooltip content={tooltip} side={side} />
    </span>
  );
}
