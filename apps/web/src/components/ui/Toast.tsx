import React, { useEffect } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

export interface ToastItemProps {
  notification: NotificationItem;
  onDismiss: (id: string) => void;
}

export const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss }) => {
  const { id, message, type, duration = 4000 } = notification;

  useEffect(() => {
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const getTypeStyles = (toastType: NotificationType) => {
    switch (toastType) {
      case 'error':
        return {
          backgroundColor: 'rgba(248, 81, 73, 0.15)',
          borderColor: 'var(--error, #f85149)',
          color: '#f85149',
          icon: '❌',
        };
      case 'success':
        return {
          backgroundColor: 'rgba(63, 185, 80, 0.15)',
          borderColor: 'var(--success, #3fb950)',
          color: '#3fb950',
          icon: '✅',
        };
      case 'warning':
        return {
          backgroundColor: 'rgba(210, 153, 34, 0.15)',
          borderColor: 'var(--warning, #d29922)',
          color: '#d29922',
          icon: '⚠️',
        };
      case 'info':
      default:
        return {
          backgroundColor: 'rgba(88, 166, 255, 0.15)',
          borderColor: 'var(--info, #58a6ff)',
          color: '#58a6ff',
          icon: 'ℹ️',
        };
    }
  };

  const styleConfig = getTypeStyles(type);

  return (
    <div
      role="alert"
      data-testid={`toast-${id}`}
      data-toast-type={type}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md, 6px)',
        backgroundColor: styleConfig.backgroundColor,
        border: `1px solid ${styleConfig.borderColor}`,
        color: 'var(--text-primary, #e6edf3)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        minWidth: '280px',
        maxWidth: '420px',
        fontSize: '13px',
        lineHeight: '1.4',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <span style={{ fontSize: '14px', userSelect: 'none' }} aria-hidden="true">
          {styleConfig.icon}
        </span>
        <span style={{ wordBreak: 'break-word' }}>{message}</span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted, #778291)',
          cursor: 'pointer',
          fontSize: '14px',
          padding: '2px 6px',
          borderRadius: 'var(--radius-xs, 2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary, #e6edf3)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted, #778291)')}
      >
        ✕
      </button>
    </div>
  );
};

export interface ToastContainerProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {notifications.map((notification) => (
        <div key={notification.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem notification={notification} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};
