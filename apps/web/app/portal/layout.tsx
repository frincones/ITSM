import Link from 'next/link';

import {
  BookOpen,
  HeadphonesIcon,
  Home,
  MessageCircle,
  TicketIcon,
} from 'lucide-react';

const navItems = [
  { href: '/portal', label: 'Home', icon: Home },
  { href: '/portal/tickets', label: 'My Tickets', icon: TicketIcon },
  { href: '/portal/kb', label: 'Knowledge Base', icon: BookOpen },
  { href: '/portal/chat', label: 'Chat', icon: MessageCircle },
];

export const metadata = {
  title: 'Service Portal',
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <HeadphonesIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-900">
              NovaDesk Portal
            </span>
          </div>

          {/* Navigation */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile menu placeholder */}
          <div className="md:hidden">
            <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Support</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link
                    href="/portal"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link
                    href="/portal/chat"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Contact Us
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Resources</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link
                    href="/portal/kb"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Knowledge Base
                  </Link>
                </li>
                <li>
                  <Link
                    href="/portal/tickets"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Submit a Request
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Company</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link
                    href="/terms-of-service"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy-policy"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
            Powered by NovaDesk ITSM
          </div>
        </div>
      </footer>
    </div>
  );
}
