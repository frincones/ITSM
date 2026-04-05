'use client';

import { useState } from 'react';

import { Topbar } from './topbar';
import { AIAssistantSidebar } from './ai-assistant-sidebar';

interface HomeLayoutClientProps {
  children: React.ReactNode;
}

export function HomeLayoutClient({ children }: HomeLayoutClientProps) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top Bar */}
      <Topbar aiOpen={aiOpen} onToggleAi={() => setAiOpen((prev) => !prev)} />

      {/* Content + AI Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content — shrinks when sidebar is open */}
        <main className="flex-1 overflow-auto transition-all duration-200">
          {children}
        </main>

        {/* AI Sidebar — inline, pushes content */}
        {aiOpen && (
          <aside className="flex w-[380px] flex-shrink-0 flex-col border-l border-border bg-card">
            <AIAssistantSidebar open={aiOpen} onClose={() => setAiOpen(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}
