// src/components/chart/echart.tsx
import React, { useEffect, useRef } from "react";
import * as echarts from "echarts"; // Use the full build to avoid missing on-demand registrations

type Props = {
  option: echarts.EChartsCoreOption;
  height?: number;
  renderer?: "svg" | "canvas";
};

// A robust ECharts wrapper: adapts to container size & visibility;
// avoids initial 0-width causing the right side to fail rendering
const EChart: React.FC<Props> = ({ option, height = 320, renderer = "svg" }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  // Initialize & update option
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    // Ensure the container has dimensions
    el.style.width = "100%";
    el.style.height = `${height}px`;

    // Create the instance (only once)
    if (!instRef.current) {
      instRef.current = echarts.init(el, undefined, {
        renderer,
        useDirtyRect: true,
      });
    }

    // Apply option and force a resize once to avoid 0-width initialization
    instRef.current.setOption(option, { notMerge: true, lazyUpdate: false });
    instRef.current.resize();

    // — Observe container size changes: parent layout changes should also trigger resize
    if (!roRef.current) {
      roRef.current = new ResizeObserver(() => {
        instRef.current && instRef.current.resize();
      });
    }
    roRef.current.observe(el);

    // — Observe visibility: when hidden then shown, force a refresh
    if (!ioRef.current) {
      ioRef.current = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            // Resize on the next frame to ensure the layout is stable
            requestAnimationFrame(() => instRef.current && instRef.current.resize());
          }
        });
      });
    }
    ioRef.current.observe(el);

    // — Window resize
    const onWinResize = () => instRef.current && instRef.current.resize();
    window.addEventListener("resize", onWinResize);

    // — Repaint once after fonts finish loading (avoid grid shifts due to wrapping)
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => {
        instRef.current && instRef.current.resize();
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("resize", onWinResize);
      try { roRef.current && el && roRef.current.unobserve(el); } catch {}
      try { ioRef.current && el && ioRef.current.unobserve(el); } catch {}

      // Only dispose when the element is actually unmounted to avoid frequent re-creation
      if (instRef.current && !el.isConnected) {
        instRef.current.dispose();
        instRef.current = null;
      }
    };
  }, [option, height, renderer]);

  return <div ref={boxRef} />;
};

export default EChart;
