import { Outlet, NavLink, useNavigate } from "react-router";
import { 
  Home, 
  Ticket, 
  FileText, 
  Package, 
  Wrench,
  BookOpen,
  ShoppingBag,
  Workflow,
  BarChart3,
  Settings as SettingsIcon,
  Search,
  Bell,
  Plus,
  User,
  ChevronDown,
  AlertTriangle,
  GitBranch,
  Inbox as InboxIcon,
  FolderKanban
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";

const navItems = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: InboxIcon, label: "Inbox", path: "/inbox" },
  { icon: Ticket, label: "Tickets", path: "/tickets" },
  { icon: AlertTriangle, label: "Problems", path: "/problems" },
  { icon: GitBranch, label: "Changes", path: "/changes" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: Package, label: "Assets", path: "/assets" },
  { icon: BookOpen, label: "Knowledge", path: "/knowledge" },
  { icon: ShoppingBag, label: "Catalog", path: "/catalog" },
  { icon: Workflow, label: "Automations", path: "/automations" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
];

export function Layout() {
  const navigate = useNavigate();
  
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        {/* Logo */}
        <div className="mb-8">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>

        {/* Settings at bottom */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
              isActive
                ? "bg-indigo-50 text-indigo-600"
                : "text-gray-600 hover:bg-gray-100"
            }`
          }
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5" />
        </NavLink>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
          {/* Search */}
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search tickets, users, assets..."
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="default" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Ticket
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              className="relative"
              onClick={() => navigate("/notifications")}
            >
              <Bell className="w-5 h-5" />
              <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs">
                3
              </Badge>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">John Doe</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}