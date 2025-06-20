"use client";

import { HomePage } from "@/components/pages/HomePage";
import ProtectedRoute from "@/components/ProtectedRoute";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function LibraryClient() {
  usePageTitle("Library");

  return (
    <ProtectedRoute>
      <HomePage />
    </ProtectedRoute>
  );
}
