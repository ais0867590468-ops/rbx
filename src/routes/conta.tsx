import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, UserRound } from "lucide-react";
import { SiteShell } from "@/site/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeMyPassword,
  loginAccount,
  logoutAccount,
  myOrders,
  registerAccount,
} from "@/site/account-fn";
import { brl } from "@/lib/utils";

export const Route = createFileRoute("/conta")({
  component: Conta,
  head: () => ({
    meta: [
      { title: "Minha conta | RecargasBuxs" },
      { name: "description", content: "Conta opcional para acompanhar seus pedidos de Robux." },
    ],
  }),
});

type Overview = Awaited<ReturnType<typeof myOrders>>;

const STATUS: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  delivered: "Entregue",
  expired: "Expirado",
  failed: "Falhou",
  refunded: "Estornado",
};

function Conta() {
  const [data, setData] = useState<Overview | undefined>(undefined);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", website: "" });
  const [pw, setPw] = useState({ current: "", next: "" });

  const load = useCallback(() => {
    myOrders()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => load(), [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        await registerAccount({
          data: { name: form.name, email: form.email, password: form.password, website: form.website },
        });
        toast.success("Conta criada.");
      } else {
        await loginAccount({ data: { email: form.email, password: form.password } });
        toast.success("Bem-vindo de volta.");
      }
      setForm({ name: "", email: "", password: "", website: "" });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await changeMyPassword({ data: pw });
      toast.success("Senha alterada.");
      setPw({ current: "", next: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar a senha.");
    }
  }

  return (
    <SiteShell>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Opcional</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Minha conta</h1>
        <p className="mt-2 text-sm text-muted">
          Você não precisa de conta para comprar. Crie uma só se quiser acompanhar seus pedidos num lugar só.
        </p>

        {data === undefined ? (
          <div className="mt-8 h-48 animate-pulse rounded-xl bg-surface" />
        ) : data ? (
          <div className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-accent/15 text-accent">
                  <UserRound className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{data.user.name || "Cliente"}</p>
                  <p className="text-sm text-muted">{data.user.email}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await logoutAccount();
                  setData(null);
                  toast.success("Você saiu.");
                }}
              >
                <LogOut className="size-4" /> Sair
              </Button>
            </div>

            <section className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-semibold">Meus pedidos</h2>
              <ul className="mt-3 divide-y divide-line">
                {data.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <Link to="/checkout/$orderId" params={{ orderId: o.id }} className="font-medium text-accent">
                        {o.product_name}
                      </Link>
                      <p className="text-xs text-faint">
                        {o.id} · {new Date(o.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{brl(o.price_cents)}</span>
                      <Badge tone={o.status === "delivered" || o.status === "paid" ? "success" : "line"}>
                        {STATUS[o.status] ?? o.status}
                      </Badge>
                    </div>
                  </li>
                ))}
                {data.orders.length === 0 ? (
                  <li className="py-6 text-center text-sm text-muted">
                    Nenhum pedido com este e-mail ainda.{" "}
                    <Link to="/produtos" className="text-accent">
                      Ver pacotes
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>

            <form onSubmit={changePw} className="space-y-3 rounded-xl border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-semibold">Alterar senha</h2>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Senha atual"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
                required
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Nova senha (mín. 8 caracteres)"
                minLength={8}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
                required
              />
              <Button type="submit" variant="outline">
                Salvar nova senha
              </Button>
            </form>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6">
            <div className="flex rounded-md border border-line p-1">
              {(["in", "up"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`h-9 flex-1 rounded-sm text-sm transition-colors ${
                    mode === m ? "bg-bg font-medium" : "text-muted"
                  }`}
                >
                  {m === "in" ? "Entrar" : "Criar conta"}
                </button>
              ))}
            </div>
            {mode === "up" ? (
              <div className="space-y-1.5">
                <Label htmlFor="acc-name">Nome (opcional)</Label>
                <Input
                  id="acc-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={80}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">E-mail</Label>
              <Input
                id="acc-email"
                type="email"
                autoComplete="username"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acc-pass">Senha</Label>
              <Input
                id="acc-pass"
                type="password"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                minLength={mode === "up" ? 8 : 1}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde…" : mode === "up" ? "Criar conta" : "Entrar"}
            </Button>
            <p className="text-center text-xs text-faint">
              Sua senha é guardada criptografada. Comprar sem conta continua funcionando normalmente.
            </p>
          </form>
        )}
      </main>
    </SiteShell>
  );
}
