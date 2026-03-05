/**
 * Purpose: Root App component with React Router setup.
 * Defines routes for run list, run detail, and compare views.
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/header";
import { ComparePage } from "./pages/compare";
import { LeaderboardRoutePage } from "./pages/leaderboard";
import { RunPage } from "./pages/run";
import { RunsPage } from "./pages/runs";

function App() {
	return (
		<BrowserRouter>
			<div className="min-h-screen bg-background text-foreground">
				<Header />
				<main className="container mx-auto px-4 py-6">
					<Routes>
						<Route path="/" element={<Navigate to="/leaderboard" replace />} />
						<Route path="/leaderboard" element={<LeaderboardRoutePage />} />
						<Route path="/runs" element={<RunsPage />} />
						<Route path="/runs/:runId" element={<RunPage />} />
						<Route path="/compare" element={<ComparePage />} />
						<Route path="/compare/:runA/:runB" element={<ComparePage />} />
					</Routes>
				</main>
			</div>
		</BrowserRouter>
	);
}

export default App;
