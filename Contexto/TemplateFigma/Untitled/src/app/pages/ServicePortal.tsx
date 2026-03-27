import { Search, Book, FileText, TrendingUp, HelpCircle } from "lucide-react";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const categories = [
  { icon: HelpCircle, name: "Getting Started", articles: 12, color: "bg-blue-50 text-blue-600" },
  { icon: Book, name: "Account & Billing", articles: 8, color: "bg-green-50 text-green-600" },
  { icon: FileText, name: "Technical Support", articles: 24, color: "bg-purple-50 text-purple-600" },
  { icon: TrendingUp, name: "Best Practices", articles: 15, color: "bg-orange-50 text-orange-600" },
];

const popularArticles = [
  {
    title: "How to reset your password",
    views: "1.2k views",
    category: "Getting Started",
    helpful: 45,
  },
  {
    title: "Setting up VPN access",
    views: "980 views",
    category: "Technical Support",
    helpful: 38,
  },
  {
    title: "Requesting new software licenses",
    views: "856 views",
    category: "Account & Billing",
    helpful: 42,
  },
  {
    title: "Configuring email on mobile devices",
    views: "745 views",
    category: "Technical Support",
    helpful: 35,
  },
];

export function ServicePortal() {
  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">How can we help you today?</h1>
          <p className="text-lg text-gray-600 mb-8">
            Search our knowledge base or browse categories below
          </p>
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search for articles, guides, and FAQs..."
              className="pl-12 h-14 text-base shadow-lg border-gray-200"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Categories */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Browse by Category</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((category) => (
              <Card
                key={category.name}
                className="hover:shadow-lg transition-shadow cursor-pointer"
              >
                <CardContent className="p-6">
                  <div className={`w-12 h-12 ${category.color} rounded-lg flex items-center justify-center mb-4`}>
                    <category.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">{category.name}</h3>
                  <p className="text-sm text-gray-600">{category.articles} articles</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Articles */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Popular Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {popularArticles.map((article) => (
              <Card
                key={article.title}
                className="hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <CardContent className="p-6">
                  <Badge className="bg-gray-100 text-gray-700 border-gray-200 mb-3">
                    {article.category}
                  </Badge>
                  <h3 className="font-semibold text-gray-900 mb-3">{article.title}</h3>
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
            <h2 className="text-2xl font-semibold mb-4">Still need help?</h2>
            <p className="text-indigo-100 mb-6">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button className="px-6 py-3 bg-white text-indigo-600 font-medium rounded-lg hover:bg-indigo-50 transition-colors">
                Create a Ticket
              </button>
              <button className="px-6 py-3 bg-indigo-700 text-white font-medium rounded-lg hover:bg-indigo-800 transition-colors">
                Contact Support
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
