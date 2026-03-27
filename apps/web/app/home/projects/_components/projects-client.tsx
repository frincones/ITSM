'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  Users,
  CheckCircle2,
  TrendingUp,
  MoreVertical,
  Folder,
  ListTodo,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Card, CardContent } from '@kit/ui/card';
import { Badge } from '@kit/ui/badge';
import { Avatar, AvatarFallback } from '@kit/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import { Label } from '@kit/ui/label';
import { Textarea } from '@kit/ui/textarea';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  manager: string | null;
  budget: number | null;
  created_at: string;
  [key: string]: unknown;
}

interface ProjectsClientProps {
  projects: Project[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'planning':
      return { label: 'Planning', className: 'bg-gray-100 text-gray-700' };
    case 'in_progress':
      return { label: 'In Progress', className: 'bg-blue-100 text-blue-700' };
    case 'on_hold':
      return { label: 'On Hold', className: 'bg-yellow-100 text-yellow-700' };
    case 'completed':
      return { label: 'Completed', className: 'bg-green-100 text-green-700' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-700' };
    default:
      return { label: status ?? 'Unknown', className: 'bg-gray-100 text-gray-700' };
  }
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatCurrency = (amount: number | null) => {
  if (amount == null) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
};

/* -------------------------------------------------------------------------- */
/*  Mock data for demo when no DB projects exist                               */
/* -------------------------------------------------------------------------- */

const DEMO_PROJECTS: Project[] = [
  {
    id: 'demo-1',
    name: 'IT Infrastructure Upgrade',
    description: 'Upgrade all servers and network equipment',
    status: 'in_progress',
    progress: 65,
    start_date: '2026-01-15',
    end_date: '2026-04-30',
    manager: 'John Doe',
    budget: 250000,
    created_at: '2026-01-15',
  },
  {
    id: 'demo-2',
    name: 'Security Audit & Compliance',
    description: 'Annual security audit and ISO 27001 certification',
    status: 'in_progress',
    progress: 42,
    start_date: '2026-02-01',
    end_date: '2026-05-15',
    manager: 'Lisa Wang',
    budget: 120000,
    created_at: '2026-02-01',
  },
  {
    id: 'demo-3',
    name: 'Cloud Migration Phase 2',
    description: 'Migrate remaining applications to AWS',
    status: 'planning',
    progress: 15,
    start_date: '2026-03-01',
    end_date: '2026-08-30',
    manager: 'Tom Harris',
    budget: 450000,
    created_at: '2026-03-01',
  },
  {
    id: 'demo-4',
    name: 'Help Desk System Implementation',
    description: 'Deploy new ITSM platform',
    status: 'completed',
    progress: 100,
    start_date: '2025-11-01',
    end_date: '2026-02-28',
    manager: 'Sarah Miller',
    budget: 180000,
    created_at: '2025-11-01',
  },
];

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function ProjectsClient({ projects: serverProjects }: ProjectsClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const projects = serverProjects.length > 0 ? serverProjects : DEMO_PROJECTS;

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const q = searchTerm.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, searchTerm]);

  // Stats
  const activeCount = projects.filter(
    (p) => p.status === 'in_progress' || p.status === 'planning',
  ).length;
  const completedCount = projects.filter(
    (p) => p.status === 'completed',
  ).length;
  const avgProgress = projects.length > 0
    ? Math.round(
        projects.reduce((sum, p) => sum + (p.progress ?? 0), 0) /
          projects.length,
      )
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage IT projects, tasks, and resources
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setAddOpen(false);
              }}
            >
              <div>
                <Label htmlFor="project-name">Project Name</Label>
                <Input id="project-name" placeholder="Enter project name" />
              </div>
              <div>
                <Label htmlFor="project-desc">Description</Label>
                <Textarea
                  id="project-desc"
                  placeholder="Describe the project..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input id="start-date" type="date" />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input id="end-date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="budget">Budget</Label>
                <Input id="budget" type="number" placeholder="0" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Folder className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Projects</p>
                <p className="text-2xl font-semibold">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-semibold">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <ListTodo className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Projects</p>
                <p className="text-2xl font-semibold">{projects.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Progress</p>
                <p className="text-2xl font-semibold">{avgProgress}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search projects..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Projects List */}
      <div className="grid grid-cols-1 gap-6">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <Folder className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No projects found</p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const statusConfig = getStatusConfig(project.status);
            const initials = project.manager
              ? project.manager
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
              : '??';

            return (
              <Card
                key={project.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {project.name}
                        </h3>
                        <Badge className={statusConfig.className}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      {project.description && (
                        <p className="text-sm text-gray-600 mb-4">
                          {project.description}
                        </p>
                      )}
                      <div className="flex items-center gap-6 text-sm text-gray-600 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {formatDate(project.start_date)} -{' '}
                            {formatDate(project.end_date)}
                          </span>
                        </div>
                        {project.manager && (
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span>Manager: {project.manager}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" />
                          <span>Budget: {formatCurrency(project.budget)}</span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Edit Project</DropdownMenuItem>
                        <DropdownMenuItem>Add Task</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Progress
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {project.progress ?? 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all"
                        style={{ width: `${project.progress ?? 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Team / Manager Avatar */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Team:</span>
                    <div className="flex -space-x-2">
                      <Avatar className="w-8 h-8 border-2 border-white">
                        <AvatarFallback className="text-xs bg-gray-100">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                    >
                      + Add Member
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
