import { NavLink } from 'react-router-dom';
import type { NavItem } from '../app/navigation';

/**
 * A row of links where the active one is marked by the router, not by us.
 *
 * `NavLink` compares against the real location on every render, which is the
 * whole reason the hand-rolled navigation is gone: it had no notion of an
 * active item at all, so nothing in the interface said where you were.
 */
export function SectionNav({ ariaLabel, items, className }: { ariaLabel: string; items: readonly NavItem[]; className: string }) {
  return (
    <nav className={className} aria-label={ariaLabel}>
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
