import { useEffect, useRef, useState } from "react";
import { FiArrowDown, FiChevronRight } from "react-icons/fi";
import { SideMenu, SideMenuSubmenu } from "@enderfall/ui";
import type { SortBy, SortOrder } from "../types";
import { sortPrimaryOptions, sortMoreOptions, sortOrderOptions } from "../constants";
import { IconChevronDown, getSortByIcon, getSortOrderIcon } from "../icons";

const PaneSortMenu = ({
  sortBy,
  sortOrder,
  onSortBy,
  onSortOrder,
}: {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortBy: (value: SortBy) => void;
  onSortOrder: (value: SortOrder) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  return (
    <div className={`bookmark-dropdown pane-sort-dropdown ${open ? "open" : ""}`} ref={ref}>
      <button className="bookmark-trigger" type="button" onClick={() => setOpen((prev) => !prev)}>
        <span className="bookmark-icon sort-icon"><FiArrowDown /></span>
        <span className="bookmark-text">Sort</span>
        <span className="bookmark-caret">
          <IconChevronDown />
        </span>
      </button>
      <div className="bookmark-menu">
        <SideMenu resetKey={open}>
          {sortPrimaryOptions.map((item) => (
            <button
              key={item.value}
              className={`bookmark-item ${sortBy === item.value ? "active" : ""}`}
              type="button"
              onClick={() => {
                onSortBy(item.value);
                setOpen(false);
              }}
            >
              <span className="bookmark-icon sort-icon">{getSortByIcon(item.value)}</span>
              <span className="bookmark-text">{item.label}</span>
            </button>
          ))}
          <div className="context-menu-separator" role="separator" />
        <SideMenuSubmenu
          id="pane-sort-more"
          className="bookmark-submenu"
          panelClassName="bookmark-submenu-panel"
          enableViewportFlip
          trigger={(triggerProps) => (
            <button
              className="bookmark-item is-submenu"
              type="button"
              onClick={triggerProps.onClick}
              aria-expanded={triggerProps["aria-expanded"]}
              disabled={triggerProps.disabled}
            >
              <span className="bookmark-text">More</span>
              <span className="bookmark-caret">
                <FiChevronRight />
              </span>
            </button>
          )}
        >
            {sortMoreOptions.map((item) => (
              <button
                key={item.value}
                className={`bookmark-item ${sortBy === item.value ? "active" : ""}`}
                type="button"
                onClick={() => {
                  onSortBy(item.value);
                  setOpen(false);
                }}
              >
                <span className="bookmark-icon sort-icon">{getSortByIcon(item.value)}</span>
                <span className="bookmark-text">{item.label}</span>
              </button>
            ))}
          </SideMenuSubmenu>
        <SideMenuSubmenu
          id="pane-sort-order"
          className="bookmark-submenu"
          panelClassName="bookmark-submenu-panel"
          enableViewportFlip
          trigger={(triggerProps) => (
            <button
              className="bookmark-item is-submenu"
              type="button"
              onClick={triggerProps.onClick}
              aria-expanded={triggerProps["aria-expanded"]}
              disabled={triggerProps.disabled}
            >
              <span className="bookmark-text">Order</span>
              <span className="bookmark-caret">
                <FiChevronRight />
              </span>
            </button>
          )}
        >
            {sortOrderOptions.map((item) => (
              <button
                key={item.value}
                className={`bookmark-item ${sortOrder === item.value ? "active" : ""}`}
                type="button"
                onClick={() => {
                  onSortOrder(item.value);
                  setOpen(false);
                }}
              >
                <span className="bookmark-icon sort-icon">{getSortOrderIcon(item.value)}</span>
                <span className="bookmark-text">{item.label}</span>
              </button>
            ))}
          </SideMenuSubmenu>
        </SideMenu>
      </div>
    </div>
  );
};

export default PaneSortMenu;
