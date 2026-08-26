import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { authOptions } from "@/auth";
import NotificationBell from "./NotificationBell";
import { HomeIcon, UsersIcon, UserGroupIcon, ArchiveBoxIcon, ChartBarIcon, ShoppingCartIcon, BanknotesIcon } from '@heroicons/react/24/outline';

const prisma = new PrismaClient();

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.image) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.image as string },
  });

  if (!user) {
    redirect("/");
  }

  const allowedRoles = ["ADMIN", "OWNER", "ACCOUNTANT"];
  if (!allowedRoles.includes(user.role)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans" dir="rtl">
      <nav className="bg-slate-900 text-white px-3 py-3 sm:p-4 shadow-xl mb-4 sm:mb-8 sticky top-0 z-50 backdrop-blur-md bg-slate-900/95 border-b border-slate-800">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 md:gap-4">
          
          <div className="text-lg sm:text-xl font-bold flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">🛡️</span>
            <div>
                <span className="block leading-none truncate">لوحة التحكم</span>
                <span className="text-[9px] sm:text-[10px] font-normal text-slate-400 block truncate">
                  مرحباً بك، {user.name} | صلاحيتك: {user.role}
                </span>
            </div>
          </div>

          <div className="flex w-full md:w-auto overflow-x-auto justify-start md:justify-center gap-1.5 text-sm font-bold items-center bg-slate-800/50 p-1.5 rounded-2xl overscroll-contain">
            <Link href="/admin" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <HomeIcon className="w-5 h-5" /> <span className="hidden lg:inline">الرئيسية</span>
            </Link>
            
            {user.role !== 'ACCOUNTANT' && (
              <Link href="/admin/users" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
                <UsersIcon className="w-5 h-5" /> <span className="hidden lg:inline">الموظفين</span>
              </Link>
            )}
            
            <Link href="/admin/customers" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5" /> <span className="hidden lg:inline">العملاء</span>
            </Link>
            
            <Link href="/admin/products" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <ArchiveBoxIcon className="w-5 h-5" /> <span className="hidden lg:inline">الأصناف</span>
            </Link>
            
            <Link href="/admin/reports" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5" /> <span className="hidden lg:inline">التقارير</span>
            </Link>

            {user.role !== 'EMPLOYEE' && (
              <Link href="/admin/cash-management" className="px-3 py-2 rounded-xl hover:bg-slate-700 hover:text-yellow-400 transition-colors flex items-center gap-2">
                <BanknotesIcon className="w-5 h-5" /> <span className="hidden lg:inline">إدارة النقدية</span>
              </Link>
            )}

            <div className="w-px h-6 bg-slate-700 mx-1"></div>

            <NotificationBell isDark={true} />

            <Link href="/" className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20 active:scale-95 whitespace-nowrap">
              <ShoppingCartIcon className="w-5 h-5" />
              <span className="hidden sm:inline">تطبيق البيع</span>
            </Link>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto px-3 sm:p-4 pb-20 animate-in fade-in duration-500">
        {children}
      </main>
    </div>
  );
}
