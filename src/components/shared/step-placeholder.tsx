import { Hammer } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StepPlaceholderProps {
  title: string;
  description: string;
  /** Which build-plan step delivers this screen. */
  step: string;
}

/**
 * Temporary, on-brand placeholder for routes whose full implementation lands in
 * a later build-plan step. Keeps the route tree navigable (no 404s) without
 * shipping fake functionality.
 */
export function StepPlaceholder({ title, description, step }: StepPlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center justify-between">
          <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
            <Hammer className="size-5" aria-hidden />
          </div>
          <Badge variant="secondary">{step}</Badge>
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          This screen is part of the enterprise LMS route architecture. Its full
          implementation arrives in {step}.
        </p>
      </CardContent>
    </Card>
  );
}
