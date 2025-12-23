import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  MoreHorizontal,
  Eye,
  Settings,
  FileText,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
  EyeOff,
  Clock,
  Calendar,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { classifyTimeControl, type TimeControlCategory } from "@/utils/timeControl";

type FilterStatus = "all" | "active" | "draft" | "archived" | "deleted";

type AdminTournament = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  city: string | null;
  venue: string | null;
  status: string;
  is_published: boolean;
  is_archived: boolean;
  deleted_at: string | null;
  public_slug: string | null;
  created_at: string;
  time_control_base_minutes: number | null;
  time_control_increment_seconds: number | null;
  time_control_category: TimeControlCategory | null;
  owner_id: string;
  owner_email?: string;
};

const badgeVariants: Record<Exclude<TimeControlCategory, "UNKNOWN">, "destructive" | "default" | "secondary"> = {
  BLITZ: "destructive",
  RAPID: "default",
  CLASSICAL: "secondary",
};

function getDisplayStatus(t: AdminTournament): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (t.deleted_at) return { label: "Deleted", variant: "destructive" };
  if (t.is_archived) return { label: "Archived", variant: "outline" };
  if (t.is_published) return { label: "Published", variant: "default" };
  return { label: "Draft", variant: "secondary" };
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "—";
  const s = new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end ? new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  return e ? `${s} – ${e}` : s;
}

