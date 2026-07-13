import { Scale } from "lucide-react";

export function LegalBadgeButton({ onClick, title = "Ver soporte legal" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center w-5 h-5 ml-1 rounded bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-600 hover:text-white transition"
    >
      <Scale className="w-3 h-3" />
    </button>
  );
}