import {
  Archive,
  Download,
  Inbox,
  Layers,
  PackageCheck,
  LayoutDashboard,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ScreenKey } from "@/server/permissions/registry";

/** One icon per screen, shared by the side menu and the page headers. */
export const SCREEN_ICONS: Record<ScreenKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  catalog: Layers,
  receiving: Download,
  vendor: Inbox,
  shipping: PackageCheck,
  inventory: Archive,
  settings: SlidersHorizontal,
  admin: Users,
};
