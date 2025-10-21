import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface BackBarProps {
  label: string;
  to: string;
}

export function BackBar({ label, to }: BackBarProps) {
  const navigate = useNavigate();
  
  return (
    <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
      <div className="container mx-auto px-6 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(to)}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {label}
        </Button>
      </div>
    </div>
  );
}
