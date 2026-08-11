"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_THEME, fieldColor } from "@/lib/palette";

export interface FieldLevelDatum {
  name: string;
  level: number;
  domainCount: number;
}

export function FieldLevelChart({ data }: { data: FieldLevelDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke={CHART_THEME.grid} horizontal={false} />
        <XAxis type="number" stroke={CHART_THEME.axis} fontSize={11} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          stroke={CHART_THEME.axis}
          fontSize={11}
          width={140}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(155, 107, 255, 0.06)" }}
          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 6 }}
          labelStyle={{ color: "#eef2f8" }}
          formatter={(value, _name, item) => [`Lv ${value} · ${item.payload.domainCount} domains`, "Level"]}
        />
        <Bar dataKey="level" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((d) => (
            <Cell key={d.name} fill={fieldColor(d.name)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
