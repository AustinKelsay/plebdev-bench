/**
 * Purpose: Application header with navigation.
 * Provides links to the main dashboard views.
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
		<header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-xl">
			<div className="container mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 md:px-6">
				<Link to="/" className="mr-8 flex items-center gap-3">
					<span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-info/30 bg-info/10 text-sm font-semibold text-info">
						pb
					</span>
					<div>
						<span className="block text-lg font-semibold text-foreground">
							plebdev-bench
						</span>
						<span className="text-[11px] uppercase tracking-[0.24em] text-foreground-faint">
							open-model intelligence
						</span>
					</div>
				</Link>
				<nav className="flex items-center gap-2 rounded-full border border-border/70 bg-background-raised/70 p-1">
					{navItems.map((item) => (
						<Link
							key={item.href}
							to={item.href}
							className={cn(
								"rounded-full px-4 py-2 text-sm font-medium transition-colors hover:text-foreground",
								location.pathname.startsWith(item.href)
									? "bg-info/15 text-foreground"
									: "text-foreground-muted",
							)}
						>
							{item.label}
						</Link>
					))}
				</nav>
				<div className="hidden text-right text-xs text-foreground-faint xl:block">
					<p>Reproducible matrix benchmark</p>
					<p>Local-first artifacts, static dashboard</p>
				</div>
			</div>
		</header>
	);
}
