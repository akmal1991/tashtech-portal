import {
  LayoutDashboard, Users, BookOpenCheck, CheckSquare, History, Upload, Download, FileBarChart, Bell, Settings, Shield, UserCog,
  Building2, Calculator, ListPlus, Blocks, FileText, BookOpen, Link as LinkIcon, Calendar, ClipboardList, Award, Megaphone, HelpCircle, Layers, Briefcase,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, BookOpenCheck, CheckSquare, History, Upload, Download, FileBarChart, Bell, Settings, Shield, UserCog,
  Building2, Calculator, ListPlus, Blocks, FileText, BookOpen, Link: LinkIcon, Calendar, ClipboardList, Award, Megaphone, HelpCircle, Layers, Briefcase,
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const C = ICON_MAP[name] ?? FileText;
  return <C size={size} className={className} />;
}
