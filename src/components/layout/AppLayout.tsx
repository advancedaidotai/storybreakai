import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "hsl(220 20% 7%)" }}>
      <TopNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="py-4 text-center">
        <p className="text-[11px] text-muted-foreground/40">
          © 2026{" "}
          <a href="https://AdvancedAI.ai" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors underline underline-offset-2">
            AdvancedAI.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
