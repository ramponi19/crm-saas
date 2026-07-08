import {
  LayoutDashboard, BarChart3, ScanBarcode, Calculator, ReceiptText, Target,
  Smartphone, Boxes, BookOpen, Users, ShieldCheck, Wrench, ShoppingCart,
  Wallet, UserCog, Settings, Building2, CreditCard, Home, KeyRound, Calendar, CheckSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Mapa nome-do-ícone → componente lucide, compartilhado por sidebar e bottom-nav. */
export const MENU_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, BarChart3, ScanBarcode, Calculator, ReceiptText, Target,
  Smartphone, Boxes, BookOpen, Users, ShieldCheck, Wrench, ShoppingCart,
  Wallet, UserCog, Settings, Building2, CreditCard, Home, KeyRound, Calendar, CheckSquare,
}
