import { Apple, Play, Smartphone } from "lucide-react";
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
 * links and a set of learner photos shown as a collage. A store button only
 * shows when its link is filled in, so the App Store button stays hidden until
 * the iPhone app lands; clearing the photos drops back to a centred, text-only
 * band.
 */
export function AppPromo({ data }: { data: HomeData<"appPromo"> }) {
  const hasAndroid = Boolean(data.androidUrl.trim());
  const hasIos = Boolean(data.iosUrl.trim());
  // Nothing to send anyone to — don't draw an empty band.
  if (!hasAndroid && !hasIos) return null;

  const photos = data.images
    .map((image) => image.url.trim())
    .filter(Boolean)
    .slice(0, 6);
  const hasPhotos = photos.length > 0;

  return (
    <section className="container-page py-12 sm:py-16">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50 px-6 py-10 sm:px-12 dark:from-rose-950/30 dark:via-pink-950/20 dark:to-fuchsia-950/20">
        <div
          className={cn(
            "grid items-center gap-10",
            hasPhotos && "lg:grid-cols-2 lg:gap-14",
          )}
        >
          {/* Copy + store buttons */}
          <div className={cn(!hasPhotos && "mx-auto max-w-2xl text-center")}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-white/10 dark:text-rose-200 dark:ring-white/10">
              <Smartphone className="size-3.5" aria-hidden /> Now on Android
            </span>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-3 text-lg">
                {data.description}
              </p>
            )}
            <div
              className={cn(
                "mt-7 flex flex-wrap gap-3",
                !hasPhotos && "justify-center",
              )}
            >
              {hasAndroid && (
                <StoreButton href={data.androidUrl} store="android" />
              )}
              {hasIos && <StoreButton href={data.iosUrl} store="ios" />}
            </div>
          </div>

          {/* A wall of learners — the app's community, advertising it. */}
          {hasPhotos && (
            <div className="relative mx-auto w-full max-w-md lg:mr-0 lg:ml-auto">
              <div
                aria-hidden
                className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-rose-400/20 to-fuchsia-500/20 blur-2xl"
              />
              <div className="relative grid grid-cols-3 gap-2.5 sm:gap-3">
                {photos.map((url, i) => (
                  // Plain <img>: an admin may swap in any host's photo, which
                  // next/image would refuse unless it were configured.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover object-top shadow-sm ring-1 ring-black/5"
                  />
                ))}
              </div>
              {/* Floating app card — makes the wall read as an advert. */}
              <div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/brand/favicon.png"
                  alt=""
                  className="size-9 rounded-lg"
                />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">Skill For Career</p>
                  <p className="text-muted-foreground text-xs">
                    Learning app · Android
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
