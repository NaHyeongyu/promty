import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  listPublishedPrompts,
  promptHubErrorMessage,
  type PromptHubListItem,
  type PromptHubSort,
} from "../../api/promptHub";
import { PromptHubCard } from "./PromptHubCard";
import "./prompt-hub.css";

const categories = [
  "All",
  "Frontend",
  "Backend",
  "Refactoring",
  "Architecture",
  "Documentation",
];

const sortOptions: Array<{ label: string; value: PromptHubSort }> = [
  { label: "Latest", value: "latest" },
  { label: "Trending", value: "trending" },
  { label: "Top Rated", value: "top" },
];

type PromptHubListPageProps = {
  onOpenPrompt: (slug: string) => void;
};

export function PromptHubListPage({ onOpenPrompt }: PromptHubListPageProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prompts, setPrompts] = useState<PromptHubListItem[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PromptHubSort>("latest");
  const normalizedCategory = activeCategory === "All" ? undefined : activeCategory;
  const hasFilters = query.trim().length > 0 || activeCategory !== "All";

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setErrorMessage(null);
    listPublishedPrompts(
      {
        category: normalizedCategory,
        limit: 50,
        q: query,
        sort,
      },
      controller.signal,
    )
      .then(setPrompts)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setErrorMessage(
          promptHubErrorMessage(error, "Failed to load prompts"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [normalizedCategory, query, sort]);

  const emptyTitle = useMemo(() => {
    if (errorMessage) {
      return "Failed to load prompts";
    }
    return hasFilters ? "No search results" : "No published prompts";
  }, [errorMessage, hasFilters]);

  return (
    <section className="bh-prompt-hub-page" aria-labelledby="prompt-hub-title">
      <header className="page-header">
        <div>
          <h1 id="prompt-hub-title">Prompt Hub</h1>
          <p className="bh-prompt-hub-description">
            Shared AI development prompts with real execution context.
          </p>
        </div>
      </header>

      <div className="bh-prompt-hub-toolbar">
        <label className="bh-prompt-hub-search">
          <Search aria-hidden="true" size={16} strokeWidth={1.6} />
          <span>Search prompts</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search prompts"
            type="search"
            value={query}
          />
        </label>

        <label className="bh-prompt-hub-sort">
          <span>Sort</span>
          <select
            onChange={(event) => setSort(event.target.value as PromptHubSort)}
            value={sort}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bh-prompt-hub-filter-row" aria-label="Prompt categories">
        {categories.map((category) => (
          <button
            className="bh-prompt-filter-chip"
            data-active={activeCategory === category}
            key={category}
            onClick={() => setActiveCategory(category)}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="inline-loading-status">Loading Prompt Hub</div>
      ) : prompts.length > 0 ? (
        <div className="bh-prompt-grid">
          {prompts.map((prompt) => (
            <PromptHubCard
              key={prompt.id}
              onOpen={() => onOpenPrompt(prompt.slug)}
              prompt={prompt}
            />
          ))}
        </div>
      ) : (
        <div className="bh-prompt-empty-state">
          <span>{errorMessage ? "Sync issue" : "Prompt Hub"}</span>
          <h2>{emptyTitle}</h2>
          <p>
            {errorMessage ??
              (hasFilters
                ? "Try adjusting the search, category, or sort."
                : "Published prompts will appear here after drafts are published.")}
          </p>
        </div>
      )}
    </section>
  );
}
