import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { DashboardSidebar } from "./DashboardSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "hsl(220 20% 7%)" }}>
      <DashboardSidebar />
      <div className="flex-1 flex flex-col ml-[220px]">
        <TopNav />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
