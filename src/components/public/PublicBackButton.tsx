import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicBackButtonProps = {
  className?: string;
};

export function PublicBackButton({ className }: PublicBackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    // Browser history can include about:blank/external entries on a direct link.
    // React Router's history index only counts in-app navigation entries.
    const inAppHistoryIndex = window.history.state?.idx;
    if (typeof inAppHistoryIndex === "number" && inAppHistoryIndex > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleBack} className={className}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back
    </Button>
  );
}
