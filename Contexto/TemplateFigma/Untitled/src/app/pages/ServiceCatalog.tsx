import { Search, Laptop, Key, Cloud, Users, Wifi, Shield } from "lucide-react";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const services = [
  {
    icon: Laptop,
    name: "Request New Laptop",
    description: "Request a new laptop or desktop computer for work",
    category: "Hardware",
    approvalRequired: true,
    estimatedTime: "3-5 business days",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Key,
    name: "Software License Request",
    description: "Request access to licensed software applications",
    category: "Software",
    approvalRequired: true,
    estimatedTime: "1-2 business days",
    color: "bg-purple-50 text-purple-600",
  },
  {
    icon: Cloud,
    name: "Cloud Storage Access",
    description: "Request additional cloud storage or shared drives",
    category: "Cloud Services",
    approvalRequired: false,
    estimatedTime: "Same day",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Users,
    name: "New User Onboarding",
    description: "Set up accounts and access for new employees",
    category: "User Management",
    approvalRequired: true,
    estimatedTime: "1 business day",
    color: "bg-green-50 text-green-600",
  },
  {
    icon: Wifi,
    name: "VPN Access Setup",
    description: "Configure VPN for secure remote access",
    category: "Network",
    approvalRequired: false,
    estimatedTime: "Same day",
    color: "bg-orange-50 text-orange-600",
  },
  {
    icon: Shield,
    name: "Security Access Request",
    description: "Request access to secure systems or data",
    category: "Security",
    approvalRequired: true,
    estimatedTime: "2-3 business days",
    color: "bg-red-50 text-red-600",
  },
];

const categories = [
  "All Services",
  "Hardware",
  "Software",
  "Cloud Services",
  "User Management",
  "Network",
  "Security",
];

export function ServiceCatalog() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Service Catalog</h1>
        <p className="text-sm text-gray-500">Browse and request IT services</p>
      </div>

      {/* Search and Filter */}
      <div className="mb-8">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search services..."
            className="pl-10 bg-gray-50 border-gray-200"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {categories.map((category) => (
            <Badge
              key={category}
              className={`cursor-pointer ${
                category === "All Services"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <Card
            key={service.name}
            className="hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer"
          >
            <CardContent className="p-6">
              <div className={`w-12 h-12 ${service.color} rounded-lg flex items-center justify-center mb-4`}>
                <service.icon className="w-6 h-6" />
              </div>

              <h3 className="font-semibold text-gray-900 mb-2">{service.name}</h3>
              <p className="text-sm text-gray-600 mb-4">{service.description}</p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Category:</span>
                  <Badge className="bg-gray-100 text-gray-700 border-gray-200">
                    {service.category}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Estimated time:</span>
                  <span className="font-medium text-gray-900">{service.estimatedTime}</span>
                </div>
                {service.approvalRequired && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Approval:</span>
                    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                      Required
                    </Badge>
                  </div>
                )}
              </div>

              <Button className="w-full">Request Service</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
