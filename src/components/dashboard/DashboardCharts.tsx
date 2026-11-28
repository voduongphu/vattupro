import React, { useMemo, useState } from 'react';
import { BarChart3, Building2 } from 'lucide-react';
import {
  MonthlyInOutPoint,
  WarehouseStockSummaryItem
} from '../../utils/dashboardLayout';

interface MonthlyInOutTrendChartProps {
  data: MonthlyInOutPoint[];
  language: 'vi' | 'en';
  headerControls?: React.ReactNode;
}

function formatCompactNum(val: number, locale: string): string {
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
  }
  if (val >= 10_000) {
    return `${(val / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })}k`;
  }
  return val.toLocaleString(locale, { maximumFractionDigits: 1 });
}

export const MonthlyInOutTrendChart: React.FC<MonthlyInOutTrendChartProps> = ({
  data,
  language,
  headerControls
}) => {
  const [metric, setMetric] = useState<'qty' | 'weight'>('qty');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const { maxVal, totalIn, totalOut } = useMemo(() => {
    let m = 0;
    let sumIn = 0;
    let sumOut = 0;
    for (let i = 0; i < data.length; i++) {
      const p = data[i];
      const inV = metric === 'qty' ? p.inboundQty : p.inboundWeightKg;
      const outV = metric === 'qty' ? p.outboundQty : p.outboundWeightKg;
      if (inV > m) m = inV;
      if (outV > m) m = outV;
      sumIn += inV;
      sumOut += outV;
    }
    return { maxVal: m > 0 ? m : 1, totalIn: sumIn, totalOut: sumOut };
  }, [data, metric]);

  const activePoint = hoveredIdx !== null ? data[hoveredIdx] : null;
  const unitSuffix = metric === 'qty' ? (language === 'en' ? 'Qty' : 'SL') : 'kg';

  // SVG coordinate system
  const svgW = 540;
  const svgH = 196;
  const padL = 50;
  const padR = 14;
  const padT = 14;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const slotW = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(24, Math.max(12, slotW * 0.27));
  const barGap = 5;

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="truncate">
            {language === 'en'
              ? 'Monthly Inbound vs Outbound (6 Months)'
              : 'Biểu Đồ Nhập - Xuất Theo Tháng'}
          </span>
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setMetric('qty')}
              className={`px-2 py-0.5 rounded-md transition ${
                metric === 'qty'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {language === 'en' ? 'Qty' : 'SL'}
            </button>
            <button
              type="button"
              onClick={() => setMetric('weight')}
              className={`px-2 py-0.5 rounded-md transition ${
                metric === 'weight'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              kg
            </button>
          </div>
          {headerControls}
        </div>
      </div>

      {/* Legend + Hover Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
        <div className="flex items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shrink-0" />
            <span>{language === 'en' ? 'Inbound:' : 'Nhập:'}</span>
            <span className="font-mono text-emerald-700 tabular-nums">
              {formatCompactNum(
                activePoint
                  ? metric === 'qty'
                    ? activePoint.inboundQty
                    : activePoint.inboundWeightKg
                  : totalIn,
                locale
              )}{' '}
              {unitSuffix}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 shrink-0" />
            <span>{language === 'en' ? 'Outbound:' : 'Xuất:'}</span>
            <span className="font-mono text-rose-700 tabular-nums">
              {formatCompactNum(
                activePoint
                  ? metric === 'qty'
                    ? activePoint.outboundQty
                    : activePoint.outboundWeightKg
                  : totalOut,
                locale
              )}{' '}
              {unitSuffix}
            </span>
          </span>
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          {activePoint
            ? `${activePoint.label} (${activePoint.inboundCount} PN / ${activePoint.outboundCount} PX)`
            : language === 'en'
              ? '6-month total'
              : 'Tổng 6 tháng'}
        </span>
      </div>

      {/* SVG Grouped Column Chart */}
      <div className="w-full flex-1 flex items-center">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto max-h-[220px] select-none"
          role="img"
          aria-label={
            language === 'en'
              ? 'Monthly inbound and outbound trend chart'
              : 'Biểu đồ xu hướng nhập xuất theo tháng'
          }
        >
          {/* Horizontal gridlines & Y ticks */}
          {gridTicks.map((ratio, idx) => {
            const y = padT + plotH * (1 - ratio);
            const val = maxVal * ratio;
            return (
              <g key={idx}>
                <line
                  x1={padL}
                  y1={y}
                  x2={svgW - padR}
                  y2={y}
                  stroke={ratio === 0 ? '#CBD5E1' : '#E2E8F0'}
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {ratio === 0 ? '0' : formatCompactNum(val, locale)}
                </text>
              </g>
            );
          })}

          {/* Grouped Bars */}
          {data.map((point, idx) => {
            const centerX = padL + slotW * idx + slotW / 2;
            const inVal = metric === 'qty' ? point.inboundQty : point.inboundWeightKg;
            const outVal = metric === 'qty' ? point.outboundQty : point.outboundWeightKg;

            const inH = inVal > 0 ? Math.max(3, (inVal / maxVal) * plotH) : 0;
            const outH = outVal > 0 ? Math.max(3, (outVal / maxVal) * plotH) : 0;

            const inX = centerX - barW - barGap / 2;
            const outX = centerX + barGap / 2;
            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={point.monthKey}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Invisible hover hit area */}
                <rect
                  x={padL + slotW * idx + 2}
                  y={padT}
                  width={Math.max(10, slotW - 4)}
                  height={plotH + padB}
                  rx={6}
                  className={isHovered ? 'fill-slate-100/80' : 'fill-transparent'}
                />

                {/* Inbound bar */}
                {inH > 0 && (
                  <rect
                    x={inX}
                    y={padT + plotH - inH}
                    width={barW}
                    height={inH}
                    rx={3}
                    className={
                      isHovered
                        ? 'fill-emerald-600 transition-colors'
                        : 'fill-emerald-500 transition-colors'
                    }
                  />
                )}

                {/* Outbound bar */}
                {outH > 0 && (
                  <rect
                    x={outX}
                    y={padT + plotH - outH}
                    width={barW}
                    height={outH}
                    rx={3}
                    className={
                      isHovered
                        ? 'fill-rose-600 transition-colors'
                        : 'fill-rose-500 transition-colors'
                    }
                  />
                )}

                {/* Month label */}
                <text
                  x={centerX}
                  y={svgH - 8}
                  textAnchor="middle"
                  className={`text-[10.5px] font-mono ${
                    isHovered ? 'fill-slate-900 font-bold' : 'fill-slate-500'
                  }`}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

interface WarehouseStockChartProps {
  data: WarehouseStockSummaryItem[];
  language: 'vi' | 'en';
  headerControls?: React.ReactNode;
}

export const WarehouseStockChart: React.FC<WarehouseStockChartProps> = ({
  data,
  language,
  headerControls
}) => {
  const [metric, setMetric] = useState<'weight' | 'qty'>('weight');
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const { totalMetric, maxMetric, topItems } = useMemo(() => {
    const sliced = data.slice(0, 6);
    let total = 0;
    let max = 0;
    for (let i = 0; i < data.length; i++) {
      const v = metric === 'weight' ? Math.max(0, data[i].stockWeightKg) : Math.max(0, data[i].stockQty);
      total += v;
      if (v > max) max = v;
    }
    return {
      totalMetric: total,
      maxMetric: max > 0 ? max : 1,
      topItems: sliced
    };
  }, [data, metric]);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="truncate">
            {language === 'en'
              ? 'Inventory Distribution by Warehouse'
              : 'Biểu Đồ Tồn Kho Theo Kho Bãi'}
          </span>
        </h3>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setMetric('weight')}
              className={`px-2 py-0.5 rounded-md transition ${
                metric === 'weight'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              kg
            </button>
            <button
              type="button"
              onClick={() => setMetric('qty')}
              className={`px-2 py-0.5 rounded-md transition ${
                metric === 'qty'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {language === 'en' ? 'Qty' : 'SL'}
            </button>
          </div>
          {headerControls}
        </div>
      </div>

      {topItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-xs text-slate-400">
          {language === 'en' ? 'No warehouse stock data available' : 'Chưa có dữ liệu tồn kho theo kho bãi'}
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          {topItems.map((wh) => {
            const val = metric === 'weight' ? wh.stockWeightKg : wh.stockQty;
            const sharePct = totalMetric > 0 ? (Math.max(0, val) / totalMetric) * 100 : 0;
            const barPct = Math.min(100, Math.max(6, Math.round((Math.max(0, val) / maxMetric) * 100)));

            return (
              <div
                key={wh.warehouseId}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="font-semibold text-slate-800 truncate min-w-0"
                    title={wh.warehouseName}
                    data-user-content="true"
                  >
                    {wh.warehouseName}
                  </span>
                  <span className="font-mono font-bold text-slate-800 whitespace-nowrap shrink-0 tabular-nums">
                    {metric === 'weight'
                      ? `${Math.round(wh.stockWeightKg).toLocaleString(locale)} kg`
                      : `${wh.stockQty.toLocaleString(locale)} ${language === 'en' ? 'Qty' : 'SL'}`}
                  </span>
                </div>

                <progress
                  value={barPct}
                  max={100}
                  className="w-full h-2 rounded-full overflow-hidden block [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-amber-500 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-amber-500"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="tabular-nums">
                    {language === 'en' ? 'In:' : 'Nhập:'}{' '}
                    <strong className="font-mono text-emerald-700">
                      +{wh.inboundQty.toLocaleString(locale)}
                    </strong>{' '}
                    · {language === 'en' ? 'Out:' : 'Xuất:'}{' '}
                    <strong className="font-mono text-rose-700">
                      -{wh.outboundQty.toLocaleString(locale)}
                    </strong>
                  </span>
                  <span className="font-mono tabular-nums">
                    {wh.materialCount.toLocaleString(locale)}{' '}
                    {language === 'en' ? 'items' : 'mã VT'} · {sharePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
