"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function VerifyForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/verify/${encodeURIComponent(c)}`);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter verification code"
        className="font-mono uppercase"
        aria-label="Verification code"
      />
      <Button type="submit" disabled={!code.trim()}>
        <Search className="size-4" /> Verify
      </Button>
    </form>
  );
}
