import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface BackendMigrationMissingAlertProps {
  errorCode?: string | null;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function BackendMigrationMissingAlert({
  errorCode,
  onRetry,
  className,
  compact = false,
}: BackendMigrationMissingAlertProps) {
  if (errorCode !== 'backend_migration_missing') {
    return null;
  }

  return (
    <Alert className={className} variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>System setup issue detected</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Prize Manager backend migrations are not fully deployed for this environment. Upgrade or payment actions are temporarily unavailable.
        </p>
        {!compact && <p>Please retry in a moment or contact support/admin if the issue persists.</p>}
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
