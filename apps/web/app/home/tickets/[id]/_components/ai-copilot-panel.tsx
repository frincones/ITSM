'use client';

import { useState, useEffect, useCallback } from 'react';

import {
  Bot, Sparkles, RefreshCw, Copy, Check, Loader2,
  AlertTriangle, CheckCircle, ArrowRight, Zap,
  BookOpen, Ticket, MessageSquare, FileText, TrendingUp,
  Frown, Meh, Smile, Flame,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { ScrollArea } from '@kit/ui/scroll-area';

interface AiCopilotPanelProps {
  ticketId: string;
  ticketTitle: string;
  ticketStatus: string;
  ticketType: string;
}

interface CopilotAnalysis {
  summary?: string;
  classification?: { type: string; urgency: string; category_suggestion: string; confidence: number };
  sentiment?: string;
  sentiment_reason?: string;
  suggested_reply?: string;
  internal_note?: string;
  root_cause?: string | null;
  next_action?: string;
  escalation_risk?: boolean;
  escalation_reason?: string | null;
  kbArticles?: Array<{ id: string; title: string; slug: string; preview: string }>;
  similarTickets?: Array<{ ticket_number: string; title: string; solution: string }>;
}

const SENTIMENT_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  positive: { icon: Smile, label: 'Positivo', color: 'text-green-600 bg-green-50' },
  neutral: { icon: Meh, label: 'Neutral', color: 'text-gray-600 bg-gray-50' },
  negative: { icon: Frown, label: 'Negativo', color: 'text-orange-600 bg-orange-50' },
  frustrated: { icon: Flame, label: 'Frustrado', color: 'text-red-600 bg-red-50' },
};

export function AiCopilotPanel({ ticketId, ticketTitle, ticketStatus, ticketType }: AiCopilotPanelProps) {
  const [analysis, setAnalysis] = useState<CopilotAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftReply, setDraftReply] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  const fetchDraftReply = async () => {
    setDraftLoading(true);
    try {
      const res = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, action: 'draft_reply' }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraftReply(data.draftReply ?? '');
      }
    } catch { /* silent */ }
    setDraftLoading(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const sentimentCfg = SENTIMENT_CONFIG[analysis?.sentiment ?? 'neutral'] ?? SENTIMENT_CONFIG.neutral!;
  const SentimentIcon = sentimentCfg.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
            <Sparkles className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-semibold">AI Copilot</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchAnalysis} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">

          {loading && !analysis ? (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-indigo-500" />
              <p className="text-xs text-muted-foreground">Analizando ticket...</p>
            </div>
          ) : analysis ? (
            <>
              {/* ── Next Best Action ── */}
              {analysis.next_action && (
                <Card className="border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30">
                  <CardContent className="flex items-start gap-2 p-2.5">
                    <Zap className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-600" />
                    <div>
                      <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">Siguiente Acción</p>
                      <p className="text-[11px] text-indigo-900 dark:text-indigo-200">{analysis.next_action}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Summary ── */}
              {analysis.summary && (
                <Section icon={FileText} title="Resumen">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{analysis.summary}</p>
                </Section>
              )}

              {/* ── Classification ── */}
              {analysis.classification && (
                <Section icon={TrendingUp} title="Clasificación AI">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{analysis.classification.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{analysis.classification.urgency}</Badge>
                    <Badge variant="outline" className="text-[10px]">{analysis.classification.category_suggestion}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{analysis.classification.confidence}%</Badge>
                  </div>
                </Section>
              )}

              {/* ── Sentiment ── */}
              {analysis.sentiment && (
                <Section icon={SentimentIcon} title="Sentimiento">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${sentimentCfg.color}`}>{sentimentCfg.label}</Badge>
                    {analysis.sentiment_reason && (
                      <span className="text-[10px] text-muted-foreground">{analysis.sentiment_reason}</span>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Escalation Alert ── */}
              {analysis.escalation_risk && (
                <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30">
                  <CardContent className="flex items-start gap-2 p-2.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                    <div>
                      <p className="text-[10px] font-semibold text-red-700">Riesgo de Escalación</p>
                      <p className="text-[10px] text-red-600">{analysis.escalation_reason}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Root Cause ── */}
              {analysis.root_cause && (
                <Section icon={AlertTriangle} title="Causa Raíz Probable">
                  <p className="text-[11px] text-muted-foreground">{analysis.root_cause}</p>
                </Section>
              )}

              {/* ── Suggested Reply ── */}
              <Section icon={MessageSquare} title="Respuesta Sugerida">
                {analysis.suggested_reply ? (
                  <div className="space-y-1.5">
                    <p className="rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed">{analysis.suggested_reply}</p>
                    <Button
                      variant="ghost" size="sm"
                      className="h-6 gap-1 text-[10px]"
                      onClick={() => copyToClipboard(analysis.suggested_reply!, 'reply')}
                    >
                      {copiedField === 'reply' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      {copiedField === 'reply' ? 'Copiado' : 'Copiar al composer'}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[10px]" onClick={fetchDraftReply} disabled={draftLoading}>
                    {draftLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generar borrador de respuesta
                  </Button>
                )}
                {draftReply && (
                  <div className="mt-1.5 space-y-1.5">
                    <p className="rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed">{draftReply}</p>
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]"
                      onClick={() => copyToClipboard(draftReply, 'draft')}>
                      {copiedField === 'draft' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      {copiedField === 'draft' ? 'Copiado' : 'Copiar'}
                    </Button>
                  </div>
                )}
              </Section>

              {/* ── Internal Note ── */}
              {analysis.internal_note && (
                <Section icon={FileText} title="Nota Interna Sugerida">
                  <p className="rounded-md bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    {analysis.internal_note}
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]"
                    onClick={() => copyToClipboard(analysis.internal_note!, 'note')}>
                    {copiedField === 'note' ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copiedField === 'note' ? 'Copiado' : 'Copiar nota'}
                  </Button>
                </Section>
              )}

              {/* ── KB Articles ── */}
              {analysis.kbArticles && analysis.kbArticles.length > 0 && (
                <Section icon={BookOpen} title={`Artículos KB (${analysis.kbArticles.length})`}>
                  <div className="space-y-1.5">
                    {analysis.kbArticles.map((a) => (
                      <div key={a.id} className="rounded-md border p-2">
                        <p className="text-[11px] font-medium">{a.title}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{a.preview.slice(0, 100)}...</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── Similar Tickets ── */}
              {analysis.similarTickets && analysis.similarTickets.length > 0 && (
                <Section icon={Ticket} title={`Tickets Similares (${analysis.similarTickets.length})`}>
                  <div className="space-y-1.5">
                    {analysis.similarTickets.map((t) => (
                      <div key={t.ticket_number} className="rounded-md border p-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px]">{t.ticket_number}</Badge>
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        </div>
                        <p className="mt-0.5 text-[10px]">{t.title.slice(0, 80)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Solución: {t.solution.slice(0, 100)}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <div className="py-8 text-center">
              <Bot className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No se pudo analizar el ticket</p>
              <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={fetchAnalysis}>Reintentar</Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ── Section wrapper ── */
function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
