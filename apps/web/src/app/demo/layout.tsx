import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CoverAI — Anonymous policy demo',
  description:
    'Upload a policy PDF, describe an accident and see document-grounded excerpts with simulated handoff. No login, no claim.',
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
