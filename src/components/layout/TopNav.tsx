import { NavLink } from "@/components/NavLink";
import { Film, Bell, Settings, User } from "lucide-react";

const navItems = [
  { label: "Upload", to: "/" },
  { label: "Processing", to: "/processing" },
  { label: "Results", to: "/results" },
];

export function TopNav() {
  return (
    <header className="h-12 border-b border-border/30 bg-surface-1/80 backdrop-blur-xl flex items-center px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2.5 mr-10">
        <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Film className="h-4 w-4 text-primary" />
        </div>
        <span className="font-bold text-sm tracking-tight text-foreground">
          Story<span className="text-primary">Break</span>
          <span className="text-muted-foreground font-normal ml-1">AI</span>
        </span>
      </div>

      <nav className="flex items-center gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="px-3.5 py-1.5 text-xs font-medium text-muted-foreground rounded-lg transition-all duration-200 hover:text-foreground hover:bg-surface-2/60"
            activeClassName="!text-primary bg-primary/10"
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
        <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center ml-1">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    </header>
  );
}
