/**
 * Purpose: Root App component with React Router setup.
 * Defines routes for run list, run detail, and compare views.
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Header } from "./components/layout/header";
import { RunsPage } from "./pages/runs";
import { RunPage } from "./pages/run";
import { ComparePage } from "./pages/compare";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Navigate to="/runs" replace />} />
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
