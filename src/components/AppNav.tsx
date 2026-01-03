import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { GuardedLink } from "@/components/GuardedLink";
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
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export function AppNav() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { role } = useUserRole();
  const [logoFailed, setLogoFailed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/auth");
  };

  return (
    <nav className="border-b border-border bg-card/95">
      <div className="container mx-auto px-6">
        <div className="flex h-16 items-center justify-between">
          <GuardedLink to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {logoFailed ? (
              <>
                <Trophy className="h-6 w-6 text-primary" />
                <span className="text-xl font-semibold text-foreground">Prize Manager</span>
              </>
            ) : (
              <img
                src="/brand/prize-manager-logo.png"
                alt="Prize-Manager"
                className="h-7 w-auto max-w-[140px] object-contain shrink-0 sm:h-8 sm:max-w-[180px]"
                onError={() => setLogoFailed(true)}
              />
            )}
          </GuardedLink>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{user?.email || 'User'}</span>
                  {role === "master" && (
                    <Badge variant="outline" className="ml-2 bg-accent/10 text-accent border-accent/30">
                      Master
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/account')}>
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
