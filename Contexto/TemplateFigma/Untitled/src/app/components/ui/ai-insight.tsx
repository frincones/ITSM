import { Bot, Sparkles, Brain, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "./badge";

interface AIInsightProps {
  type: "classification" | "suggestion" | "analysis" | "completed";
  title: string;
  content: string;
  confidence?: number;
  model?: string;
}

export function AIInsight({ type, title, content, confidence, model = "Claude Sonnet 4" }: AIInsightProps) {
  const getTypeConfig = () => {
    switch (type) {
      case "classification":
        return {
          icon: Brain,
          bgColor: "bg-purple-50",
          borderColor: "border-purple-200",
          iconColor: "text-purple-600",
          badgeColor: "bg-purple-100 text-purple-700",
        };
      case "suggestion":
        return {
          icon: Sparkles,
          bgColor: "bg-indigo-50",
          borderColor: "border-indigo-200",
          iconColor: "text-indigo-600",
          badgeColor: "bg-indigo-100 text-indigo-700",
        };
      case "analysis":
        return {
          icon: Bot,
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          iconColor: "text-blue-600",
          badgeColor: "bg-blue-100 text-blue-700",
        };
      case "completed":
        return {
          icon: CheckCircle2,
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          iconColor: "text-green-600",
          badgeColor: "bg-green-100 text-green-700",
        };
      default:
        return {
          icon: Bot,
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          iconColor: "text-gray-600",
          badgeColor: "bg-gray-100 text-gray-700",
        };
    }
  };

  const config = getTypeConfig();
  const Icon = config.icon;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 ${config.bgColor} rounded-lg border ${config.borderColor} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${config.iconColor}`} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-medium text-gray-900">{title}</h4>
            <Badge className={`text-xs ${config.badgeColor} border-0`}>
              AI {type}
            </Badge>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
          {confidence !== undefined && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Confidence</span>
                  <span className="text-xs font-medium text-gray-900">{confidence}%</span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      confidence >= 80
                        ? "bg-green-500"
                        : confidence >= 60
                        ? "bg-yellow-500"
                        : "bg-orange-500"
                    }`}
                    style={{ width: `${confidence}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-500">{model}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIProcessingBadge({ className = "" }: { className?: string }) {
  return (
    <Badge className={`bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 gap-1 ${className}`}>
      <Sparkles className="w-3 h-3 animate-pulse" />
      AI Processing
    </Badge>
  );
}

export function AIAssistChip({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-full text-sm font-medium text-purple-700 hover:from-purple-100 hover:to-indigo-100 transition-all"
    >
      <Sparkles className="w-3.5 h-3.5" />
      Ask AI Assistant
    </button>
  );
}
