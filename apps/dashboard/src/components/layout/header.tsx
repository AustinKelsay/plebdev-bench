/**
 * Purpose: Application header with navigation.
 * Provides links to Runs, Compare views.
 */
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Header() {
  const location = useLocation();

  const navItems = [
    { href: "/runs", label: "Runs" },
    { href: "/compare", label: "Compare" },
  ];

  return (
    <header className="border-b border-border bg-background-raised">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link to="/" className="mr-8 flex items-center space-x-2">
          <span className="text-lg font-semibold text-foreground">
            plebdev-bench
          </span>
          <span className="text-xs text-foreground-faint">dashboard</span>
        </Link>
        <nav className="flex items-center space-x-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-foreground",
                location.pathname.startsWith(item.href)
                  ? "text-foreground"
                  : "text-foreground-muted"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
