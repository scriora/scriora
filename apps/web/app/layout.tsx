// scriora-web — Root Layout
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_SPECIFICATIONS.md
// INVARIANT: No business logic here — UI rendering only
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scriora',
  description: 'The Growth Operating System for Content Teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
