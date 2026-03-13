import React, { useState, useEffect } from 'react';
import { Users, LogOut, Search, ShieldAlert, RefreshCw } from 'lucide-react';

interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  trial_started_at: string;
  subscription_ends_at: string;
  total_spent: number;
  referral_count: number;
  connection_limit: number;
}

export default function App() {
  const [password, setPassword] = useState(localStorage.getItem('admin_password') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('admin_password'));
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchUsers = async (pass: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${pass}`
        }
      });
      
      const contentType = res.headers.get("content-type");
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Неверный пароль');
        }
        if (contentType && contentType.includes("text/html")) {
          throw new Error('Ошибка: Сервер вернул HTML вместо JSON. Возможно, неверно настроен порт или прокси.');
        }
        throw new Error(`Ошибка сервера: ${res.status}`);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error('Ошибка: Сервер вернул некорректный формат данных (не JSON)');
      }

      const data = await res.json();
      setUsers(data);
      setIsAuthenticated(true);
      localStorage.setItem('admin_password', pass);
    } catch (err: any) {
      setError(err.message);
      setIsAuthenticated(false);
      localStorage.removeItem('admin_password');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers(password);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(password);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    setUsers([]);
    localStorage.removeItem('admin_password');
  };

  const getDaysLeft = (endsAt: string) => {
    const end = new Date(endsAt).getTime();
    const now = new Date().getTime();
    const diff = end - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
              <ShieldAlert size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">ДзенVPN Админ</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пароль доступа</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="Введите пароль..."
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-70"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.telegram_id.toString().includes(search) || 
    (u.username && u.username.toLowerCase().includes(search.toLowerCase()))
  );

  const totalRevenue = users.reduce((acc, u) => acc + (u.total_spent || 0), 0);
  const activeUsers = users.filter(u => getDaysLeft(u.subscription_ends_at) > 0).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="text-indigo-600" />
              Панель управления
            </h1>
            <p className="text-gray-500 text-sm mt-1">Управление пользователями ДзенVPN</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button 
              onClick={() => fetchUsers(password)}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
              title="Обновить"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-medium"
            >
              <LogOut size={18} />
              Выйти
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-500">Всего пользователей</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{users.length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-500">Активных подписок</p>
            <p className="text-3xl font-bold text-emerald-600 mt-2">{activeUsers}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-500">Общая выручка</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">{totalRevenue} ₽</p>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-800">Список пользователей</h2>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Поиск по ID или юзернейму..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                  <th className="p-4 font-medium">Telegram ID</th>
                  <th className="p-4 font-medium">Username</th>
                  <th className="p-4 font-medium">Осталось дней</th>
                  <th className="p-4 font-medium">Пригласил</th>
                  <th className="p-4 font-medium">Оплатил (₽)</th>
                  <th className="p-4 font-medium">Лимит устр.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Пользователи не найдены
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const daysLeft = getDaysLeft(u.subscription_ends_at);
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-sm font-mono text-gray-600">{u.telegram_id}</td>
                        <td className="p-4 text-sm text-gray-900">
                          {u.username ? `@${u.username}` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${daysLeft > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {daysLeft} дн.
                          </span>
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          <span className="font-medium text-indigo-600">{u.referral_count || 0}</span> чел.
                        </td>
                        <td className="p-4 text-sm font-medium text-gray-900">
                          {u.total_spent || 0}
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {u.connection_limit}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
