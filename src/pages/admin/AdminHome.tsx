import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { EdgeFunctionStatus } from "@/components/EdgeFunctionStatus";

import { ADMIN_SECTIONS } from "@/components/admin/adminSections";

export default function AdminHome() {
  const { data: publishDriftRows, isLoading: publishDriftLoading } = useQuery({
    queryKey: ["admin-publish-state-drift"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournament_publish_state_drift" as never)
        .select("tournament_id, tournament_title, flags_disagree, active_publication_disagrees, workflow_inconsistent")
        .order("tournament_title", { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{
        tournament_id: string;
        tournament_title: string;
        flags_disagree: boolean;
        active_publication_disagrees: boolean;
        workflow_inconsistent: boolean;
      }>;
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin Overview</CardTitle>
          <CardDescription>Choose a section to manage platform operations.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {ADMIN_SECTIONS.filter((link) => link.to !== "/admin").map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <CardTitle className="text-lg">{link.label}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-primary">Open section →</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operations Diagnostics</CardTitle>
          <CardDescription>Manual health probes for platform runtime checks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 rounded-lg border p-4">
            <div className="mb-2 flex items-center gap-2">
              {publishDriftRows?.length ? (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <h3 className="font-medium">Publish State Drift</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Read-only check for mismatch between tournament publish flags, workflow status, and active publications.
            </p>
            <div className="mt-3">
              {publishDriftLoading ? (
                <p className="text-sm text-muted-foreground">Loading drift status…</p>
              ) : publishDriftRows?.length ? (
                <>
                  <Badge variant="secondary" className="mb-2">{publishDriftRows.length} drift row(s) detected (showing up to 5)</Badge>
                  <ul className="space-y-1 text-sm">
                    {publishDriftRows.map((row) => (
                      <li key={row.tournament_id} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{row.tournament_title}</span>
                        {": "}
                        {[row.flags_disagree && "flags", row.active_publication_disagrees && "active publication", row.workflow_inconsistent && "workflow"]
                          .filter(Boolean)
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No publish-state drift detected.</p>
              )}
            </div>
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="edge-function-status">
              <AccordionTrigger>Edge Function Health Probe</AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <EdgeFunctionStatus />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
