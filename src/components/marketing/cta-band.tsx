import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { ROUTES } from "@/lib/constants";
import type { HomeData } from "@/lib/validations/homepage";

export function CtaBand({ data }: { data: HomeData<"cta"> }) {
  return (
    <section className="container-page py-16 sm:py-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-pink-600 to-fuchsia-600 px-6 py-14 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="mt-4 text-lg text-white/90">{data.description}</p>
          )}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {data.primaryLabel && (
              <ButtonLink
                href={data.primaryHref || ROUTES.register}
                size="lg"
                variant="secondary"
                className="bg-white text-rose-700 hover:bg-white/90"
              >
                {data.primaryLabel}
                <ArrowRight className="size-4" />
              </ButtonLink>
            )}
            {data.secondaryLabel && (
              <ButtonLink
                href={data.secondaryHref || ROUTES.contact}
                size="lg"
                variant="outline"
                className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                {data.secondaryLabel}
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
