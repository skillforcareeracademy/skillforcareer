"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Megaphone,
  Search,
  CheckCircle2,
  CircleDashed,
  Webhook,
  ArrowRight,
  Loader2,
  Shuffle,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdConfigStatus } from "@/server/services/ad-config-service";

/**
 * Connect the ad accounts from inside the panel — the client asked for an Edit /
 * connect option here rather than handing the keys to us. Non-secret fields
 * (App ID, Page ID, Verify Token) show in full; a secret shows only whether it
 * is already set, and is sent to the server only when the admin types a new one,
 * so saving the rest never wipes a working connection.
 */
export function AdConnectForm({
  status,
  webhooks,
  leads,
}: {
  status: AdConfigStatus;
  webhooks: { meta: string; google: string };
  leads: { meta: number; google: number };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MetaCard status={status.meta} webhook={webhooks.meta} leads={leads.meta} />
      <GoogleCard status={status.google} webhook={webhooks.google} leads={leads.google} />
    </div>
  );
}

function WebhookUrl({ url }: { url: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Webhook className="size-3.5" /> Webhook URL
      </p>
      <code className="bg-muted block overflow-x-auto rounded-md px-3 py-2 text-xs select-all">
        {url}
      </code>
    </div>
  );
}

function ConnectedBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      <CheckCircle2 className="size-3.5" /> Connected
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <CircleDashed className="size-3.5" /> Not connected
    </Badge>
  );
}

/** A secret field: shows whether one is already stored, reveals what's typed. */
function SecretField({
  id,
  label,
  isSet,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  isSet: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {isSet && !value && (
          <span className="text-muted-foreground text-xs">Saved — leave blank to keep</span>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          autoComplete="off"
          placeholder={isSet ? "••••••••" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-9 place-items-center"
            aria-label={show ? "Hide" : "Show"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function MetaCard({
  status,
  webhook,
  leads,
}: {
  status: AdConfigStatus["meta"];
  webhook: string;
  leads: number;
}) {
  const router = useRouter();
  const [appId, setAppId] = useState(status.appId);
  const [pageId, setPageId] = useState(status.pageId);
  const [verifyToken, setVerifyToken] = useState(status.verifyToken);
  const [appSecret, setAppSecret] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/admin/ad-config", {
        metaAppId: appId,
        metaPageId: pageId,
        metaVerifyToken: verifyToken,
        // Secrets travel only when freshly typed — an untouched field keeps its value.
        ...(appSecret ? { metaAppSecret: appSecret } : {}),
        ...(pageToken ? { metaPageToken: pageToken } : {}),
      });
      toast.success("Facebook settings saved.");
      setAppSecret("");
      setPageToken("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Facebook / Instagram Ads</h2>
            <p className="text-muted-foreground text-xs">
              {leads} lead{leads === 1 ? "" : "s"} captured
            </p>
          </div>
        </div>
        <ConnectedBadge connected={status.connected} />
      </div>

      <WebhookUrl url={webhook} />

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta-app-id">App ID</Label>
            <Input
              id="meta-app-id"
              value={appId}
              placeholder="e.g. 1234567890"
              onChange={(e) => setAppId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta-page-id">Page ID</Label>
            <Input
              id="meta-page-id"
              value={pageId}
              placeholder="your Facebook Page ID"
              onChange={(e) => setPageId(e.target.value)}
            />
          </div>
        </div>

        <SecretField
          id="meta-app-secret"
          label="App Secret"
          isSet={status.hasAppSecret}
          value={appSecret}
          onChange={setAppSecret}
          placeholder="from Meta app settings"
        />
        <SecretField
          id="meta-page-token"
          label="Page Access Token"
          isSet={status.hasPageToken}
          value={pageToken}
          onChange={setPageToken}
          placeholder="long-lived page token"
        />

        <div className="space-y-1.5">
          <Label htmlFor="meta-verify-token">Verify Token</Label>
          <div className="flex gap-2">
            <Input
              id="meta-verify-token"
              value={verifyToken}
              placeholder="any secret — you'll paste this into Meta too"
              onChange={(e) => setVerifyToken(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Generate a token"
              onClick={() =>
                setVerifyToken(
                  "sfc-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
                )
              }
            >
              <Shuffle className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Pick any string. Use the <strong>same</strong> value here and in Meta&rsquo;s
            webhook setup — it&rsquo;s how Meta proves it&rsquo;s talking to you.
          </p>
        </div>
      </div>

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer select-none font-medium">
          How to get these
        </summary>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5">
          <li>Create a Meta App at developers.facebook.com (type &ldquo;Business&rdquo;) and add the Webhooks + Lead Ads products.</li>
          <li>Request leads_retrieval, pages_manage_ads, pages_read_engagement, pages_show_list and submit for App Review.</li>
          <li>Subscribe the Page to the leadgen webhook with the URL above and the Verify Token you set here.</li>
          <li>Copy the App ID, App Secret, Page ID and a long-lived Page Access Token into the fields above and save.</li>
        </ol>
      </details>

      <div className="flex items-center justify-between gap-3">
        {leads > 0 ? (
          <Link
            href="/admin/leads?source=META_ADS"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View these leads <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}

function GoogleCard({
  status,
  webhook,
  leads,
}: {
  status: AdConfigStatus["google"];
  webhook: string;
  leads: number;
}) {
  const router = useRouter();
  const [leadsKey, setLeadsKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/admin/ad-config", {
        ...(leadsKey ? { googleLeadsKey: leadsKey } : {}),
      });
      toast.success("Google settings saved.");
      setLeadsKey("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            <Search className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Google Ads</h2>
            <p className="text-muted-foreground text-xs">
              {leads} lead{leads === 1 ? "" : "s"} captured
            </p>
          </div>
        </div>
        <ConnectedBadge connected={status.connected} />
      </div>

      <WebhookUrl url={webhook} />

      <SecretField
        id="google-key"
        label="Webhook Key"
        isSet={status.hasKey}
        value={leadsKey}
        onChange={setLeadsKey}
        placeholder="any secret string"
      />

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer select-none font-medium">
          How to get this
        </summary>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5">
          <li>Open your Lead Form asset in Google Ads and go to its Webhook integration.</li>
          <li>Paste the Webhook URL above and set a Key (any secret string).</li>
          <li>Enter that same Key here and save — the connection turns green.</li>
        </ol>
      </details>

      <div className="flex items-center justify-between gap-3">
        {leads > 0 ? (
          <Link
            href="/admin/leads?source=GOOGLE_ADS"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View these leads <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </Card>
  );
}
