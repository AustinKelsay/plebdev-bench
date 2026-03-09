/**
 * Purpose: Shared text input primitive for dashboard filters.
 * Exports: Input
 *
 * Invariants:
 * - Matches the dashboard terminal-native visual language
 * - Keeps focus treatment consistent with select/button primitives
 */

import { cn } from "@/lib/utils";
import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
	({ className, type = "text", ...props }, ref) => (
		<input
			ref={ref}
			type={type}
			className={cn(
				"flex h-9 w-full rounded border border-border bg-background/60 px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-foreground-faint focus:border-info/60 focus:ring-1 focus:ring-info/40 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	),
);
Input.displayName = "Input";

export { Input };
