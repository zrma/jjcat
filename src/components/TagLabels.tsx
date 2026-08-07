import { Tag } from "lucide-react";

interface TagLabelsProps {
  tags: string[];
  limit?: number;
  className?: string;
}

export function TagLabels({
  tags,
  limit = Number.POSITIVE_INFINITY,
  className = "",
}: TagLabelsProps) {
  const labels = Array.from(new Set(tags.filter((tag) => tag.trim().length > 0)));
  if (labels.length === 0) return null;

  const visible = labels.slice(0, limit);
  const hidden = labels.slice(limit);

  return (
    <span
      className={`tag-list ${className}`.trim()}
      aria-label={`Tags: ${labels.join(", ")}`}
    >
      {visible.map((tag) => (
        <span className="tag-label" title={`Tag ${tag}`} key={tag}>
          <Tag aria-hidden="true" />
          <span>{tag}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="tag-overflow"
          title={hidden.join("\n")}
          aria-label={`${hidden.length} more tags: ${hidden.join(", ")}`}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
