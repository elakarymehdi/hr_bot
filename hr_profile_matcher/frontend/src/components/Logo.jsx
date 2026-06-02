export default function Logo({ size = 40, showText = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
      <img
        src="/logo.svg"
        alt="Profile Matcher"
        style={{ width: size, height: size }}
        className="shrink-0"
      />
      {showText && (
        <span className="text-sm font-semibold tracking-tight">Profile Matcher</span>
      )}
    </div>
  );
}
