import { useEffect, useState, type RefObject } from "react";
import { SurfaceShader, type SkyPalette } from "./SurfaceShader";

// Qunxue workbench palette, retained from the supplied UI kit.
const WORKBENCH: SkyPalette = ["#fafcfe", "#edf1f7", "#c2ccdb", "#8c94a4"];

export function StudioAtmosphere({ paused }: { paused: boolean }) {
  return (
    <div className="studio-atmosphere" aria-hidden="true">
      <SurfaceShader
        lightPalette={WORKBENCH}
        lightYshift={-0.32}
        motionScale={0.32}
        maxPixelCount={480 * 180}
        paused={paused}
      />
    </div>
  );
}

/** Move one surface between navigation items; no continuous layout polling. */
export function NavHighlight({
  navRef,
  motionKey,
}: {
  navRef: RefObject<HTMLElement | null>;
  motionKey: string;
}) {
  const [position, setPosition] = useState({ x: 0, y: 0, width: 0, height: 0 });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const selected = nav.querySelector<HTMLElement>(
        'button[aria-current="page"]',
      );
      if (!selected) return;
      setPosition({
        x: selected.offsetLeft,
        y: selected.offsetTop,
        width: selected.offsetWidth,
        height: selected.offsetHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, motionKey]);
  return (
    <span
      className="studio-nav-highlight"
      aria-hidden="true"
      style={{
        width: position.width,
        height: position.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
    />
  );
}
