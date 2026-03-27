import { useState } from "react";
import { Link } from "react-router";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  MoreVertical,
  Folder,
  ListTodo,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const projects = [
  {
    id: 1,
    name: "IT Infrastructure Upgrade",
    description: "Upgrade all servers and network equipment",
    status: "in_progress",
    progress: 65,
    start_date: "Jan 15, 2026",
    end_date: "Apr 30, 2026",
    manager: "John Doe",
    team: ["JD", "LW", "TH", "SM"],
    tasks: { total: 48, completed: 31 },
    budget: "$250,000",
  },
  {
    id: 2,
    name: "Security Audit & Compliance",
    description: "Annual security audit and ISO 27001 certification",
    status: "in_progress",
    progress: 42,
    start_date: "Feb 1, 2026",
    end_date: "May 15, 2026",
    manager: "Lisa Wang",
    team: ["LW", "TH", "ED"],
    tasks: { total: 32, completed: 13 },
    budget: "$120,000",
  },
  {
    id: 3,
    name: "Cloud Migration Phase 2",
    description: "Migrate remaining applications to AWS",
    status: "planning",
    progress: 15,
    start_date: "Mar 1, 2026",
    end_date: "Aug 30, 2026",
    manager: "Tom Harris",
    team: ["TH", "MC", "AT"],
    tasks: { total: 64, completed: 10 },
    budget: "$450,000",
  },
  {
    id: 4,
    name: "Help Desk System Implementation",
    description: "Deploy new ITSM platform",
    status: "completed",
    progress: 100,
    start_date: "Nov 1, 2025",
    end_date: "Feb 28, 2026",
    manager: "Sarah Miller",
    team: ["SM", "JD", "LW"],
    tasks: { total: 28, completed: 28 },
    budget: "$180,000",
  },
];

const getStatusConfig = (status: string) => {
  switch (status) {
    case "planning":
      return { label: "Planning", className: "bg-gray-100 text-gray-700" };
    case "in_progress":
      return { label: "In Progress", className: "bg-blue-100 text-blue-700" };
    case "on_hold":
      return { label: "On Hold", className: "bg-yellow-100 text-yellow-700" };
    case "completed":
      return { label: "Completed", className: "bg-green-100 text-green-700" };
    default:
      return { label: "Unknown", className: "bg-gray-100 text-gray-700" };
  }
};

export function Projects() {
  const [searchTerm, setSearchTerm] = useState("");

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
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Project
        </Button>
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
                <p className="text-2xl font-semibold">8</p>
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
                <p className="text-2xl font-semibold">24</p>
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
                <p className="text-sm text-gray-600">Total Tasks</p>
                <p className="text-2xl font-semibold">172</p>
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
                <p className="text-2xl font-semibold">56%</p>
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
        {projects.map((project) => {
          const statusConfig = getStatusConfig(project.status);
          return (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
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
                    <p className="text-sm text-gray-600 mb-4">
                      {project.description}
                    </p>
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {project.start_date} - {project.end_date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>Manager: {project.manager}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ListTodo className="w-4 h-4" />
                        <span>
                          {project.tasks.completed}/{project.tasks.total} tasks
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        <span>Budget: {project.budget}</span>
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
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm font-medium text-gray-900">
                      {project.progress}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Team Avatars */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Team:</span>
                  <div className="flex -space-x-2">
                    {project.team.map((member, idx) => (
                      <Avatar key={idx} className="w-8 h-8 border-2 border-white">
                        <AvatarFallback className="text-xs bg-gray-100">
                          {member}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    + Add Member
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
