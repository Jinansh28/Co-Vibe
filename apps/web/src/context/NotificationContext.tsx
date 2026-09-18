import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastContainer, NotificationItem, NotificationType } from '../components/ui/Toast.js';

export type { NotificationItem, NotificationType };

export interface NotificationContextType {
  notifications: NotificationItem[];
  showNotification: (message: string, type?: NotificationType, duration?: number) => string;
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showNotification = useCallback(
    (message: string, type: NotificationType = 'info', duration: number = 4000): string => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newNotification: NotificationItem = {
        id,
        message,
        type,
        duration,
      };

      setNotifications((prev) => [...prev, newNotification]);
      return id;
    },
    []
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        showNotification,
        dismissNotification,
        clearAllNotifications,
      }}
    >
      {children}
      <ToastContainer
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
