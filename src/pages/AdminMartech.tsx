import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertCircle, CheckCircle2, Clock3, DatabaseZap, Users, Wallet } from "lucide-react";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useMartechMetrics } from "@/hooks/useMartechMetrics";

interface AdminMartechProps {
  embeddedInAdmin?: boolean;
}

function formatPct(value: number | null) {
  if (value == null) return "No data yet";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null) {
  if (value == null) return "No data yet";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function EmptyText({ text = "No data yet" }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export default function AdminMartech({ embeddedInAdmin = false }: AdminMartechProps) {
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const { metrics, isLoading, error } = useMartechMetrics({ from, to });

  const organizerChartData = useMemo(
    () => metrics.organizerFunnel.map((step) => ({ step: step.label, value: step.value })),
    [metrics.organizerFunnel],
  );

  const tournamentChartData = useMemo(
    () => metrics.tournamentFunnel.map((step) => ({ step: step.label, value: step.value })),
    [metrics.tournamentFunnel],
  );

  const revenueChartData = metrics.revenueProxy.bySource.map((item) => ({ source: item.source, count: item.count }));

  return (
    <div className={embeddedInAdmin ? "px-0 py-0" : "container mx-auto px-6 py-8 max-w-7xl"}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Martech Dashboard</h2>
          <p className="text-muted-foreground">Organizer growth, tournament activation, import quality, and revenue proxies.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Date range for analytics (date-only picker).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <DateTimePicker label="From" value={from} onChange={setFrom} includeTime={false} />
            <DateTimePicker label="To" value={to} onChange={setTo} includeTime={false} min={from ?? undefined} />
            <Button variant="outline" className="self-end" onClick={() => { setFrom(null); setTo(null); }}>
              Clear filters
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">Failed to load metrics.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total organizers</CardDescription><CardTitle>{metrics.kpis.totalOrganizers.toLocaleString()}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Verified: {metrics.kpis.verifiedOrganizers.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Pending approvals</CardDescription><CardTitle>{metrics.kpis.pendingApprovals.toLocaleString()}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Awaiting verification</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total tournaments</CardDescription><CardTitle>{metrics.kpis.totalTournaments.toLocaleString()}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Published: {metrics.kpis.publishedTournaments.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Active pro tournaments</CardDescription><CardTitle>{metrics.kpis.activeProTournaments.toLocaleString()}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">Players: {metrics.kpis.totalPlayers.toLocaleString()}</p></CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Organizer funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? <EmptyText text="Loading..." /> : null}
              {!isLoading && organizerChartData.every((s) => s.value === 0) ? <EmptyText /> : null}
              <ChartContainer config={{ value: { label: "Count", color: "hsl(var(--primary))" } }} className="h-[220px] w-full">
                <BarChart data={organizerChartData} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="step" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={56} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                </BarChart>
              </ChartContainer>
              {metrics.organizerFunnel.find((s) => s.note)?.note ? (
                <p className="text-xs text-muted-foreground">{metrics.organizerFunnel.find((s) => s.note)?.note}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-4 w-4" /> Tournament funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isLoading && tournamentChartData.every((s) => s.value === 0) ? <EmptyText /> : null}
              <ChartContainer config={{ value: { label: "Count", color: "hsl(var(--chart-2))" } }} className="h-[220px] w-full">
                <BarChart data={tournamentChartData} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="step" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={56} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={6} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Import health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card className="bg-muted/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total imports</p><p className="text-xl font-semibold">{metrics.importHealth.totalImports}</p></CardContent></Card>
                <Card className="bg-muted/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Avg acceptance</p><p className="text-xl font-semibold">{formatPct(metrics.importHealth.avgAcceptanceRate)}</p></CardContent></Card>
                <Card className="bg-muted/20"><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Avg duration</p><p className="text-xl font-semibold">{formatMs(metrics.importHealth.avgDurationMs)}</p></CardContent></Card>
              </div>
              <div>
                <p className="text-sm font-medium">Top failure/skip reasons</p>
                {metrics.importHealth.topReasons.length === 0 ? (
                  <EmptyText />
                ) : (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {metrics.importHealth.topReasons.map((reason) => (
                      <li key={reason.reason} className="flex items-center justify-between">
                        <span>{reason.reason}</span>
                        <span className="font-medium text-foreground">{reason.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Revenue proxy</CardTitle>
              <CardDescription>Entitlements grouped by source.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {revenueChartData.length === 0 ? <EmptyText /> : null}
              {revenueChartData.length > 0 ? (
                <ChartContainer config={{ count: { label: "Entitlements", color: "hsl(var(--chart-4))" } }} className="h-[220px] w-full">
                  <BarChart data={revenueChartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="source" tickLine={false} axisLine={false} width={80} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={6} />
                  </BarChart>
                </ChartContainer>
              ) : null}
              <div className="space-y-1 text-sm text-muted-foreground">
                {revenueChartData.slice(0, 5).map((entry) => (
                  <div key={entry.source} className="flex items-center justify-between">
                    <span>{entry.source}</span>
                    <span className="font-medium text-foreground">{entry.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardContent className="pt-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Metrics update live from existing platform tables only.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
