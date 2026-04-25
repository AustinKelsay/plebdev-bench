/**
 * Purpose: Application header with navigation, gradient accent bar, and brand styling.
 * Exports: Header
 *
 * Invariants:
 * - Importing this module has no side effects.
 * - Header navigation is derived from the current router location.
 */
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";

/**
 * Renders the persistent dashboard header navigation.
 *
 * @returns React element containing brand and primary navigation
 */
export function Header() {
	const location = useLocation();

	const navItems = [
		{ href: "/leaderboard", label: "Leaderboard" },
		{ href: "/runs", label: "Runs" },
		{ href: "/about", label: "About" },
	];

	return (
		<>
			{/* Thin gradient brand bar */}
			<div
				className="h-0.5 w-full"
				style={{ background: "var(--gradient-brand)" }}
			/>
			<header className="relative border-b border-border bg-background-raised noise-overlay">
				<div className="container mx-auto flex h-14 items-center px-4 relative z-10">
					<Link to="/" className="mr-8 flex items-center space-x-0">
						<span className="text-lg font-semibold text-success">plebdev</span>
						<span className="text-lg font-semibold text-foreground">
							-bench
						</span>
					</Link>
					<nav className="flex items-center space-x-6">
						{navItems.map((item) => {
							const isActive = location.pathname.startsWith(item.href);
							return (
								<Link
									key={item.href}
									to={item.href}
									className={cn(
										"relative text-sm font-medium transition-colors hover:text-foreground pb-0.5",
										isActive ? "text-foreground" : "text-foreground-muted",
									)}
								>
									{item.label}
									{isActive && (
										<span
											className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
											style={{
												background: "hsl(var(--success))",
												boxShadow: "0 0 8px hsl(var(--success) / 0.4)",
											}}
										/>
									)}
								</Link>
							);
						})}
					</nav>
				</div>
			</header>
		</>
	);
}
