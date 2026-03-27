import { useState } from "react";
import { Mail, MessageSquare, Phone, Send, Search, Filter, Clock, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { AIInsight, AIProcessingBadge } from "../components/ui/ai-insight";

const conversations = [
  {
    id: 1,
    channel: "email",
    subject: "Unable to access VPN - Urgent",
    contact: {
      name: "Sarah Johnson",
      email: "sarah.j@techcorp.com",
      avatar: "SJ",
    },
    lastMessage: "I've tried resetting my password but still can't connect...",
    lastMessageAt: "2 min ago",
    status: "open",
    unread: true,
    sentiment: "frustrated",
    aiClassified: true,
    priority: "high",
  },
  {
    id: 2,
    channel: "whatsapp",
    subject: "Software License Request",
    contact: {
      name: "Mike Chen",
      email: "+1 555-0123",
      avatar: "MC",
    },
    lastMessage: "Thanks for the update! When can I expect the license key?",
    lastMessageAt: "15 min ago",
    status: "pending",
    unread: false,
    sentiment: "neutral",
    aiClassified: true,
    priority: "medium",
  },
  {
    id: 3,
    channel: "widget",
    subject: "Payment processing error",
    contact: {
      name: "Emma Davis",
      email: "emma.davis@startup.io",
      avatar: "ED",
    },
    lastMessage: "Getting error code 502 when trying to complete checkout",
    lastMessageAt: "1 hour ago",
    status: "open",
    unread: true,
    sentiment: "concerned",
    aiClassified: true,
    priority: "high",
  },
  {
    id: 4,
    channel: "email",
    subject: "Re: Database backup configuration",
    contact: {
      name: "Alex Turner",
      email: "alex.turner@devops.com",
      avatar: "AT",
    },
    lastMessage: "Perfect, the automated backups are working now. Thank you!",
    lastMessageAt: "3 hours ago",
    status: "resolved",
    unread: false,
    sentiment: "satisfied",
    aiClassified: true,
    priority: "low",
  },
];

const messages = [
  {
    id: 1,
    sender: "contact",
    name: "Sarah Johnson",
    content: "Hi, I'm having trouble accessing the VPN. I've tried connecting multiple times but keep getting authentication errors.",
    timestamp: "10:42 AM",
    attachments: ["screenshot-vpn-error.png"],
  },
  {
    id: 2,
    sender: "ai",
    name: "AI Assistant",
    content: "I've analyzed this issue. This appears to be related to recent password policy changes. I'm creating a ticket and collecting diagnostic information.",
    timestamp: "10:43 AM",
    isAI: true,
  },
  {
    id: 3,
    sender: "contact",
    name: "Sarah Johnson",
    content: "I've tried resetting my password but still can't connect to the VPN. This is urgent as I need to access the customer database.",
    timestamp: "10:45 AM",
  },
  {
    id: 4,
    sender: "agent",
    name: "You",
    content: "Hi Sarah, I see the AI has already created a priority ticket for this. Let me check your VPN credentials and account status.",
    timestamp: "10:47 AM",
  },
];

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case "email":
      return Mail;
    case "whatsapp":
      return MessageSquare;
    case "widget":
      return MessageSquare;
    case "phone":
      return Phone;
    default:
      return MessageSquare;
  }
};

const getChannelColor = (channel: string) => {
  switch (channel) {
    case "email":
      return "bg-blue-100 text-blue-700";
    case "whatsapp":
      return "bg-green-100 text-green-700";
    case "widget":
      return "bg-purple-100 text-purple-700";
    case "phone":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case "frustrated":
      return "text-red-600";
    case "concerned":
      return "text-orange-600";
    case "neutral":
      return "text-gray-600";
    case "satisfied":
      return "text-green-600";
    default:
      return "text-gray-600";
  }
};

export function Inbox() {
  const [selectedConversation, setSelectedConversation] = useState(conversations[0]);

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Conversations List */}
      <div className="w-96 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Omnichannel Inbox</h2>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              className="pl-10 bg-gray-50"
            />
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="mine">Mine</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => {
            const ChannelIcon = getChannelIcon(conv.channel);
            const isSelected = selectedConversation.id === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${
                  isSelected ? "bg-indigo-50 border-l-4 border-l-indigo-600" : ""
                } ${conv.unread ? "bg-blue-50/50" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="text-sm bg-gray-100">
                      {conv.contact.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-sm text-gray-900 truncate">
                        {conv.contact.name}
                      </h4>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                        {conv.lastMessageAt}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-1 truncate">
                      {conv.subject}
                    </p>
                    <p className="text-xs text-gray-600 mb-2 line-clamp-1">
                      {conv.lastMessage}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-xs ${getChannelColor(conv.channel)}`}>
                        <ChannelIcon className="w-3 h-3 mr-1" />
                        {conv.channel}
                      </Badge>
                      {conv.aiClassified && (
                        <Badge className="text-xs bg-purple-100 text-purple-700">
                          AI
                        </Badge>
                      )}
                      {conv.unread && (
                        <Badge className="text-xs bg-indigo-600 text-white">
                          New
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversation Detail */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-gray-100">
                  {selectedConversation.contact.avatar}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedConversation.contact.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {selectedConversation.contact.email}
                  </span>
                  <span className={`text-xs ${getSentimentColor(selectedConversation.sentiment)}`}>
                    • {selectedConversation.sentiment}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Create Ticket
              </Button>
              <Button variant="default" size="sm">
                Resolve
              </Button>
            </div>
          </div>
        </div>

        {/* AI Insights Panel */}
        <div className="bg-white border-b border-gray-200 p-4">
          <AIInsight
            type="classification"
            title="AI Auto-Classification"
            content="Classified as: Incident - High Priority. Suggested category: Network Access. Recommended assignment: Network Support Team."
            confidence={92}
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl ${
                  msg.sender === "agent"
                    ? "bg-indigo-600 text-white"
                    : msg.isAI
                    ? "bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200"
                    : "bg-white border border-gray-200"
                } rounded-lg p-4 shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-sm font-medium ${
                      msg.sender === "agent"
                        ? "text-white"
                        : msg.isAI
                        ? "text-purple-700"
                        : "text-gray-900"
                    }`}
                  >
                    {msg.name}
                  </span>
                  {msg.isAI && <AIProcessingBadge />}
                  <span
                    className={`text-xs ml-auto ${
                      msg.sender === "agent" ? "text-indigo-200" : "text-gray-500"
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
                <p
                  className={`text-sm ${
                    msg.sender === "agent"
                      ? "text-white"
                      : msg.isAI
                      ? "text-gray-700"
                      : "text-gray-700"
                  }`}
                >
                  {msg.content}
                </p>
                {msg.attachments && (
                  <div className="mt-2 flex gap-2">
                    {msg.attachments.map((att, idx) => (
                      <Badge key={idx} className="text-xs bg-gray-100 text-gray-700">
                        📎 {att}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Reply Box */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                placeholder="Type your message..."
              />
            </div>
            <Button className="h-10">
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
