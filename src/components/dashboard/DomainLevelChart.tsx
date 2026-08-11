"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_THEME, fieldColor } from "@/lib/palette";

export interface DomainLevelDatum {
  name: string;
  fieldName: string;
  level: number;
  totalPoints: number;
}

export function DomainLevelChart({ data }: { data: DomainLevelDatum[] }) {
  const sorted = [...data].sort((a, b) => b.level - a.level);
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, sorted.length * 22)}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke={CHART_THEME.grid} horizontal={false} />
        <XAxis type="number" stroke={CHART_THEME.axis} fontSize={11} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          stroke={CHART_THEME.axis}
          fontSize={10}
          width={170}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(155, 107, 255, 0.06)" }}
          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 6 }}
          labelStyle={{ color: "#eef2f8" }}
          formatter={(value, _name, item) => [
            `Lv ${value} · ${(item.payload as DomainLevelDatum).totalPoints.toFixed(1)} XP`,
            (item.payload as DomainLevelDatum).fieldName,
          ]}
        />
        <Bar dataKey="level" radius={[0, 4, 4, 0]} maxBarSize={14}>
          {sorted.map((d) => (
            <Cell key={d.name} fill={fieldColor(d.fieldName)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
