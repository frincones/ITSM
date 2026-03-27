import { Search, BookOpen, ThumbsUp, ThumbsDown } from "lucide-react";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";

const categories = [
  { name: "Getting Started", count: 12 },
  { name: "Account & Billing", count: 8 },
  { name: "Technical Support", count: 24 },
  { name: "Best Practices", count: 15 },
  { name: "Troubleshooting", count: 18 },
  { name: "Security", count: 10 },
];

const articles = [
  {
    title: "How to reset your password",
    category: "Getting Started",
    updated: "2 days ago",
    views: 1245,
    helpful: 45,
  },
  {
    title: "Setting up VPN access for remote work",
    category: "Technical Support",
    updated: "1 week ago",
    views: 980,
    helpful: 38,
  },
  {
    title: "Requesting new software licenses",
    category: "Account & Billing",
    updated: "3 days ago",
    views: 856,
    helpful: 42,
  },
  {
    title: "Configuring email on mobile devices",
    category: "Technical Support",
    updated: "5 days ago",
    views: 745,
    helpful: 35,
  },
  {
    title: "Understanding SLA and support levels",
    category: "Getting Started",
    updated: "1 week ago",
    views: 623,
    helpful: 29,
  },
  {
    title: "Multi-factor authentication setup guide",
    category: "Security",
    updated: "4 days ago",
    views: 567,
    helpful: 31,
  },
];

export function KnowledgeBase() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 overflow-auto">
        <div className="p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Categories</h2>
          <div className="space-y-1">
            {categories.map((category) => (
              <button
                key={category.name}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
              >
                <span>{category.name}</span>
                <Badge className="bg-gray-100 text-gray-600 border-gray-200">
                  {category.count}
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
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Knowledge Base</h1>
                <p className="text-sm text-gray-500">Browse articles and guides</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search knowledge base..."
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>
          </div>

          {/* Articles Grid */}
          <div className="space-y-4">
            {articles.map((article) => (
              <Card
                key={article.title}
                className="hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                          {article.category}
                        </Badge>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {article.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Updated {article.updated}</span>
                        <span>•</span>
                        <span>{article.views.toLocaleString()} views</span>
                        <span>•</span>
                        <span>{article.helpful} found helpful</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ThumbsUp className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ThumbsDown className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
