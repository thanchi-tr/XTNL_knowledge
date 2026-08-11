"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_THEME } from "@/lib/palette";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export function DonutChart({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: 6 }}
          labelStyle={{ color: "#eef2f8" }}
          formatter={(value, name) => [
            `${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`,
            name,
          ]}
        />
        <Legend
          verticalAlign="bottom"
          height={32}
          formatter={(value) => <span style={{ color: "#eef2f8", fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
