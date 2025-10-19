import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Eye, Trash2, Edit, Search } from "lucide-react";

interface Tournament {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  status: "draft" | "finalized" | "published";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const tournaments: Tournament[] = [
    {
      id: "1",
      title: "National Chess Championship 2024",
      startDate: "2024-11-01",
      endDate: "2024-11-05",
      status: "published",
    },
    {
      id: "2",
      title: "Junior State Tournament",
      startDate: "2024-12-10",
      endDate: "2024-12-12",
      status: "finalized",
    },
    {
      id: "3",
      title: "Regional Open",
      startDate: "2025-01-15",
      endDate: "2025-01-17",
      status: "draft",
    },
  ];

  const handleCreateTournament = () => {
    const newId = Date.now().toString();
    navigate(`/t/${newId}/setup?tab=details`);
  };

  const handleResume = (tournament: Tournament) => {
    if (tournament.status === "draft") {
      navigate(`/t/${tournament.id}/setup?tab=details`);
    } else if (tournament.status === "finalized") {
      navigate(`/t/${tournament.id}/finalize`);
    } else {
      navigate(`/t/${tournament.id}/publish`);
    }
  };

  const handleView = (id: string) => {
    navigate(`/t/${id}/public`);
  };

  const handleDelete = (id: string) => {
    // Mock delete
    console.log("Delete tournament:", id);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav userRole="organizer" userName="John Arbiter" />
      
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">My Tournaments</h1>
          <p className="text-muted-foreground">Manage prize allocations for your chess events</p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={handleCreateTournament} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Tournament
          </Button>
        </div>

        <div className="bg-card rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="text-foreground font-semibold">Tournament Name</TableHead>
                <TableHead className="text-foreground font-semibold">Dates</TableHead>
                <TableHead className="text-foreground font-semibold">Status</TableHead>
                <TableHead className="text-right text-foreground font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tournaments.map((tournament) => (
                <TableRow key={tournament.id} className="border-border">
                  <TableCell className="font-medium text-foreground">{tournament.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(tournament.startDate).toLocaleDateString()} -{" "}
                    {new Date(tournament.endDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={tournament.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(tournament)}
                      >
                        {tournament.status === "published" ? "Manage" : "Resume"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {tournament.status === "published" && (
                            <DropdownMenuItem onClick={() => handleView(tournament.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Public Page
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => navigate(`/t/${tournament.id}/settings`)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(tournament.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {tournaments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No tournaments yet</p>
            <Button onClick={handleCreateTournament} variant="outline">
              Create your first tournament
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
