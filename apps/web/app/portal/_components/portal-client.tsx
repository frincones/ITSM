'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Book,
  FileText,
  HelpCircle,
  Search,
  TrendingUp,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Input } from '@kit/ui/input';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface PortalArticle {
  id: string;
  title: string;
  slug: string;
  view_count: number;
  helpful_votes: number;
  category: { id: string; name: string } | null;
}

interface PortalService {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface PortalClientProps {
  articles: PortalArticle[];
  services: PortalService[];
}

/* -------------------------------------------------------------------------- */
/*  Static Data                                                                */
/* -------------------------------------------------------------------------- */

const categories = [
  {
    icon: HelpCircle,
    name: 'Getting Started',
    articles: 12,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Book,
    name: 'Account & Billing',
    articles: 8,
    color: 'bg-green-50 text-green-600',
  },
  {
    icon: FileText,
    name: 'Technical Support',
    articles: 24,
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: TrendingUp,
    name: 'Best Practices',
    articles: 15,
    color: 'bg-orange-50 text-orange-600',
  },
];

const fallbackArticles = [
  {
    title: 'How to reset your password',
    views: '1.2k views',
    category: 'Getting Started',
    helpful: 45,
  },
  {
    title: 'Setting up VPN access',
    views: '980 views',
    category: 'Technical Support',
    helpful: 38,
  },
  {
    title: 'Requesting new software licenses',
    views: '856 views',
    category: 'Account & Billing',
    helpful: 42,
  },
  {
    title: 'Configuring email on mobile devices',
    views: '745 views',
    category: 'Technical Support',
    helpful: 35,
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function PortalClient({ articles, services }: PortalClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/portal/kb?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  // Build display articles from server data or fallback
  const displayArticles =
    articles.length > 0
      ? articles.map((a) => ({
          title: a.title,
          views: `${a.view_count >= 1000 ? `${(a.view_count / 1000).toFixed(1)}k` : a.view_count} views`,
          category: a.category?.name ?? 'General',
          helpful: a.helpful_votes,
        }))
      : fallbackArticles;

  return (
    <div className="min-h-full">
      {/* Hero Section */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            How can we help you today?
          </h1>
          <p className="mb-8 text-lg text-gray-600">
            Search our knowledge base or browse categories below
          </p>
          <form onSubmit={handleSearch} className="relative mx-auto max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search for articles, guides, and FAQs..."
              className="h-14 border-gray-200 pl-12 text-base shadow-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Categories */}
        <div className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold text-gray-900">
            Browse by Category
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <Card
                key={category.name}
                className="cursor-pointer transition-shadow hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${category.color}`}
                  >
                    <category.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 font-semibold text-gray-900">
                    {category.name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {category.articles} articles
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Articles */}
        <div className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold text-gray-900">
            Popular Articles
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {displayArticles.map((article) => (
              <Card
                key={article.title}
                className="cursor-pointer transition-all hover:border-gray-300 hover:shadow-sm"
              >
                <CardContent className="p-6">
                  <Badge className="mb-3 border-gray-200 bg-gray-100 text-gray-700">
                    {article.category}
                  </Badge>
                  <h3 className="mb-3 font-semibold text-gray-900">
                    {article.title}
                  </h3>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>{article.views}</span>
                    <span>{article.helpful} found this helpful</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <CardContent className="p-8 text-center">
            <h2 className="mb-4 text-2xl font-semibold">Still need help?</h2>
            <p className="mb-6 text-indigo-100">
              Can&apos;t find what you&apos;re looking for? Our support team is
              here to help.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link href="/portal/tickets/new">
                <Button
                  variant="secondary"
                  className="bg-white font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  Create a Ticket
                </Button>
              </Link>
              <Link href="/portal/chat">
                <Button
                  variant="secondary"
                  className="bg-indigo-700 font-medium text-white hover:bg-indigo-800"
                >
                  Contact Support
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
