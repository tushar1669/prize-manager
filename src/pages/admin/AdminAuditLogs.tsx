import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { AlertCircle, Search, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const PAGE_SIZE = 25;

const SEVERITY_COLORS: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  error: "destructive",
  warn: "default",
  info: "secondary",
};

type AuditEvent = {
  id: string;
  event_type: string;
  severity: string;
  reference_id: string;
  message: string;
  friendly_message: string | null;
  suggested_action: string | null;
  route: string | null;
  user_id: string | null;
  user_email_hash: string | null;
  context: Record<string, unknown>;
  created_at: string;
};

interface AdminAuditLogsProps {
  embeddedInAdmin?: boolean;
}

export default function AdminAuditLogs({ embeddedInAdmin = false }: AdminAuditLogsProps) {
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const queryKey = useMemo(
    () => ["admin-audit-logs", from?.toISOString(), to?.toISOString(), eventTypeFilter, severityFilter, searchQuery, page],
    [from, to, eventTypeFilter, severityFilter, searchQuery, page]
  );

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("audit_events")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (from) {
        query = query.gte("created_at", from.toISOString());
      }
      if (to) {
        const endOfDay = new Date(to);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }
      if (eventTypeFilter && eventTypeFilter !== "all") {
        query = query.eq("event_type", eventTypeFilter);
      }
      if (severityFilter && severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }
      if (searchQuery.trim()) {
        query = query.or(
          `reference_id.ilike.%${searchQuery.trim()}%,message.ilike.%${searchQuery.trim()}%,friendly_message.ilike.%${searchQuery.trim()}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { events: (data ?? []) as AuditEvent[], totalCount: count ?? 0 };
    },
  });

  const events = data?.events ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Get distinct event types for filter
  const { data: eventTypes } = useQuery({
    queryKey: ["admin-audit-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("event_type")
        .limit(1000);
      if (error) throw error;
      const unique = [...new Set((data ?? []).map((r) => r.event_type))].sort();
      return unique;
    },
  });

  const clearFilters = useCallback(() => {
    setFrom(null);
    setTo(null);
    setEventTypeFilter("all");
    setSeverityFilter("all");
    setSearchQuery("");
    setPage(0);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(0);
  }, []);

  return (
    <div className={embeddedInAdmin ? "px-0 py-0" : "container mx-auto px-6 py-8 max-w-7xl"}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Audit Logs</h2>
          <p className="text-muted-foreground">Error events and runtime diagnostics.</p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto]">
            <DateTimePicker label="From" value={from} onChange={(d) => { setFrom(d); setPage(0); }} includeTime={false} />
            <DateTimePicker label="To" value={to} onChange={(d) => { setTo(d); setPage(0); }} includeTime={false} min={from ?? undefined} />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Event type</label>
              <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {(eventTypes ?? []).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Severity</label>
              <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Ref ID or text…"
                  className="pl-8 w-[180px]"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">&nbsp;</label>
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear</Button>
            </div>
          </CardContent>
        </Card>

        {/* Error state */}
        {error && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">Failed to load audit logs.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          {isLoading ? (
            <CardContent className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          ) : events.length === 0 ? (
            <CardContent className="py-12 text-center text-muted-foreground" data-testid="audit-empty">
              No audit events found.
            </CardContent>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Time</TableHead>
                    <TableHead className="w-[80px]">Severity</TableHead>
                    <TableHead className="w-[140px]">Type</TableHead>
                    <TableHead className="w-[90px]">Ref</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[100px]">Route</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((evt) => (
                    <TableRow
                      key={evt.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedEvent(evt)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(evt.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SEVERITY_COLORS[evt.severity] ?? "outline"} className="text-[10px]">
                          {evt.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{evt.event_type}</TableCell>
                      <TableCell className="text-xs font-mono">{evt.reference_id}</TableCell>
                      <TableCell className="text-xs truncate max-w-[300px]" title={evt.message}>
                        {evt.friendly_message || evt.message}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{evt.route ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  {totalCount} event{totalCount !== 1 ? "s" : ""} total
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs px-2">{page + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Detail drawer */}
        <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <SheetContent className="sm:max-w-lg overflow-y-auto">
            {selectedEvent && (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Badge variant={SEVERITY_COLORS[selectedEvent.severity] ?? "outline"}>
                      {selectedEvent.severity}
                    </Badge>
                    <span className="font-mono text-sm">{selectedEvent.event_type}</span>
                  </SheetTitle>
                  <SheetDescription>
                    Ref: {selectedEvent.reference_id} · {new Date(selectedEvent.created_at).toLocaleString()}
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  {selectedEvent.friendly_message && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Friendly message</h4>
                      <p className="text-sm">{selectedEvent.friendly_message}</p>
                    </div>
                  )}
                  {selectedEvent.suggested_action && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Suggested action</h4>
                      <p className="text-sm">{selectedEvent.suggested_action}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Raw message</h4>
                    <p className="text-sm font-mono bg-muted/30 p-2 rounded break-all">{selectedEvent.message}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Route</h4>
                    <p className="text-sm">{selectedEvent.route ?? "—"}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">User</h4>
                    <p className="text-sm font-mono">{selectedEvent.user_id ?? "anonymous"}</p>
                    {selectedEvent.user_email_hash && (
                      <p className="text-xs text-muted-foreground mt-1">Email hash: {selectedEvent.user_email_hash.slice(0, 16)}…</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">Context</h4>
                    <pre className="text-xs font-mono bg-muted/30 p-3 rounded overflow-x-auto max-h-[300px]">
                      {JSON.stringify(selectedEvent.context, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
