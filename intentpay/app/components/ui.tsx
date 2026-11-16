// UI building blocks used by every screen.
//
// Lightweight stand-ins with the same names and props as the Westpac GEL components we use
// (Button, Badge, Alert, ProgressBar, Input, Select, Textarea). They are styled with the real
// Westpac theme tokens from @westpac/style-config (small), so the colours match GEL, but we
// avoid installing @westpac/ui itself: its react-aria dependency is ~2 GB / 400k files.
//
// To switch to the real GEL components later:
//   1. npm i @westpac/ui
//   2. replace this file's contents with:  export * from "@westpac/ui";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  look?: "primary" | "hero" | "faint" | "link" | "unstyled";
  size?: "small" | "medium" | "large" | "xlarge";
  block?: boolean;
};

export function Button({ look = "primary", size = "medium", block, className, children, ...rest }: ButtonProps) {
  const looks: Record<string, string> = {
    primary: "bg-surface-primary text-text-mono hover:bg-surface-hover-primary active:bg-surface-active-primary",
    hero: "bg-surface-hero text-text-mono hover:bg-surface-hover-hero active:bg-surface-active-hero",
    faint: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
    link: "text-text-primary underline",
    unstyled: "",
  };
  const sizes: Record<string, string> = {
    small: "h-8 px-3 text-xs",
    medium: "h-10 px-4 text-sm",
    large: "h-12 px-5 text-base",
    xlarge: "h-14 px-6 text-base",
  };
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        looks[look],
        sizes[size],
        block && "w-full",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Badge({
  color = "muted",
  children,
}: {
  color?: "success" | "warning" | "danger" | "info" | "muted";
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    success: "bg-surface-success text-text-mono",
    warning: "bg-surface-warning text-text-mono",
    danger: "bg-surface-danger text-text-mono",
    info: "bg-surface-info text-text-mono",
    muted: "bg-surface-muted text-text-mono",
  };
  return (
    <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", colors[color])}>
      {children}
    </span>
  );
}

export function Alert({
  look = "info",
  heading,
  children,
}: {
  look?: "success" | "warning" | "danger" | "info";
  mode?: "box" | "text";
  heading?: string;
  children: ReactNode;
}) {
  const looks: Record<string, string> = {
    success: "border-surface-success bg-surface-success-faint text-gray-900",
    warning: "border-surface-warning bg-surface-warning-faint text-gray-900",
    danger: "border-surface-danger bg-surface-danger-faint text-gray-900",
    info: "border-surface-info bg-surface-info-faint text-gray-900",
  };
  return (
    <div role="alert" className={cx("rounded-md border-l-4 p-3 text-sm", looks[look])}>
      {heading && <p className="mb-1 font-semibold">{heading}</p>}
      {children}
    </div>
  );
}

export function ProgressBar({ value = 0 }: { value?: number; look?: "default" | "skinny"; "aria-label"?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted-soft" role="progressbar" aria-valuenow={pct}>
      <div className="h-full rounded-full bg-surface-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

const field =
  "w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-border-primary focus:ring-1 focus:ring-border-primary";

export function Input({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={cx(field, invalid ? "border-border-primary" : "border-gray-300", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(field, "border-gray-300", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(field, "border-gray-300", className)} />;
}

// ---- Shared layout primitives (use these for every screen) ----

/** Westpac GEL icon from /public/icons, coloured with the current text colour. */
export function Icon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const url = `url(/icons/${name}.svg)`;
  return (
    <span
      aria-hidden
      className={cx("inline-block shrink-0 bg-current", className)}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

/** White rounded card with a soft border, used for every grouped block of content. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-gray-200 bg-white p-4 shadow-sm", className)}>{children}</section>;
}

/** Section heading, optionally with a small action link on the right. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold text-gray-900">{children}</h2>
      {action}
    </div>
  );
}
