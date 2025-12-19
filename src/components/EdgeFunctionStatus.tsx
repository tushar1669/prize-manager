import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";

interface FunctionStatus {
  name: string;
  status: 'ok' | 'error' | 'pending';
  buildVersion: string | null;
  error?: string;
  checkedAt: string;
}

const FUNCTIONS_TO_CHECK = [
  'parseWorkbook',
  'allocatePrizes',
  'allocateInstitutionPrizes',
  'generatePdf',
  'finalize',
];

async function checkFunction(name: string): Promise<FunctionStatus> {
  const checkedAt = new Date().toISOString();
  
  try {
    // Use authenticated invoke with ping mode
    const { data, error } = await supabase.functions.invoke(name, {
      method: 'POST',
      body: { ping: true },
    });

    if (error) {
      // Try GET with query param as fallback
      const response = await fetch(
        `https://nvjjifnzwrueutbirpde.supabase.co/functions/v1/${name}?ping=1`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52amppZm56d3J1ZXV0YmlycGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NDY3MzUsImV4cCI6MjA3NjMyMjczNX0.jYuZLE-HhF__ovFyHpIER9-_bABT7w0je1iOUrgDypY',
          },
        }
      );

      if (!response.ok) {
        return {
          name,
          status: 'error',
          buildVersion: null,
          error: `HTTP ${response.status}`,
          checkedAt,
        };
      }

      const result = await response.json();
      return {
        name,
        status: 'ok',
        buildVersion: result.buildVersion || 'unknown',
        checkedAt,
      };
    }

    return {
      name,
      status: 'ok',
      buildVersion: data?.buildVersion || 'unknown',
      checkedAt,
    };
  } catch (err: any) {
    return {
      name,
      status: 'error',
      buildVersion: null,
      error: err.message || 'Unknown error',
      checkedAt,
    };
  }
}

async function checkAllFunctions(): Promise<FunctionStatus[]> {
  const results = await Promise.all(FUNCTIONS_TO_CHECK.map(checkFunction));
  return results;
}

export function EdgeFunctionStatus() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: statuses, isLoading, error } = useQuery({
    queryKey: ['edge-function-status'],
    queryFn: checkAllFunctions,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['edge-function-status'] });
    setIsRefreshing(false);
  };

  const getStatusIcon = (status: FunctionStatus['status']) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: FunctionStatus['status']) => {
    switch (status) {
      case 'ok':
        return <Badge className="bg-green-600">OK</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const okCount = statuses?.filter(s => s.status === 'ok').length ?? 0;
  const totalCount = FUNCTIONS_TO_CHECK.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">Edge Functions Status</CardTitle>
          <CardDescription>
            Verify deployed function versions ({okCount}/{totalCount} OK)
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Re-check
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking functions...</span>
          </div>
        ) : error ? (
          <div className="text-destructive text-sm py-4">
            Failed to check functions: {(error as Error).message}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Build Version</TableHead>
                <TableHead>Last Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses?.map((fn) => (
                <TableRow key={fn.name}>
                  <TableCell className="font-mono text-sm">{fn.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(fn.status)}
                      {getStatusBadge(fn.status)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fn.buildVersion || (
                      <span className="text-destructive">{fn.error}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(fn.checkedAt).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
          <p>
            <strong>Public ping endpoint:</strong>{' '}
            <code className="bg-muted px-1 py-0.5 rounded">
              /functions/v1/pmPing
            </code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
