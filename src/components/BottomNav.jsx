import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Receipt, TrendingUp, ShoppingBag, ShoppingCart, Search, Anchor } from 'lucide-react';

const links = [
  { to: '/', label: 'Home', Icon: LayoutDashboard },
  { to: '/bills', label: 'Bills', Icon: Receipt },
  { to: '/purchases', label: 'Spend', Icon: ShoppingBag },
  { to: '/income', label: 'Income', Icon: TrendingUp },
  { to: '/lists', label: 'Lists', Icon: ShoppingCart },
  // Anchor rather than a life-ring or a heartbeat: this should read as
  // "steady", not as an emergency or a medical device.
  { to: '/crash', label: 'Crash', Icon: Anchor },
  { to: '/search', label: 'Search', Icon: Search },
];

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{ backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border)' }}
    >
      <div
        className="flex max-w-2xl mx-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
            {({ isActive }) => (
              <div className="flex flex-col items-center justify-center h-16 gap-1">
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  style={{ color: isActive ? 'var(--accent-text)' : 'var(--subtle)' }}
                />
                <span
                  className="text-[9px] font-semibold leading-none tracking-tight"
                  style={{ color: isActive ? 'var(--accent-text)' : 'var(--subtle)' }}
                >
                  {label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
