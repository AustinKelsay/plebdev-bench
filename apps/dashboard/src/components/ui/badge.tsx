import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
/**
 * Purpose: Badge component for status and labels.
 * Based on shadcn/ui Badge with terminal-native styling.
 */
import type * as React from "react";

const badgeVariants = cva(
	"inline-flex items-center rounded px-2 py-0.5 text-xs font-medium font-mono transition-colors",
	{
		variants: {
			variant: {
				default: "bg-primary/20 text-primary",
				secondary: "bg-secondary text-secondary-foreground",
				success: "bg-success/20 text-success",
				warning: "bg-warning/20 text-warning",
				destructive: "bg-destructive/20 text-destructive",
				outline: "border border-border text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
