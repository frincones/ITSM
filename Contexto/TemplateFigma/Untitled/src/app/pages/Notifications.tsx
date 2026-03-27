import { Bell, Check, X, AlertTriangle, Info, CheckCircle2, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";

const notifications = [
  {
    id: 1,
    type: "ticket",
    icon: AlertTriangle,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-50",
    title: "High priority ticket assigned to you",
    description: "TKT-1247: Production server down - Database connection failing",
    time: "2 min ago",
    read: false,
  },
  {
    id: 2,
    type: "sla",
    icon: Clock,
    iconColor: "text-red-600",
    bgColor: "bg-red-50",
    title: "SLA breach warning",
    description: "Ticket TKT-1240 will breach SLA in 15 minutes",
    time: "8 min ago",
    read: false,
  },
  {
    id: 3,
    type: "approval",
    icon: CheckCircle2,
    iconColor: "text-green-600",
    bgColor: "bg-green-50",
    title: "Change request approved",
    description: "CHG-2044: Enhanced reporting dashboard deployment",
    time: "1 hour ago",
    read: false,
  },
  {
    id: 4,
    type: "comment",
    icon: Info,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-50",
    title: "New comment on your ticket",
    description: "Sarah Johnson commented on TKT-1235",
    time: "2 hours ago",
    read: true,
  },
  {
    id: 5,
    type: "ticket",
    icon: CheckCircle2,
    iconColor: "text-green-600",
    bgColor: "bg-green-50",
    title: "Ticket resolved",
    description: "TKT-1230: VPN access request has been completed",
    time: "3 hours ago",
    read: true,
  },
  {
    id: 6,
    type: "system",
    icon: Info,
    iconColor: "text-purple-600",
    bgColor: "bg-purple-50",
    title: "System maintenance scheduled",
    description: "Scheduled maintenance on Mar 30, 2026 at 2:00 AM",
    time: "5 hours ago",
    read: true,
  },
];

export function Notifications() {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Bell className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
              <p className="text-sm text-gray-500">
                {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Mark all as read
            </Button>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-indigo-600 text-white">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="sla">SLA Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <div className="space-y-3">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={`hover:shadow-md transition-all cursor-pointer ${
                  !notification.read ? "border-indigo-200 bg-indigo-50/30" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 ${notification.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
                    >
                      <notification.icon className={`w-5 h-5 ${notification.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-medium text-gray-900">{notification.title}</h3>
                        {!notification.read && (
                          <Badge className="bg-indigo-600 text-white text-xs flex-shrink-0">
                            New
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{notification.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{notification.time}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="unread">
          <div className="space-y-3">
            {notifications
              .filter((n) => !n.read)
              .map((notification) => (
                <Card
                  key={notification.id}
                  className="hover:shadow-md transition-all cursor-pointer border-indigo-200 bg-indigo-50/30"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 ${notification.bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}
                      >
                        <notification.icon className={`w-5 h-5 ${notification.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">{notification.title}</h3>
                          <Badge className="bg-indigo-600 text-white text-xs flex-shrink-0">
                            New
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{notification.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{notification.time}</span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="tickets">
          <div className="text-center py-12">
            <p className="text-gray-500">Filter by ticket notifications</p>
          </div>
        </TabsContent>

        <TabsContent value="changes">
          <div className="text-center py-12">
            <p className="text-gray-500">Filter by change notifications</p>
          </div>
        </TabsContent>

        <TabsContent value="sla">
          <div className="text-center py-12">
            <p className="text-gray-500">Filter by SLA alerts</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
