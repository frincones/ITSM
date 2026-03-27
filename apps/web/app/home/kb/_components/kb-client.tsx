'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Eye,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBCategory {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  article_count: number;
}

interface KBArticleCategory {
  id: string;
  name: string;
}

interface KBArticle {
  id: string;
  title: string;
  slug: string;
  status: string;
  view_count: number | null;
  helpful_votes: number | null;
  not_helpful_votes: number | null;
  updated_at: string;
  created_at: string;
  category: KBArticleCategory | null;
}

interface KnowledgeBaseClientProps {
  categories: KBCategory[];
  articles: KBArticle[];
  searchQuery: string;
  activeCategory: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  return `${Math.floor(diffDays / 30)} months ago`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function KnowledgeBaseClient({
  categories,
  articles,
  searchQuery,
  activeCategory,
}: KnowledgeBaseClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchQuery);

  // Navigation helpers
  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(overrides).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      return `/home/kb?${params.toString()}`;
    },
    [searchParams],
  );

  const navigateTo = useCallback(
    (overrides: Record<string, string | undefined>) => {
      startTransition(() => {
        router.push(buildUrl(overrides));
      });
    },
    [router, buildUrl],
  );

  const handleSearch = () => {
    navigateTo({ search: search || undefined });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    navigateTo({
      category: activeCategory === categoryId ? undefined : categoryId,
    });
  };

  return (
    <div className="flex h-full">
      {/* Category Sidebar */}
      <aside className="w-64 overflow-auto border-r border-gray-200 bg-white">
        <div className="p-6">
          <h2 className="mb-4 font-semibold text-gray-900">Categories</h2>
          <div className="space-y-1">
            <button
              onClick={() => navigateTo({ category: undefined })}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                !activeCategory
                  ? 'bg-indigo-50 text-indigo-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>All Articles</span>
              <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                {articles.length}
              </Badge>
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryClick(category.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeCategory === category.id
                    ? 'bg-indigo-50 text-indigo-600 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span>{category.name}</span>
                <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                  {category.article_count}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100">
                <BookOpen className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-semibold text-gray-900">
                  Knowledge Base
                </h1>
                <p className="text-sm text-gray-500">
                  Browse articles and guides
                </p>
              </div>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Article
              </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search knowledge base..."
                className="border-gray-200 bg-gray-50 pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={handleSearch}
              />
            </div>
          </div>

          {/* Articles Grid */}
          {articles.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              No articles found.
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <Card
                  key={article.id}
                  className="cursor-pointer transition-all hover:border-gray-300 hover:shadow-md"
                  onClick={() =>
                    router.push(`/home/kb/articles/${article.id}`)
                  }
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          {article.category && (
                            <Badge className="border-indigo-200 bg-indigo-100 text-indigo-700">
                              {article.category.name}
                            </Badge>
                          )}
                        </div>
                        <h3 className="mb-2 text-lg font-semibold text-gray-900">
                          {article.title}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>
                            Updated {formatRelativeDate(article.updated_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3.5 w-3.5" />
                            {(article.view_count ?? 0).toLocaleString()} views
                          </span>
                          <span className="flex items-center gap-1">
                            <ThumbsUp className="h-3.5 w-3.5" />
                            {article.helpful_votes ?? 0} found helpful
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ThumbsUp className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ThumbsDown className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
