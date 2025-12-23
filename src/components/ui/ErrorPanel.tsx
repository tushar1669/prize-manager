import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type ErrorInfo = {
  title: string;
  message: string;
  hint?: string;
  context?: unknown;
};

export default function ErrorPanel({ error, onDismiss }: { error: ErrorInfo | null; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div className="my-4">
      <Alert variant="destructive">
        <AlertTitle>{error.title}</AlertTitle>
        <AlertDescription className="space-y-2">
          <div>{error.message}</div>
          {error.hint && <div className="text-sm opacity-80">{error.hint}</div>}
          {onDismiss && (
            <button onClick={onDismiss} className="mt-2 text-sm underline">
              Dismiss
            </button>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
