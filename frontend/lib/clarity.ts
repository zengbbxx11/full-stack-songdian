/** Consent-gated Microsoft Clarity loader. Only used by the public website. */
type ClarityCommand =
  | ["consentv2", { ad_Storage: "denied"; analytics_Storage: "granted" | "denied" }]
  | ["start"]
  | ["stop"];

type ClarityClient = ((...args: ClarityCommand) => void) & {
  q?: ClarityCommand[];
  v?: string;
};

declare global {
  interface Window {
    clarity?: ClarityClient;
  }
}

const SCRIPT_ID = "microsoft-clarity";
let enabled = false;

export function safeClarityId(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9]+$/i.test(candidate) ? candidate : null;
}

export function syncClarityConsent(projectId: string | null, allowed: boolean): void {
  if (typeof window === "undefined") return;
  const id = safeClarityId(projectId);
  try {
    if (!allowed || !id) {
      if (!enabled) return;
      enabled = false;
      // If the SDK is still downloading, discard the earlier grant before queuing denial.
      if (window.clarity?.q) window.clarity.q.length = 0;
      window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      // Denied storage alone can still allow cookieless tracking. Stop the recorder too.
      window.clarity?.("stop");
      return;
    }
    if (enabled) return;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      window.clarity?.("start");
    } else {
      window.clarity = window.clarity || Object.assign(
        (...args: ClarityCommand) => { window.clarity?.q?.push(args); },
        { q: [] as ClarityCommand[] },
      );
    }
    window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
    enabled = true;

    if (!existing) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${id}`;
      script.onerror = () => {
        enabled = false;
        script.remove();
        if (window.clarity?.q) window.clarity.q.length = 0;
      };
      document.head.appendChild(script);
    }
  } catch {
    // Optional analytics must never interrupt navigation or form submission.
    enabled = false;
  }
}
