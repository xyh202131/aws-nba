import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

const query = "(prefers-reduced-motion: reduce)";
function subscribeMotion(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(query).matches,
    () => true,
  );
}

/** Pause time, not just opacity: hidden/offscreen effects must release their animation loop. */
export function useMotionActivity(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document !== "undefined" && !document.hidden,
  );
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { threshold: 0 },
          );
    if (observer) observer.observe(element);
    else setVisible(true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [ref]);
  return {
    running: enabled && !reduced && visible && tabVisible,
    reduced,
    visible,
    tabVisible,
  };
}
