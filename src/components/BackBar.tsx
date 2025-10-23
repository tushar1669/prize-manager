import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useGuardedNavigate } from "@/hooks/useGuardedNavigate";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

interface BackBarProps {
  label: string;
  to: string;
}

export function BackBar({ label, to }: BackBarProps) {
  const { guardedNavigate, showDialog, handleStay, handleLeave, handleSaveAndContinue } = useGuardedNavigate();
  
  return (
    <>
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-6 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => guardedNavigate(to)}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            {label}
          </Button>
        </div>
      </div>
      <UnsavedChangesDialog
        open={showDialog}
        onStay={handleStay}
        onLeave={handleLeave}
        onSaveAndContinue={handleSaveAndContinue}
      />
    </>
  );
}
