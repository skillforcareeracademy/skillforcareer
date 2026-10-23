import { Apple, Play } from "lucide-react";
import type { HomeData } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

/** One store badge — a dark, two-line button in the familiar app-store shape. */
function StoreButton({
  href,
  store,
}: {
  href: string;
  store: "android" | "ios";
}) {
  const lead = store === "android" ? "Get it on" : "Download on the";
  const name = store === "android" ? "Google Play" : "App Store";
  const Icon = store === "android" ? Play : Apple;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 rounded-xl bg-neutral-900 px-5 py-2.5 text-white shadow-sm transition hover:bg-neutral-800"
    >
      <Icon
        className="size-7 shrink-0"
        fill={store === "android" ? "currentColor" : "none"}
        aria-hidden
      />
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[10px] tracking-wide text-white/80 uppercase">
          {lead}
        </span>
        <span className="text-lg font-semibold">{name}</span>
      </span>
    </a>
  );
}

/**
 * "Get the app" — a band that sends visitors to the mobile app on the stores.
 * Edited in Admin → Homepage: the headline, the line under it, the two store
 * links and an optional phone picture. A store button only shows when its link
 * is filled in, so the App Store button stays hidden until the iPhone app lands.
 */
export function AppPromo({ data }: { data: HomeData<"appPromo"> }) {
  const hasAndroid = Boolean(data.androidUrl.trim());
  const hasIos = Boolean(data.iosUrl.trim());
  // Nothing to send anyone to — don't draw an empty band.
  if (!hasAndroid && !hasIos) return null;

  return (
    <section className="container-page py-16 sm:py-24">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-rose-50 to-fuchsia-50 px-6 py-12 sm:px-12 dark:from-rose-950/30 dark:to-fuchsia-950/20">
        <div
          className={cn(
            "grid items-center gap-10",
            data.image && "lg:grid-cols-2",
          )}
        >
          <div className={cn(!data.image && "mx-auto max-w-2xl text-center")}>
            <h2 className="text-3xl font-bold sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-3 text-lg">
                {data.description}
              </p>
            )}
            <div
              className={cn(
                "mt-8 flex flex-wrap gap-3",
                !data.image && "justify-center",
              )}
            >
              {hasAndroid && (
                <StoreButton href={data.androidUrl} store="android" />
              )}
              {hasIos && <StoreButton href={data.iosUrl} store="ios" />}
            </div>
          </div>

          {data.image && (
            <div className="flex justify-center lg:justify-end">
              {/* Plain <img>: the picture is whatever an admin uploaded, and
                  next/image refuses hosts that aren't configured. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.image}
                alt=""
                className="max-h-96 w-auto rounded-2xl shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
