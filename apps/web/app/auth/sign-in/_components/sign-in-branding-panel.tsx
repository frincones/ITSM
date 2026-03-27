import { CheckCircle2 } from 'lucide-react';

const features = [
  {
    title: 'Unified Workspace',
    description: 'Manage tickets, assets, and knowledge from one place',
  },
  {
    title: 'Automation First',
    description: 'Reduce manual work with intelligent automation',
  },
  {
    title: 'Enterprise Ready',
    description: 'Security, compliance, and scalability built-in',
  },
];

export function SignInBrandingPanel() {
  return (
    <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 p-12 lg:flex lg:w-1/2">
      <div>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white">
            <svg
              className="h-7 w-7 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
              />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white">NovaDesk ITSM</span>
        </div>
        <h1 className="mb-4 text-4xl font-bold text-white">
          Modern IT Service Management
        </h1>
        <p className="text-xl text-indigo-100">
          Streamline your IT operations with our enterprise-ready platform
        </p>
      </div>

      <div className="space-y-6">
        {features.map((feature) => (
          <div key={feature.title} className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm text-indigo-100">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