export default function AdminTournaments() {
  const { user } = useAuth();
  const { isMaster, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "archive" | "unarchive" | "softDelete" | "restore" | "hardDelete" | "hide" | null;
    tournament: AdminTournament | null;
  }>({ open: false, action: null, tournament: null });
  const [hardDeleteConfirmText, setHardDeleteConfirmText] = useState("");

  // Fetch all tournaments with owner info (admin view - master only)
  const { data: tournaments, isLoading, error } = useQuery({
    queryKey: ["admin-tournaments"],
    queryFn: async (): Promise<AdminTournament[]> => {
      // Fetch tournaments
      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from("tournaments")
        .select(
          "id, title, start_date, end_date, city, venue, status, is_published, is_archived, deleted_at, public_slug, created_at, time_control_base_minutes, time_control_increment_seconds, time_control_category, owner_id"
        )
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (tournamentsError) throw tournamentsError;
      if (!tournamentsData || tournamentsData.length === 0) return [];

      // Get unique owner IDs
      const ownerIds = [...new Set(tournamentsData.map((t) => t.owner_id).filter(Boolean))];

      // Fetch profiles for owners (master can read all profiles via RLS)
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      // Create lookup map
      const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p.email]));

      // Merge owner emails into tournaments
      return tournamentsData.map((t) => ({
        ...t,
        owner_email: profileMap.get(t.owner_id) ?? undefined,
      })) as AdminTournament[];
    },
    enabled: !!user && !roleLoading && isMaster,
  });

  // Mutation for updating tournament status
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AdminTournament> }) => {
      const { error } = await supabase.from("tournaments").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      console.log(`[admin] Updated tournament ${variables.id}`, variables.updates);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to update tournament";
      toast.error("Failed to update tournament: " + message);
    },
  });

  // Mutation for hard delete
  const hardDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete related data first (allocations, players, categories, etc.)
      await supabase.from("allocations").delete().eq("tournament_id", id);
      await supabase.from("conflicts").delete().eq("tournament_id", id);
      await supabase.from("players").delete().eq("tournament_id", id);
      // Delete categories (which cascades to prizes)
      await supabase.from("categories").delete().eq("tournament_id", id);
      await supabase.from("publications").delete().eq("tournament_id", id);
      await supabase.from("import_logs").delete().eq("tournament_id", id);
      await supabase.from("rule_config").delete().eq("tournament_id", id);
      // Finally delete the tournament
      const { error } = await supabase.from("tournaments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      toast.success("Tournament permanently deleted");
      console.log(`[admin] Hard deleted tournament ${id}`);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to delete tournament";
      toast.error("Failed to delete tournament: " + message);
    },
  });

  // Filter tournaments
  const filteredTournaments = (tournaments ?? []).filter((t) => {
    // Text search
    const matchesSearch =
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.city?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter
    switch (filterStatus) {
      case "active":
        return t.is_published && !t.is_archived && !t.deleted_at;
      case "draft":
        return !t.is_published && !t.is_archived && !t.deleted_at;
      case "archived":
        return t.is_archived && !t.deleted_at;
      case "deleted":
        return !!t.deleted_at;
      default:
        return true;
    }
  });

  // Action handlers
  const handleHideFromPublic = (t: AdminTournament) => {
    setConfirmDialog({ open: true, action: "hide", tournament: t });
  };

  const handleArchive = (t: AdminTournament) => {
    setConfirmDialog({ open: true, action: "archive", tournament: t });
  };

  const handleUnarchive = (t: AdminTournament) => {
    setConfirmDialog({ open: true, action: "unarchive", tournament: t });
  };

  const handleSoftDelete = (t: AdminTournament) => {
    setConfirmDialog({ open: true, action: "softDelete", tournament: t });
  };

  const handleRestore = (t: AdminTournament) => {
    setConfirmDialog({ open: true, action: "restore", tournament: t });
  };

  const handleHardDelete = (t: AdminTournament) => {
    setHardDeleteConfirmText("");
    setConfirmDialog({ open: true, action: "hardDelete", tournament: t });
  };

  const executeAction = () => {
    const { action, tournament } = confirmDialog;
    if (!tournament) return;

    switch (action) {
      case "hide":
        updateMutation.mutate(
          { id: tournament.id, updates: { is_published: false } },
          { onSuccess: () => toast.success("Tournament hidden from public") }
        );
        break;
      case "archive":
        updateMutation.mutate(
          { id: tournament.id, updates: { is_archived: true, is_published: false } },
          { onSuccess: () => toast.success("Tournament archived") }
        );
        break;
      case "unarchive":
        updateMutation.mutate(
          { id: tournament.id, updates: { is_archived: false } },
          { onSuccess: () => toast.success("Tournament unarchived (now draft)") }
        );
        break;
      case "softDelete":
        updateMutation.mutate(
          { id: tournament.id, updates: { is_archived: true, is_published: false, deleted_at: new Date().toISOString() } },
          { onSuccess: () => toast.success("Tournament moved to trash") }
        );
        break;
      case "restore":
        updateMutation.mutate(
          { id: tournament.id, updates: { deleted_at: null, is_archived: false } },
          { onSuccess: () => toast.success("Tournament restored as draft") }
        );
        break;
      case "hardDelete":
        hardDeleteMutation.mutate(tournament.id);
        break;
    }

    setConfirmDialog({ open: false, action: null, tournament: null });
  };

  // Access guard
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-12 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
          <p className="text-muted-foreground">You must be a master organizer to access this page.</p>
          <Button className="mt-6" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="container mx-auto px-6 py-8 text-center">
          <p className="text-destructive">Error loading tournaments. Please try again.</p>
        </div>
      </div>
    );
  }

  const filterChips: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: tournaments?.length ?? 0 },
    {
      key: "active",
      label: "Active",
      count: tournaments?.filter((t) => t.is_published && !t.is_archived && !t.deleted_at).length ?? 0,
    },
    {
      key: "draft",
      label: "Draft",
      count: tournaments?.filter((t) => !t.is_published && !t.is_archived && !t.deleted_at).length ?? 0,
    },
    {
      key: "archived",
      label: "Archived",
      count: tournaments?.filter((t) => t.is_archived && !t.deleted_at).length ?? 0,
    },
    {
      key: "deleted",
      label: "Deleted",
      count: tournaments?.filter((t) => !!t.deleted_at).length ?? 0,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Admin: Tournaments</h1>
            <p className="text-muted-foreground">Manage all tournaments – archive, hide, or delete</p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tournaments..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <Button
                key={chip.key}
                variant={filterStatus === chip.key ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(chip.key)}
                className="gap-1"
              >
                {chip.label}
                <Badge variant="secondary" className="ml-1 text-xs">
                  {chip.count}
                </Badge>
              </Button>
            ))}
          </div>
        </div>

        {/* Tournament table */}
        {filteredTournaments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {searchQuery || filterStatus !== "all"
                ? "No tournaments match your filters."
                : "No tournaments found."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tournament</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Time Control</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTournaments.map((t) => {
                  const status = getDisplayStatus(t);
                  const category =
                    t.time_control_category && t.time_control_category !== "UNKNOWN"
                      ? t.time_control_category
                      : classifyTimeControl(t.time_control_base_minutes, t.time_control_increment_seconds);
                  const tcDisplay =
                    t.time_control_base_minutes || t.time_control_increment_seconds
                      ? `${t.time_control_base_minutes ?? 0} + ${t.time_control_increment_seconds ?? 0}`
                      : null;

                  return (
                    <TableRow key={t.id} className={t.deleted_at ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-medium text-foreground">{t.title}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground truncate max-w-[180px]" title={t.owner_email}>
                          {t.owner_email || <span className="italic">Unknown</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDateRange(t.start_date, t.end_date)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[t.city, t.venue].filter(Boolean).join(" • ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tcDisplay ? (
                          <div className="flex items-center gap-2">
                            {category && category !== "UNKNOWN" && (
                              <Badge variant={badgeVariants[category]} className="text-[10px]">
                                {category}
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">{tcDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* View / Navigate actions */}
                            {t.is_published && !t.is_archived && !t.deleted_at && t.public_slug && (
                              <DropdownMenuItem onClick={() => navigate(`/p/${t.public_slug}`)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Public
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => navigate(`/t/${t.id}/setup?tab=details`)}>
                              <Settings className="mr-2 h-4 w-4" />
                              Open Setup
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/t/${t.id}/review`)}>
                              <FileText className="mr-2 h-4 w-4" />
                              Open Allocation
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            {/* State transitions */}
                            {t.is_published && !t.is_archived && !t.deleted_at && (
                              <DropdownMenuItem onClick={() => handleHideFromPublic(t)}>
                                <EyeOff className="mr-2 h-4 w-4" />
                                Hide from Public
                              </DropdownMenuItem>
                            )}

                            {!t.is_archived && !t.deleted_at && (
                              <DropdownMenuItem onClick={() => handleArchive(t)}>
                                <Archive className="mr-2 h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}

                            {t.is_archived && !t.deleted_at && (
                              <DropdownMenuItem onClick={() => handleUnarchive(t)}>
                                <ArchiveRestore className="mr-2 h-4 w-4" />
                                Unarchive
                              </DropdownMenuItem>
                            )}

                            {!t.deleted_at && (
                              <DropdownMenuItem
                                onClick={() => handleSoftDelete(t)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Move to Trash
                              </DropdownMenuItem>
                            )}

                            {t.deleted_at && (
                              <>
                                <DropdownMenuItem onClick={() => handleRestore(t)}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Restore
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleHardDelete(t)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Permanently
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Confirmation dialogs */}
      <AlertDialog
        open={confirmDialog.open && confirmDialog.action !== "hardDelete"}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, tournament: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === "hide" && "Hide from public?"}
              {confirmDialog.action === "archive" && "Archive tournament?"}
              {confirmDialog.action === "unarchive" && "Unarchive tournament?"}
              {confirmDialog.action === "softDelete" && "Move to trash?"}
              {confirmDialog.action === "restore" && "Restore tournament?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "hide" &&
                `"${confirmDialog.tournament?.title}" will be hidden from the public page but remain accessible to organizers.`}
              {confirmDialog.action === "archive" &&
                `"${confirmDialog.tournament?.title}" will be archived and hidden from public. You can unarchive it later.`}
              {confirmDialog.action === "unarchive" &&
                `"${confirmDialog.tournament?.title}" will be restored as a draft. You'll need to re-publish to make it public.`}
              {confirmDialog.action === "softDelete" &&
                `"${confirmDialog.tournament?.title}" will be moved to trash. You can restore it or permanently delete later.`}
              {confirmDialog.action === "restore" &&
                `"${confirmDialog.tournament?.title}" will be restored as a draft.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeAction}>
              {confirmDialog.action === "hide" && "Hide"}
              {confirmDialog.action === "archive" && "Archive"}
              {confirmDialog.action === "unarchive" && "Unarchive"}
              {confirmDialog.action === "softDelete" && "Move to Trash"}
              {confirmDialog.action === "restore" && "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hard delete confirmation - requires typing title */}
      <AlertDialog
        open={confirmDialog.open && confirmDialog.action === "hardDelete"}
        onOpenChange={(open) => !open && setConfirmDialog({ open: false, action: null, tournament: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently delete tournament?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{confirmDialog.tournament?.title}" and ALL related data (players,
              allocations, categories, prizes). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Type <span className="font-mono font-bold text-foreground">{confirmDialog.tournament?.title}</span> to
              confirm:
            </p>
            <Input
              value={hardDeleteConfirmText}
              onChange={(e) => setHardDeleteConfirmText(e.target.value)}
              placeholder="Type tournament title..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setHardDeleteConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={hardDeleteConfirmText !== confirmDialog.tournament?.title}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
