import React from "react";
import s from "./SessionSidebarItem.module.css";

export type SessionSidebarItemProps = {
  sessionKey: string;
  title: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (key: string) => void;
};

function IconMoreHorizontal({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="3" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="13" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v4M8 7v4M10 7v4M4 4l.5 8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4" />
    </svg>
  );
}

function ConfirmDeleteDialog(props: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props.onCancel]);

  return (
    <div
      className="UiModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Delete session"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          props.onCancel();
        }
      }}
    >
      <div className={s.ConfirmDialog}>
        <p className={s.ConfirmDialog__text}>Delete session &ldquo;{props.title}&rdquo;?</p>
        <p className={s.ConfirmDialog__sub}>This will remove the session from history.</p>
        <div className={s.ConfirmDialog__actions}>
          <button type="button" className={s.ConfirmDialog__cancel} onClick={props.onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={s.ConfirmDialog__confirm}
            onClick={props.onConfirm}
            autoFocus
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export const SessionSidebarItem = React.memo(function SessionSidebarItem({
  sessionKey,
  title,
  isActive,
  onSelect,
  onDelete,
}: SessionSidebarItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const menuTriggerRef = React.useRef<HTMLSpanElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const handleMenuClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen((prev) => !prev);
  }, []);

  const handleMenuKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen((prev) => !prev);
    }
  }, []);

  const handleDeleteClick = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    setConfirmOpen(false);
    onDelete(sessionKey);
    document.dispatchEvent(new Event("refocus-chat-input"));
  }, [sessionKey, onDelete]);

  const handleCancelDelete = React.useCallback(() => {
    setConfirmOpen(false);
    document.dispatchEvent(new Event("refocus-chat-input"));
  }, []);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      const trigger = menuTriggerRef.current;
      const popover = popoverRef.current;
      if (
        trigger &&
        popover &&
        !trigger.contains(e.target as Node) &&
        !popover.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <>
      <li
        className={`${s.SessionSidebarItem}${menuOpen ? ` ${s["SessionSidebarItem--menuOpen"]}` : ""}`}
      >
        <button
          type="button"
          className={`${s.SessionSidebarItem__title}${isActive ? ` ${s["SessionSidebarItem__title--active-true"]}` : ""}`}
          onClick={onSelect}
          title={sessionKey}
        >
          <span className={s.SessionSidebarItem__titleText}>{title}</span>
          {isActive && (
            <span
              className={s.SessionSidebarItem__activeSpinner}
              aria-hidden="true"
              title="Active session"
            />
          )}
          <div className={s.SessionSidebarItem__actions}>
            <span
              ref={menuTriggerRef}
              className={s.SessionSidebarItem__menuTrigger}
              role="button"
              tabIndex={0}
              onClick={handleMenuClick}
              onKeyDown={handleMenuKeyDown}
              aria-label="Session options"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <IconMoreHorizontal />
            </span>
            {menuOpen && (
              <div ref={popoverRef} className="UiPopover" role="menu">
                <button
                  type="button"
                  className={s.SessionSidebarItem__popoverItem}
                  role="menuitem"
                  onClick={handleDeleteClick}
                >
                  <IconTrash className={s.SessionSidebarItem__popoverIcon} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </button>
      </li>
      {confirmOpen && (
        <ConfirmDeleteDialog
          title={title}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </>
  );
});
