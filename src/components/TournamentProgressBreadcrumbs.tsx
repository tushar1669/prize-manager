import { useParams, useLocation } from 'react-router-dom';
import { GuardedLink } from '@/components/GuardedLink';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

type Step = {
  label: string;
  path: string;
};

export function TournamentProgressBreadcrumbs() {
  const { id } = useParams();
  const location = useLocation();

  if (!id) return null;

  const steps: Step[] = [
    { label: 'Setup', path: `/t/${id}/setup` },
    { label: 'Categories & Prizes', path: `/t/${id}/order-review` },
    { label: 'Import Players', path: `/t/${id}/import` },
    { label: 'Review & Allocate', path: `/t/${id}/review` },
    { label: 'Finalize', path: `/t/${id}/finalize` },
  ];

  // Determine current step index
  const currentPath = location.pathname;
  const currentStepIndex = steps.findIndex((step) =>
    currentPath.startsWith(step.path)
  );

  return (
    <Breadcrumb className="mb-6">
      <BreadcrumbList className="flex-wrap">
        {steps.map((step, index) => {
          const isCurrentStep = index === currentStepIndex;
          const isPastOrCurrent = index <= currentStepIndex;
          const isLastStep = index === steps.length - 1;

          return (
            <div key={step.path} className="contents">
              <BreadcrumbItem>
                {isPastOrCurrent ? (
                  isCurrentStep ? (
                    <BreadcrumbPage className="font-semibold text-foreground">
                      {step.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <GuardedLink
                        to={step.path}
                        className={cn(
                          "transition-colors hover:text-foreground",
                          "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </GuardedLink>
                    </BreadcrumbLink>
                  )
                ) : (
                  <span className="text-muted-foreground/50 cursor-not-allowed">
                    {step.label}
                  </span>
                )}
              </BreadcrumbItem>
              {!isLastStep && <BreadcrumbSeparator />}
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
