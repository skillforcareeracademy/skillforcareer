"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const inrShort = (n: number) => (n >= 1000 ? `₹${Math.round(n / 100) / 10}k` : `₹${n}`);

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

// ── Range tabs ───────────────────────────────────────────────────────────────

export function RangeTabs({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(days: number) {
    const next = new URLSearchParams(params.toString());
    next.set("range", String(days));
    router.push(`${pathname}?${next.toString()}`);
  }

  const options = [
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
  ];

  return (
    <div className="bg-muted inline-flex rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.days}
          type="button"
          onClick={() => select(o.days)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            current === o.days
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Revenue area ─────────────────────────────────────────────────────────────

interface TrendPoint {
  label: string;
  revenue: number;
  enrollments: number;
  signups: number;
}

export function RevenueTrend({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: -6, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="aRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickMargin={8}
          minTickGap={24}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={52}
          stroke="var(--muted-foreground)"
          tickFormatter={inrShort}
        />
        <Tooltip cursor={{ stroke: "var(--border)" }} contentStyle={tooltipStyle} formatter={(v) => [inr(Number(v)), "Revenue"]} />
        <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#aRev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Enrollments + signups lines ──────────────────────────────────────────────

export function ActivityTrend({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ left: -18, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickMargin={8}
          minTickGap={24}
          stroke="var(--muted-foreground)"
        />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} allowDecimals={false} stroke="var(--muted-foreground)" />
        <Tooltip cursor={{ stroke: "var(--border)" }} contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line type="monotone" dataKey="enrollments" name="Enrollments" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="signups" name="Sign-ups" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Donut ────────────────────────────────────────────────────────────────────

interface Slice {
  name: string;
  value: number;
}

export function BreakdownDonut({ data }: { data: Slice[] }) {
  if (data.length === 0) {
    return <EmptyChart />;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={54}
          outerRadius={82}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Horizontal category bar ──────────────────────────────────────────────────

export function CategoryBar({ data, money = false }: { data: Slice[]; money?: boolean }) {
  if (data.length === 0) {
    return <EmptyChart />;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={money ? inrShort : undefined} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={130}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          contentStyle={tooltipStyle}
          formatter={(v) => [money ? inr(Number(v)) : Number(v), money ? "Revenue" : "Value"]}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 6, 6, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
      No data for this range yet.
    </div>
  );
}
