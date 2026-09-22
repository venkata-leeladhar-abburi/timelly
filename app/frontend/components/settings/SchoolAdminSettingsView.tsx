"use client";

import { useEffect, useState } from "react";
import { CommonSettingsProps } from "./portalSettingsTypes";
import { SchoolAdminAccountCard } from "./shared/SchoolAdminAccountCard";
import { SchoolEmailDomainCard } from "./shared/SchoolEmailDomainCard";
import { SchoolHyperPGCredentialsCard } from "./shared/SchoolHyperPGCredentialsCard";
import { SchoolAdminPasswordCard } from "./shared/SchoolAdminPasswordCard";
import {
  SchoolAdminNotificationsCard,
  type SchoolAdminNotification,
} from "./shared/SchoolAdminNotificationsCard";

export default function SchoolAdminSettingsView({
  form,
  setForm,
  passwords,
  setPasswords,
  fileInputRef,
  handleUploadAvatar,
  uploading,
}: CommonSettingsProps) {
  const [notifications, setNotifications] = useState<SchoolAdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setLoadingNotifications(true);
        const res = await fetch("/api/notifications?take=10", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      } finally {
        setLoadingNotifications(false);
      }
    };
    loadNotifications();
  }, []);

  const markOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <SchoolAdminAccountCard
        form={form}
        setForm={setForm}
        fileInputRef={fileInputRef}
        handleUploadAvatar={handleUploadAvatar}
        uploading={uploading}
      />
      <SchoolEmailDomainCard />
      <SchoolHyperPGCredentialsCard />
      <SchoolAdminPasswordCard passwords={passwords} setPasswords={setPasswords} />
      <SchoolAdminNotificationsCard
        notifications={notifications}
        unreadCount={unreadCount}
        loading={loadingNotifications}
        onMarkRead={markOneRead}
        formatTime={formatTime}
      />
    </div>
  );
}
