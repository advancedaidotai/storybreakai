import { NavLink } from "@/components/NavLink";
import { Film, Bell, Settings, User } from "lucide-react";

const navItems = [
  { label: "Upload", to: "/" },
  { label: "Processing", to: "/processing" },
  { label: "Results", to: "/results" },
];

export function TopNav() {
  return (
    <header className="h-14 border-b border-border/50 glass-panel flex items-center px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2 mr-8">
        <Film className="h-5 w-5 text-primary" />
        <span className="font-bold text-lg tracking-tight">
          Story<span className="text-primary">Break</span> AI
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="px-4 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors hover:text-foreground"
            activeClassName="text-primary bg-primary/10 border-b-2 border-primary"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md">
          <Bell className="h-4 w-4" />
        </button>
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-md">
          <Settings className="h-4 w-4" />
        </button>
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
      </div>
    </header>
  );
}
