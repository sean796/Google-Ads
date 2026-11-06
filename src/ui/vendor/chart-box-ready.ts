import { useLayoutEffect, useState } from "react";

export function isChartBoxReady(width: number, height: number): boolean {
  return width > 0 && height > 0;
}

export function useBoxReady(): {
  boxRef: (node: HTMLElement | null) => void;
  ready: boolean;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!node) {
      setReady(false);
      return;
    }

    const update = () => {
      const rect = node.getBoundingClientRect();
      setReady(isChartBoxReady(rect.width, rect.height));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { boxRef: setNode, ready };
}
