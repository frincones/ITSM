'use client';

import { ArrowRight, BookOpen } from 'lucide-react';

import { Badge } from '@kit/ui/badge';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface PortalArticle {
  id: string;
  title: string;
  slug: string;
  view_count: number;
  helpful_votes: number;
  category: { id: string; name: string } | null;
}

interface PopularArticlesProps {
  articles: PortalArticle[];
  onArticleClick?: (article: PortalArticle) => void;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PopularArticles({
  articles,
  onArticleClick,
}: PopularArticlesProps) {
  if (articles.length === 0) return null;

  return (
    <div className="w-full">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Articulos populares
      </h3>
      <div className="space-y-1">
        {articles.slice(0, 5).map((article) => (
          <button
            key={article.id}
            onClick={() => onArticleClick?.(article)}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <BookOpen className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
              {article.title}
            </span>
            {article.category && (
              <Badge
                variant="secondary"
                className="hidden text-[10px] sm:inline-flex"
              >
                {article.category.name}
              </Badge>
            )}
            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
}
