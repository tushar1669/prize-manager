import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trophy, User, LogOut, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AppNavProps {
  userRole?: "master" | "organizer";
  userName?: string;
}

export function AppNav({ userRole = "organizer", userName = "User" }: AppNavProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/auth");
  };

  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold text-foreground">Prize Manager</span>
          </Link>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{userName}</span>
                  {userRole === "master" && (
                    <Badge variant="outline" className="ml-2 bg-accent/10 text-accent border-accent/30">
                      Master
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
