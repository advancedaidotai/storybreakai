import { NavLink } from "@/components/NavLink";
import { Bell, Settings, User } from "lucide-react";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Library", to: "/library" },
  { label: "Analytics", to: "/analytics" },
];

export function TopNav() {
  return (
    <header className="h-12 border-b border-border/20 flex items-center px-6 sticky top-0 z-30" style={{ backgroundColor: "hsl(216 40% 4%)" }}>
      <nav className="flex items-center gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground rounded-lg transition-all duration-200 hover:text-foreground hover:bg-surface-2/60"
            activeClassName="!text-primary border-b-2 !border-primary rounded-none"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-surface-2/60">
          <Bell className="h-3.5 w-3.5" />
        </button>
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-surface-2/60">
          <Settings className="h-3.5 w-3.5" />
        </button>
        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center ml-1.5">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    </header>
  );
}
