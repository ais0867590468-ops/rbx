import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Search, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  banIp,
  deleteShopUser,
  listShopUsers,
  resetShopUserPassword,
  setShopUserBan,
} from "@/admin/admin-ext-fn";

export const Route = createFileRoute("/admin/usuarios")({ component: UsuariosPage });

type Rows = Awaited<ReturnType<typeof listShopUsers>>;

function when(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

function UsuariosPage() {
  const [rows, setRows] = useState<Rows | null>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(() => {
    listShopUsers({ data: { q: q || undefined } })
      .then(setRows)
      .catch((e: Error) => toast.error(e.message));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Contas da loja</p>
        <h1 className="font-display text-3xl font-semibold">Usuários cadastrados</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Quem criou conta (opcional) na loja. Dá para ver o e-mail, banir o login, excluir ou definir uma nova senha.
        </p>
        <p className="mt-2 max-w-2xl rounded-lg border border-line bg-surface px-3 py-2 text-xs text-faint">
          As senhas são guardadas só como hash criptografado (scrypt) — ninguém consegue ler a senha original, nem o
          painel. Se o cliente esqueceu, use <strong>Nova senha</strong>.
        </p>
      </div>

      {shown ? (
        <Card className="flex flex-wrap items-center gap-3 border-accent/50 p-4">
          <KeyRound className="size-5 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Nova senha de {shown.email}</p>
            <p className="font-mono text-lg">{shown.password}</p>
            <p className="text-xs text-faint">Mostrada uma única vez. Envie ao cliente por um canal seguro.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(shown.password);
              toast.success("Copiada.");
            }}
          >
            <Copy className="size-4" /> Copiar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShown(null)}>
            Fechar
          </Button>
        </Card>
      ) : null}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input className="pl-9" placeholder="Buscar e-mail, nome ou IP…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-4 py-3">Conta</th>
              <th>Status</th>
              <th>Pedidos</th>
              <th>Logins</th>
              <th>IP cadastro / último</th>
              <th>Dispositivo</th>
              <th>Criada</th>
              <th>Último login</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows?.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.name || "—"}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td>
                  {u.banned ? <Badge tone="warn">banida</Badge> : <Badge tone="success">ativa</Badge>}
                  {u.banned && u.ban_reason ? <p className="mt-1 text-[11px] text-faint">{u.ban_reason}</p> : null}
                  {u.sessions > 0 ? <p className="mt-1 text-[11px] text-faint">{u.sessions} sessão(ões)</p> : null}
                </td>
                <td className="tabular-nums">{u.orders_count}</td>
                <td className="tabular-nums">{u.login_count}</td>
                <td className="font-mono text-xs">
                  <p>{u.signup_ip ?? "—"}</p>
                  <p className="text-faint">{u.last_ip ?? "—"}</p>
                </td>
                <td className="text-xs text-muted">
                  {u.device} · {u.os}
                  <br />
                  {u.browser}
                </td>
                <td className="text-xs text-faint">{when(u.created_at)}</td>
                <td className="text-xs text-faint">{when(u.last_login_at)}</td>
                <td className="px-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (u.banned) {
                          void run(() => setShopUserBan({ data: { id: u.id, banned: false } }), "Login liberado.");
                        } else {
                          const reason = window.prompt("Motivo do banimento do login (opcional):") ?? null;
                          if (reason === null) return;
                          void run(
                            () => setShopUserBan({ data: { id: u.id, banned: true, reason } }),
                            "Login banido.",
                          );
                        }
                      }}
                    >
                      <UserX className="size-3.5" /> {u.banned ? "Liberar" : "Banir"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const typed = window.prompt(
                          "Nova senha (mín. 8 caracteres). Deixe vazio para gerar uma aleatória:",
                        );
                        if (typed === null) return;
                        try {
                          const res = await resetShopUserPassword({
                            data: { id: u.id, password: typed.trim() ? typed.trim() : undefined },
                          });
                          setShown({ email: u.email, password: res.password });
                          toast.success("Senha redefinida e sessões encerradas.");
                          load();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erro");
                        }
                      }}
                    >
                      <KeyRound className="size-3.5" /> Nova senha
                    </Button>
                    {u.last_ip ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void run(
                            () => banIp({ data: { ip: u.last_ip!, reason: `Conta ${u.email}`, hours: 0 } }),
                            `IP ${u.last_ip} banido.`,
                          )
                        }
                      >
                        Banir IP
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!window.confirm(`Excluir a conta de ${u.email}? Os pedidos são mantidos.`)) return;
                        void run(() => deleteShopUser({ data: { id: u.id } }), "Conta excluída.");
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Ninguém criou conta ainda.</p>
        ) : null}
      </Card>
    </div>
  );
}
