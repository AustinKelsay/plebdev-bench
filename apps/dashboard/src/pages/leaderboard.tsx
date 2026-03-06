/**
 * Purpose: Leaderboard route entrypoint wiring page-level route to leaderboard view component.
 * Exports: LeaderboardRoutePage
 *
 * Invariants:
 * - Route component is render-only and owns no data-fetch logic.
 * - Actual leaderboard fetch/state/render logic lives in `LeaderboardPage`.
 */
import { LeaderboardPage } from "@/components/leaderboard/leaderboard-page";

/**
 * Renders the leaderboard route page.
 *
 * @returns JSX element containing the leaderboard view
 * @throws {Error} Does not throw directly; rendering errors bubble from child components
 */
export function LeaderboardRoutePage() {
	return <LeaderboardPage />;
}
