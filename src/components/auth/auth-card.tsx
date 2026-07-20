import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Consistent shell for every authentication form. */
export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Card className="border-border/60 gap-0 rounded-2xl py-0 shadow-xl shadow-black/[0.04]">
      <CardHeader className="space-y-1 px-6 pt-8 pb-6 text-center sm:px-8">
        <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[0.95rem]">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="px-6 pb-8 sm:px-8">{children}</CardContent>
      {footer && (
        <CardFooter className="bg-muted/30 justify-center rounded-b-2xl border-t px-6 py-5 text-sm sm:px-8">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
