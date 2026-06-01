/**
 * Buyer dashboard layout with navigation
 */

import {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Buyer Dashboard | KisanDirect',
  description: 'Manage orders, cart, subscriptions and more',
};

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
