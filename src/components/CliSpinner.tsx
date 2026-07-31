export function CliSpinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={["cli-spinner", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
