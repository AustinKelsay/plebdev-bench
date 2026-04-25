/**
 * Purpose: Shared section heading with left-border accent.
 * Exports: SectionHeading
 *
 * Invariants:
 * - SectionHeading is presentational and has no import-time side effects.
 * - Layout and accent classes remain stable across dashboard sections.
 */

/**
 * Section heading with green left-border accent for visual consistency.
 *
 * @param title - Section title text
 * @param description - Muted description below the title
 * @returns React element containing the heading and description.
 * @throws Never throws.
 */
export function SectionHeading({
	title,
	description,
}: { title: string; description: string }) {
	return (
		<div className="space-y-1 border-l-2 border-l-success pl-4">
			<h2 className="text-lg font-semibold text-foreground">{title}</h2>
			<p className="text-sm text-foreground-muted">{description}</p>
		</div>
	);
}
