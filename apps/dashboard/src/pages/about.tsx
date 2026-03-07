/**
 * Purpose: About page route entrypoint.
 * Exports: AboutRoutePage
 *
 * Invariants:
 * - Route component is render-only and delegates content rendering.
 */

import { AboutPage } from "@/components/about/about-page";

/**
 * Renders the dashboard about page route.
 *
 * @returns JSX element containing the benchmark about view
 */
export function AboutRoutePage() {
	return <AboutPage />;
}
