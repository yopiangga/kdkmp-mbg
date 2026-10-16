import { useEffect, useRef } from 'react';
import { echarts, type EChartsOption } from '../lib/echarts';
import { cssVar, useTema } from '../lib/theme';

export interface Palet {
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  surface: string;
  kop: string;
  mbg: string;
  sim: string;
  crit: string;
  critSoft: string;
  series: [string, string, string];
  other: string;
  font: string;
  mono: string;
}

export function readPalet(): Palet {
  return {
    ink: cssVar('--ink'),
    ink2: cssVar('--ink-2'),
    muted: cssVar('--muted'),
    line: cssVar('--line'),
    surface: cssVar('--surface'),
    kop: cssVar('--kop'),
    mbg: cssVar('--mbg'),
    sim: cssVar('--sim'),
    crit: cssVar('--crit'),
    critSoft: cssVar('--crit-soft'),
    series: [cssVar('--series-1'), cssVar('--series-2'), cssVar('--series-3')],
    other: cssVar('--series-other'),
    font: cssVar('--font-sans'),
    mono: cssVar('--font-mono'),
  };
}

/** Pembungkus ECharts: membangun ulang opsi saat tema berganti dan mengikuti lebar kontainer. */
export function Chart({ build, height = 280, ariaLabel, onClick }: {
  build: (p: Palet) => EChartsOption;
  height?: number;
  ariaLabel: string;
  onClick?: (params: { data?: unknown; name?: string; dataIndex?: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);
  const { tema } = useTema();

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const p = readPalet();
    c.setOption(
      {
        textStyle: { fontFamily: p.font, color: p.ink2 },
        animationDuration: 300,
        ...build(p),
      },
      true,
    );
  }, [build, tema]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !onClick) return;
    c.on('click', onClick);
    return () => {
      c.off('click', onClick);
    };
  }, [onClick]);

  return <div ref={ref} className="chart" style={{ height }} role="img" aria-label={ariaLabel} />;
}

/** Tooltip standar: permukaan kartu, tinta teks, tanpa warna seri pada teks. */
export const tooltipBase = (p: Palet) => ({
  backgroundColor: p.surface,
  borderColor: p.line,
  borderWidth: 1,
  textStyle: { color: p.ink, fontFamily: p.font, fontSize: 12 },
  extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.08); border-radius: 8px;',
});

export const axisBase = (p: Palet) => ({
  axisLine: { lineStyle: { color: p.line } },
  axisTick: { show: false },
  axisLabel: { color: p.muted, fontFamily: p.mono, fontSize: 11 },
  splitLine: { lineStyle: { color: p.line, type: 'solid' as const } },
});
