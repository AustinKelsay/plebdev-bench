/**
 * Purpose: Root App component with React Router setup.
 * Defines routes for leaderboard, run list, run detail, and about views.
 */
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/header";
import { AboutRoutePage } from "./pages/about";
import { LeaderboardRoutePage } from "./pages/leaderboard";
import { RunPage } from "./pages/run";
import { RunsPage } from "./pages/runs";

function App() {
	return (
		<HashRouter>
			<div className="min-h-screen bg-background text-foreground">
				<Header />
				<main className="container mx-auto px-4 py-6">
					<Routes>
						<Route path="/" element={<Navigate to="/leaderboard" replace />} />
						<Route path="/about" element={<AboutRoutePage />} />
						<Route path="/leaderboard" element={<LeaderboardRoutePage />} />
						<Route path="/runs" element={<RunsPage />} />
						<Route path="/runs/:runId" element={<RunPage />} />
						<Route path="*" element={<Navigate to="/leaderboard" replace />} />
					</Routes>
				</main>
			</div>
		</HashRouter>
	);
}

export default App;
