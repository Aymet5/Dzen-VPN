import React, { useState, useEffect } from "react";
import { 
  Users, 
  CreditCard, 
  Settings, 
  Search, 
  Calendar, 
  Shield, 
  ShieldOff, 
  Plus, 
  Save, 
  Trash2, 
  Send, 
  Ticket,
  RefreshCw,
  Clock,
  LogOut
} from "lucide-react";

interface User {
  telegram_id: number;
  username: string | null;
  subscription_ends_at: string;
  is_blocked: number;
  connection_limit: number;
  created_at: string;
}

interface Payment {
  id: string;
  telegram_id: number;
  username: string | null;
  plan_id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  months: number;
  price: number;
  description: string;
  connection_limit: number;
}

interface PromoCode {
  code: string;
  days: number;
  max_uses: number;
  current_uses: number;
  created_at: string;
}

const App: React.FC = () => {
  const [password, setPassword] = useState(localStorage.getItem("admin_password") || "");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "payments" | "plans" | "broadcast" | "promos">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [newPromo, setNewPromo] = useState({ code: "", days: 30, max_uses: 100 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer Solbon5796+-` };
      const [usersRes, paymentsRes, plansRes, promosRes] = await Promise.all([
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/payments", { headers }),
        fetch("/api/admin/plans", { headers }),
        fetch("/api/admin/promos", { headers })
      ]);

      if (usersRes.ok && paymentsRes.ok && plansRes.ok && promosRes.ok) {
        setUsers(await usersRes.json());
        setPayments(await paymentsRes.json());
        setPlans(await plansRes.json());
        setPromos(await promosRes.json());
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) fetchData();
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("admin_password", password);
    fetchData();
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_password");
    setPassword("");
    setIsLoggedIn(false);
  };

  const handleBlockUser = async (tgId: number, blocked: boolean) => {
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    await fetch("/api/admin/users/block", {
      method: "POST",
      headers,
      body: JSON.stringify({ telegram_id: tgId, blocked })
    });
    fetchData();
  };

  const handleExtendSub = async (tgId: number, days: number) => {
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    await fetch("/api/admin/users/extend", {
      method: "POST",
      headers,
      body: JSON.stringify({ telegram_id: tgId, days })
    });
    fetchData();
  };

  const handleUpdatePlan = async (id: string, price: number) => {
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    await fetch("/api/admin/plans/update", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, price })
    });
    fetchData();
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage) return;
    setLoading(true);
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers,
      body: JSON.stringify({ message: broadcastMessage })
    });
    const result = await res.json();
    alert(`Рассылка завершена!\nУспешно: ${result.successCount}\nОшибок: ${result.failCount}`);
    setBroadcastMessage("");
    setLoading(false);
  };

  const handleCreatePromo = async () => {
    if (!newPromo.code) return;
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    await fetch("/api/admin/promos/create", {
      method: "POST",
      headers,
      body: JSON.stringify(newPromo)
    });
    setNewPromo({ code: "", days: 30, max_uses: 100 });
    fetchData();
  };

  const handleDeletePromo = async (code: string) => {
    if (!confirm(`Удалить промокод ${code}?`)) return;
    const headers = { 
      Authorization: `Bearer Solbon5796+-`,
      "Content-Type": "application/json"
    };
    await fetch("/api/admin/promos/delete", {
      method: "POST",
      headers,
      body: JSON.stringify({ code })
    });
    fetchData();
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-zinc-900 p-8 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">DzenVPN Admin</h1>
          <input
            type="password"
            placeholder="Admin Password"
            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-3 text-white mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all">
            Login
          </button>
        </form>
      </div>
    );
  }

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(search.toLowerCase()) || 
    u.telegram_id.toString().includes(search)
  );

  const stats = {
    totalUsers: users.length,
    activeSubs: users.filter(u => new Date(u.subscription_ends_at) > new Date()).length,
    totalRevenue: payments.filter(p => p.status === 'succeeded').reduce((acc, p) => acc + p.amount, 0)
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-zinc-900 border-r border-white/5 p-6 hidden lg:block">
        <h1 className="text-xl font-bold text-white mb-8 flex items-center gap-2">
          <Shield className="text-emerald-500" /> DzenVPN
        </h1>
        <nav className="space-y-2">
          <button onClick={() => setActiveTab("users")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === "users" ? "bg-emerald-600/10 text-emerald-500" : "hover:bg-white/5"}`}>
            <Users size={20} /> Users
          </button>
          <button onClick={() => setActiveTab("payments")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === "payments" ? "bg-emerald-600/10 text-emerald-500" : "hover:bg-white/5"}`}>
            <CreditCard size={20} /> Payments
          </button>
          <button onClick={() => setActiveTab("plans")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === "plans" ? "bg-emerald-600/10 text-emerald-500" : "hover:bg-white/5"}`}>
            <Settings size={20} /> Plans
          </button>
          <button onClick={() => setActiveTab("promos")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === "promos" ? "bg-emerald-600/10 text-emerald-500" : "hover:bg-white/5"}`}>
            <Ticket size={20} /> Promos
          </button>
          <button onClick={() => setActiveTab("broadcast")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === "broadcast" ? "bg-emerald-600/10 text-emerald-500" : "hover:bg-white/5"}`}>
            <Send size={20} /> Broadcast
          </button>
        </nav>
        <div className="absolute bottom-8 left-6 right-6">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-zinc-500 hover:text-red-500 transition-all">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64 p-4 lg:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white capitalize">{activeTab}</h2>
            <p className="text-zinc-500">Manage your VPN service and users</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={fetchData} className="p-2 hover:bg-white/5 rounded-lg transition-all">
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="text"
                placeholder="Search..."
                className="bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {activeTab === "users" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 shadow-xl">
              <p className="text-zinc-500 text-sm mb-1 uppercase tracking-wider font-semibold">Total Users</p>
              <h3 className="text-4xl font-bold text-white">{stats.totalUsers}</h3>
            </div>
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 shadow-xl">
              <p className="text-zinc-500 text-sm mb-1 uppercase tracking-wider font-semibold">Active Subscriptions</p>
              <h3 className="text-4xl font-bold text-emerald-500">{stats.activeSubs}</h3>
            </div>
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 shadow-xl">
              <p className="text-zinc-500 text-sm mb-1 uppercase tracking-wider font-semibold">Total Revenue</p>
              <h3 className="text-4xl font-bold text-white">{stats.totalRevenue} ₽</h3>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="bg-zinc-900 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
          {activeTab === "users" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-zinc-400 text-sm uppercase tracking-wider">
                    <th className="px-6 py-4 font-semibold">User</th>
                    <th className="px-6 py-4 font-semibold">Subscription Ends</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map(user => {
                    const isActive = new Date(user.subscription_ends_at) > new Date();
                    return (
                      <tr key={user.telegram_id} className="hover:bg-white/5 transition-all">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">@{user.username || "no_username"}</div>
                          <div className="text-xs text-zinc-500">{user.telegram_id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-zinc-500" />
                            {new Date(user.subscription_ends_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                            {isActive ? "Active" : "Expired"}
                          </span>
                          {user.is_blocked === 1 && (
                            <span className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-zinc-800 text-zinc-400">
                              Blocked
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleExtendSub(user.telegram_id, 30)}
                              className="p-2 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg transition-all"
                              title="Extend 30 days"
                            >
                              <Plus size={18} />
                            </button>
                            <button 
                              onClick={() => handleBlockUser(user.telegram_id, user.is_blocked === 0)}
                              className={`p-2 rounded-lg transition-all ${user.is_blocked === 1 ? "text-red-500 hover:bg-red-500/10" : "text-zinc-500 hover:bg-white/10"}`}
                              title={user.is_blocked === 1 ? "Unblock" : "Block"}
                            >
                              {user.is_blocked === 1 ? <ShieldOff size={18} /> : <Shield size={18} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-zinc-400 text-sm uppercase tracking-wider">
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">User</th>
                    <th className="px-6 py-4 font-semibold">Plan</th>
                    <th className="px-6 py-4 font-semibold">Amount</th>
                    <th className="px-6 py-4 font-semibold">Transaction ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payments.map(payment => (
                    <tr key={payment.id} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4 text-sm">
                        {new Date(payment.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">@{payment.username || "unknown"}</div>
                        <div className="text-xs text-zinc-500">{payment.telegram_id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">{payment.plan_id}</td>
                      <td className="px-6 py-4 font-bold text-emerald-500">{payment.amount} ₽</td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-500">{payment.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "plans" && (
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map(plan => (
                <div key={plan.id} className="bg-zinc-800/50 p-6 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-xl font-bold text-white">{plan.name}</h4>
                    <span className="text-zinc-500 text-xs uppercase tracking-widest">{plan.months} Months</span>
                  </div>
                  <p className="text-sm text-zinc-400 mb-6 h-12 overflow-hidden">{plan.description}</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">₽</span>
                      <input
                        type="number"
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        defaultValue={plan.price}
                        onBlur={(e) => handleUpdatePlan(plan.id, parseInt(e.target.value))}
                      />
                    </div>
                    <div className="bg-zinc-900 px-3 py-2 rounded-xl border border-white/10 flex items-center gap-2 text-xs">
                      <Users size={14} className="text-zinc-500" />
                      {plan.connection_limit}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "promos" && (
            <div className="p-6">
              <div className="bg-zinc-800/30 p-6 rounded-2xl border border-white/5 mb-8">
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Plus size={20} className="text-emerald-500" /> Create Promo Code
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <input
                    type="text"
                    placeholder="CODE"
                    className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={newPromo.code}
                    onChange={(e) => setNewPromo({...newPromo, code: e.target.value.toUpperCase()})}
                  />
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="number"
                      placeholder="Days"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={newPromo.days}
                      onChange={(e) => setNewPromo({...newPromo, days: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input
                      type="number"
                      placeholder="Max Uses"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={newPromo.max_uses}
                      onChange={(e) => setNewPromo({...newPromo, max_uses: parseInt(e.target.value)})}
                    />
                  </div>
                  <button 
                    onClick={handleCreatePromo}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={18} /> Create
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5 text-zinc-400 text-sm uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">Code</th>
                      <th className="px-6 py-4 font-semibold">Days</th>
                      <th className="px-6 py-4 font-semibold">Usage</th>
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {promos.map(promo => (
                      <tr key={promo.code} className="hover:bg-white/5 transition-all">
                        <td className="px-6 py-4 font-bold text-white">{promo.code}</td>
                        <td className="px-6 py-4">{promo.days} days</td>
                        <td className="px-6 py-4">
                          <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-1">
                            <div 
                              className="bg-emerald-500 h-full" 
                              style={{ width: `${(promo.current_uses / promo.max_uses) * 100}%` }}
                            />
                          </div>
                          <div className="text-xs text-zinc-500">{promo.current_uses} / {promo.max_uses}</div>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleDeletePromo(promo.code)}
                            className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "broadcast" && (
            <div className="p-8 max-w-2xl mx-auto">
              <h4 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <Send className="text-emerald-500" /> Broadcast Message
              </h4>
              <p className="text-zinc-500 mb-6">
                Send a message to all users. You can use *Markdown* for formatting.
              </p>
              <textarea
                className="w-full h-64 bg-zinc-800 border border-white/10 rounded-2xl p-6 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-6 resize-none"
                placeholder="Type your message here..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
              />
              <button 
                onClick={handleBroadcast}
                disabled={loading || !broadcastMessage}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg shadow-xl shadow-emerald-900/20"
              >
                {loading ? <RefreshCw className="animate-spin" /> : <Send size={22} />}
                Send to All Users
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
