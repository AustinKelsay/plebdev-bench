/**
 * Purpose: Root App component with React Router setup.
 * Defines routes for leaderboard, run list, run detail, and about views.
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/header";
import { AboutRoutePage } from "./pages/about";
import { LeaderboardRoutePage } from "./pages/leaderboard";
import { RunPage } from "./pages/run";
import { RunsPage } from "./pages/runs";

function App() {
	return (
		<BrowserRouter>
			<div className="dashboard-shell min-h-screen text-foreground">
				<Header />
				<main className="container mx-auto max-w-[1500px] px-4 py-8 md:px-6">
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
		</BrowserRouter>
	);
}

export default App;
