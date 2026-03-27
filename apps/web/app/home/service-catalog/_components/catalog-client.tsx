'use client';

import { useState } from 'react';

import {
  Cloud,
  Key,
  Laptop,
  Search,
  Shield,
  Users,
  Wifi,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Input } from '@kit/ui/input';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon_name: string | null;
  approval_required: boolean;
  estimated_time: string | null;
  is_published: boolean;
}

interface CatalogClientProps {
  services: ServiceItem[];
  categories: string[];
}

/* -------------------------------------------------------------------------- */
/*  Fallback Data                                                              */
/* -------------------------------------------------------------------------- */

const fallbackServices: ServiceItem[] = [
  {
    id: '1',
    name: 'Request New Laptop',
    description: 'Request a new laptop or desktop computer for work',
    category: 'Hardware',
    icon_name: 'laptop',
    approval_required: true,
    estimated_time: '3-5 business days',
    is_published: true,
  },
  {
    id: '2',
    name: 'Software License Request',
    description: 'Request access to licensed software applications',
    category: 'Software',
    icon_name: 'key',
    approval_required: true,
    estimated_time: '1-2 business days',
    is_published: true,
  },
  {
    id: '3',
    name: 'Cloud Storage Access',
    description: 'Request additional cloud storage or shared drives',
    category: 'Cloud Services',
    icon_name: 'cloud',
    approval_required: false,
    estimated_time: 'Same day',
    is_published: true,
  },
  {
    id: '4',
    name: 'New User Onboarding',
    description: 'Set up accounts and access for new employees',
    category: 'User Management',
    icon_name: 'users',
    approval_required: true,
    estimated_time: '1 business day',
    is_published: true,
  },
  {
    id: '5',
    name: 'VPN Access Setup',
    description: 'Configure VPN for secure remote access',
    category: 'Network',
    icon_name: 'wifi',
    approval_required: false,
    estimated_time: 'Same day',
    is_published: true,
  },
  {
    id: '6',
    name: 'Security Access Request',
    description: 'Request access to secure systems or data',
    category: 'Security',
    icon_name: 'shield',
    approval_required: true,
    estimated_time: '2-3 business days',
    is_published: true,
  },
];

const fallbackCategories = [
  'Hardware',
  'Software',
  'Cloud Services',
  'User Management',
  'Network',
  'Security',
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const iconMap: Record<string, typeof Laptop> = {
  laptop: Laptop,
  key: Key,
  cloud: Cloud,
  users: Users,
  wifi: Wifi,
  shield: Shield,
};

const colorMap: Record<string, string> = {
  Hardware: 'bg-blue-50 text-blue-600',
  Software: 'bg-purple-50 text-purple-600',
  'Cloud Services': 'bg-cyan-50 text-cyan-600',
  'User Management': 'bg-green-50 text-green-600',
  Network: 'bg-orange-50 text-orange-600',
  Security: 'bg-red-50 text-red-600',
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function CatalogClient({ services, categories }: CatalogClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Services');

  const displayServices =
    services.length > 0 ? services : fallbackServices;
  const displayCategories =
    categories.length > 0 ? categories : fallbackCategories;

  const allCategories = ['All Services', ...displayCategories];

  const filteredServices = displayServices.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      service.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      activeCategory === 'All Services' ||
      service.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">
          Service Catalog
        </h1>
        <p className="text-sm text-gray-500">
          Browse and request IT services
        </p>
      </div>

      {/* Search and Filter */}
      <div className="mb-8">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search services..."
            className="border-gray-200 bg-gray-50 pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Category Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {allCategories.map((category) => (
            <Badge
              key={category}
              className={`cursor-pointer ${
                category === activeCategory
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </Badge>
          ))}
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredServices.map((service) => {
          const IconComponent =
            iconMap[service.icon_name ?? ''] ?? Laptop;
          const color =
            colorMap[service.category] ?? 'bg-gray-50 text-gray-600';

          return (
            <Card
              key={service.id}
              className="cursor-pointer transition-all hover:border-gray-300 hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${color}`}
                >
                  <IconComponent className="h-6 w-6" />
                </div>

                <h3 className="mb-2 font-semibold text-gray-900">
                  {service.name}
                </h3>
                <p className="mb-4 text-sm text-gray-600">
                  {service.description}
                </p>

                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Category:</span>
                    <Badge className="border-gray-200 bg-gray-100 text-gray-700">
                      {service.category}
                    </Badge>
                  </div>
                  {service.estimated_time && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Estimated time:</span>
                      <span className="font-medium text-gray-900">
                        {service.estimated_time}
                      </span>
                    </div>
                  )}
                  {service.approval_required && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Approval:</span>
                      <Badge className="border-yellow-200 bg-yellow-100 text-yellow-700">
                        Required
                      </Badge>
                    </div>
                  )}
                </div>

                <Button className="w-full">Request Service</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500">
            No services found matching your criteria.
          </p>
        </div>
      )}
    </div>
  );
}
