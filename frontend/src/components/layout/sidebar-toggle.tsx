"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "./init-scripts";

/**
 * Collapse / expand the desktop sidebar (evondevKit shell.md "Thu gọn sidebar"): ghost size-10 rounded-xl at the
 * start of the top bar, PanelLeftClose when open, PanelLeftOpen when collapsed. State = data-sidebar on <html>
 * (CSS variant `sidebar-collapsed:`), remembered per browser.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar"] });
  return () => observer.disconnect();
}
const isCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

export function SidebarToggle({ labels }: { labels: { collapse: string; expand: string } }) {
  // Reads the <html> attribute (set before hydration by the inline script); the server renders "expanded".
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);

  const toggle = () => {
    const next = !collapsed;
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Storage unavailable (private mode): the choice simply is not remembered.
    }
  };

  const label = collapsed ? labels.expand : labels.collapse;
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
      data-testid="sidebar-toggle"
      className="hidden size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-ivory-100/70 outline-hidden transition-colors hover:bg-ivory-100/5 hover:text-ivory-100 lg:grid"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
