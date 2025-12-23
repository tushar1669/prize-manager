import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublicBackButtonProps = {
  className?: string;
};

export function PublicBackButton({ className }: PublicBackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <Button variant="outline" size="sm" onClick={handleBack} className={className}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back
    </Button>
  );
}
