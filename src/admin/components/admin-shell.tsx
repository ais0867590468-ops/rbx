import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  CreditCard,
  Headset,
  LayoutDashboard,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
  Filter,
  Globe,
  UserCog,
  Star,
  Radar,
  LogOut,
  Lock,
  User,
  Shield,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStaffAuthStatus,
  loginStaff,
  registerFirstStaff,
  logoutStaff,
} from "@/admin/admin-staff-fn";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/usuarios", label: "Contas (login)", icon: UserCog },
  { to: "/admin/funil", label: "Funil", icon: Filter },
  { to: "/admin/utmify", label: "UTMify", icon: Radar },
  { to: "/admin/tickets", label: "Tickets", icon: Headset },
  { to: "/admin/feedbacks", label: "Feedbacks", icon: Star },
  { to: "/admin/catalogo", label: "Produtos", icon: Package },
  { to: "/admin/discord", label: "Discord", icon: MessageSquare },
  { to: "/admin/gateway", label: "Pagamentos", icon: CreditCard },
  { to: "/admin/logs", label: "Registros", icon: ScrollText },
  { to: "/admin/ips", label: "IPs", icon: Globe },
  { to: "/admin/seguranca", label: "Segurança", icon: ShieldCheck },
  { to: "/admin/config", label: "Configurações", icon: Settings },
] as const;

type AuthState = {
  loading: boolean;
  authenticated: boolean;
  needsSetup: boolean;
  user: { id: string; email: string; name: string; role: string } | null;
};

export function AdminShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [auth, setAuth] = useState<AuthState>({
    loading: true,
    authenticated: false,
    needsSetup: false,
    user: null,
  });

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isSignup = auth.needsSetup || isRegistering;

  async function checkAuth() {
    try {
      const res = await getStaffAuthStatus();
      setAuth({
        loading: false,
        authenticated: res.authenticated,
        needsSetup: res.needsSetup,
        user: res.user,
      });
    } catch {
      setAuth({
        loading: false,
        authenticated: false,
        needsSetup: false,
        user: null,
      });
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if (isSignup) {
        await registerFirstStaff({
          data: {
            name: name || undefined,
            email,
            password,
          },
        });
        toast.success("Conta de administrador criada com sucesso!");
      } else {
        await loginStaff({
          data: { email, password },
        });
        toast.success("Login realizado com sucesso.");
      }
      await checkAuth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha na autenticação.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutStaff();
      toast.success("Sessão finalizada.");
      setAuth({
        loading: false,
        authenticated: false,
        needsSetup: false,
        user: null,
      });
      setEmail("");
      setPassword("");
    } catch {
      window.location.reload();
    }
  }

  if (auth.loading) {
    return (
      <div className="admin-shell grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-accent" />
          <span className="text-xs uppercase tracking-widest text-muted">Carregando painel...</span>
        </div>
      </div>
    );
  }

  // Not authenticated: render clean, beautiful Admin Login Screen
  if (!auth.authenticated) {
    return (
      <div className="admin-shell flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl md:p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-inner">
              <Shield className="size-6" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              {isSignup ? "Cadastro de Administrador" : "Área Restrita"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-fg">
              {isSignup ? "Criar Conta de Administrador" : "Acesso ao Painel ADM"}
            </h1>
            <p className="mt-2 text-xs text-muted">
              {isSignup
                ? "Defina seu nome, e-mail e senha para criar o acesso de administrador da loja."
                : "Digite seu e-mail e senha de equipe para acessar o painel de gerenciamento."}
            </p>
          </div>

          {errorMsg && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            {isSignup && (
              <div>
                <Label htmlFor="admin-name" className="text-xs text-muted">
                  Nome do Administrador
                </Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-2.5 size-4 text-faint" />
                  <Input
                    id="admin-name"
                    type="text"
                    placeholder="ex: Dono da Loja"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="admin-email" className="text-xs text-muted">
                E-mail de acesso
              </Label>
              <div className="relative mt-1">
                <Input
                  id="admin-email"
                  type="email"
                  required
                  placeholder="seuemail@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="admin-password" className="text-xs text-muted">
                Senha de acesso
              </Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-2.5 size-4 text-faint" />
                <Input
                  id="admin-password"
                  type="password"
                  required
                  placeholder={isSignup ? "Mínimo 6 caracteres" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full gap-2 font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processando...
                </>
              ) : isSignup ? (
                "Criar Administrador e Entrar"
              ) : (
                "Entrar no Painel"
              )}
            </Button>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setErrorMsg(null);
                }}
                className="text-xs text-accent underline hover:opacity-80"
              >
                {isSignup ? "Já tem uma conta? Fazer login" : "Não tem conta? Criar administrador"}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-line/60 pt-4 text-center">
            <Link to="/" className="text-xs text-muted transition-colors hover:text-accent">
              ← Voltar para a loja
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-line md:border-b-0 md:border-r">
        <div className="flex h-14 items-center justify-between px-4 md:h-16">
          <Link to="/admin" className="flex items-center gap-2.5">
            <img src="/images/logo.png" alt="" className="logo-img size-9 object-contain" />
            <span className="leading-tight">
              <span className="brand-name block font-display text-base font-bold">RecargasBuxs</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
                Painel ADM
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            title="Sair do painel"
            className="flex size-8 items-center justify-center rounded-lg border border-line text-muted transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="size-4" />
          </button>
        </div>

        {/* User identifier pill */}
        <div className="hidden border-b border-line/50 px-4 py-2 md:block">
          <div className="flex items-center justify-between text-[11px]">
            <span className="truncate text-muted" title={auth.user?.email}>
              {auth.user?.email}
            </span>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
              {auth.user?.role || "Staff"}
            </span>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-3 md:pb-6">
          {LINKS.map((l) => {
            const active = l.to === "/admin" ? pathname === "/admin" : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2.5 rounded-md px-3 text-sm transition-all duration-200",
                  active
                    ? "bg-accent/15 font-medium text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                    : "text-muted hover:translate-x-0.5 hover:bg-surface hover:text-fg",
                )}
              >
                <l.icon className="size-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 p-4 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
