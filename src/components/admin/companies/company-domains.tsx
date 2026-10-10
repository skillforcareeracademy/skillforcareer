"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { DomainRow } from "@/server/services/company-domain-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Where a company's people go to reach their panel.
 *
 * A free subdomain of the academy's own domain is instant — the academy
 * controls the apex, so there is nothing to prove and nothing to point. A
 * company's own domain follows the shape everybody knows from Vercel: add it,
 * copy two records into your DNS, press Verify, and the check is a real DNS
 * lookup rather than a box that goes green on its own.
 */
export function CompanyDomains({
  companyId,
  rootDomain,
}: {
  companyId: string;
  rootDomain: string;
}) {
  const [domains, setDomains] = useState<DomainRow[] | null>(null);
  const [label, setLabel] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [free, setFree] = useState<{ available: boolean; reason?: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ domains: DomainRow[] }>(
        `/api/companies/${companyId}/domains`,
      );
      setDomains(res.domains);
    } catch {
      setDomains([]);
    }
  }, [companyId]);

  // Off a timer rather than straight from the effect body: a setState in the
  // body cascades a render before first paint, which the compiler rejects.
  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // Checked as it is typed, but a beat behind, so a name is not looked up on
  // every keystroke.
  useEffect(() => {
    const name = label.trim();
    const t = window.setTimeout(() => {
      if (!name) {
        setFree(null);
        return;
      }
      api
        .get<{ available: boolean; reason?: string }>(
          `/api/companies/${companyId}/domains?check=${encodeURIComponent(name)}`,
        )
        .then(setFree)
        .catch(() => setFree(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [label, companyId]);

  async function add(kind: "SUBDOMAIN" | "CUSTOM") {
    const host = kind === "SUBDOMAIN" ? label.trim() : custom.trim();
    if (!host) return;
    setBusy("add");
    try {
      const res = await api.post<{ message: string }>(
        `/api/companies/${companyId}/domains`,
        { host, kind },
      );
      toast.success(res.message);
      setLabel("");
      setCustom("");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add that.");
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: "verify" | "primary") {
    setBusy(id);
    try {
      const res = await api.post<{ message: string; domain?: DomainRow }>(
        `/api/companies/${companyId}/domains/${id}`,
        { action },
      );
      if (action === "verify" && res.domain?.status !== "VERIFIED") {
        toast.warning(res.message);
      } else {
        toast.success(res.message);
      }
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await api.del<{ message: string }>(
        `/api/companies/${companyId}/domains/${id}`,
      );
      toast.success(res.message);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't remove that.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy that.");
    }
  }

  return (
    <div className="space-y-5">
      <Tabs defaultValue="free">
        <TabsList>
          <TabsTrigger value="free" className="gap-1.5 px-3">
            Free subdomain
          </TabsTrigger>
          <TabsTrigger value="own" className="gap-1.5 px-3">
            Their own domain
          </TabsTrigger>
        </TabsList>

        <TabsContent value="free" className="mt-4 space-y-2">
          <Label htmlFor="co-sub">Address on {rootDomain}</Label>
          <div className="flex items-stretch gap-2">
            <div className="flex flex-1 items-stretch">
              <Input
                id="co-sub"
                name="company-subdomain"
                autoComplete="off"
                value={label}
                onChange={(e) =>
                  setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="acme"
                className="rounded-r-none"
              />
              <span className="bg-muted text-muted-foreground flex items-center rounded-r-md border border-l-0 px-3 text-sm">
                .{rootDomain}
              </span>
            </div>
            <Button
              onClick={() => void add("SUBDOMAIN")}
              disabled={busy === "add" || !free?.available}
            >
              {busy === "add" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </div>
          <p
            className={
              free && !free.available
                ? "text-xs text-rose-600 dark:text-rose-400"
                : free?.available
                  ? "text-xs text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground text-xs"
            }
          >
            {free
              ? free.available
                ? `${label}.${rootDomain} is free.`
                : free.reason
              : "Free, instant, and nothing to set up — it is on the academy's own domain."}
          </p>
        </TabsContent>

        <TabsContent value="own" className="mt-4 space-y-2">
          <Label htmlFor="co-custom">Their domain</Label>
          <div className="flex gap-2">
            <Input
              id="co-custom"
              name="company-domain"
              autoComplete="off"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="learn.acme.com"
            />
            <Button onClick={() => void add("CUSTOM")} disabled={busy === "add"}>
              {busy === "add" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Once added, the records to put in their DNS appear below. Nothing
            goes live until both are found.
          </p>
        </TabsContent>
      </Tabs>

      {domains === null ? (
        <p className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading domains…
        </p>
      ) : domains.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
          No address yet. A free subdomain is the quickest way to get them
          started.
        </p>
      ) : (
        <ul className="space-y-3">
          {domains.map((d) => (
            <li key={d.id} className="rounded-xl border">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Globe className="text-muted-foreground size-4 shrink-0" />
                <a
                  href={`https://${d.host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
                >
                  {d.host}
                </a>
                {d.isPrimary && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="size-3" /> Main
                  </Badge>
                )}
                <Badge
                  className={
                    d.status === "VERIFIED"
                      ? "gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : d.status === "FAILED"
                        ? "gap-1 bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                        : "gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  }
                >
                  {d.status === "VERIFIED" ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <TriangleAlert className="size-3" />
                  )}
                  {d.status === "VERIFIED"
                    ? "Live"
                    : d.status === "FAILED"
                      ? "Not pointed yet"
                      : "Awaiting DNS"}
                </Badge>

                <div className="flex shrink-0 gap-1">
                  {d.kind === "CUSTOM" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void act(d.id, "verify")}
                      disabled={busy === d.id}
                    >
                      {busy === d.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Verify
                    </Button>
                  )}
                  {!d.isPrimary && d.status === "VERIFIED" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void act(d.id, "primary")}
                      disabled={busy === d.id}
                    >
                      <Star className="size-4" /> Make main
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(d.id)}
                    disabled={busy === d.id}
                    aria-label={`Remove ${d.host}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {d.records.length > 0 && d.status !== "VERIFIED" && (
                <div className="bg-muted/40 space-y-2 border-t px-4 py-3">
                  <p className="text-xs font-medium">
                    Add these at their DNS provider
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="w-16 py-1 text-left font-medium">Type</th>
                          <th className="py-1 text-left font-medium">Name</th>
                          <th className="py-1 text-left font-medium">Value</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {d.records.map((r) => (
                          <tr key={`${r.type}-${r.name}`} className="align-top">
                            <td className="py-1">{r.type}</td>
                            <td className="py-1 pr-3 break-all">{r.name}</td>
                            <td className="py-1 pr-2 break-all">{r.value}</td>
                            <td className="py-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => void copy(r.value)}
                                aria-label={`Copy the ${r.type} value`}
                              >
                                <Copy className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {d.lastError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      {d.lastError}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    DNS can take anything from a minute to a few hours to
                    spread. Press Verify again whenever.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
