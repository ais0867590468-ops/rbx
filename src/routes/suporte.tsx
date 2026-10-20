import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SiteShell } from "@/site/components/site-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { openTicket } from "@/site/store-fn";

export const Route = createFileRoute("/suporte")({
  component: Suporte,
  head: () => ({
    meta: [
      { title: "Suporte e tickets | RecargasBuxs" },
      { name: "description", content: "Abra um ticket e acompanhe a resposta da equipe da RecargasBuxs." },
    ],
  }),
});

function Suporte() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    orderId: "",
    subject: "",
    message: "",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await openTicket({
        data: {
          ...form,
          orderId: form.orderId || undefined,
        },
      });
      toast.success("Ticket aberto.");
      await navigate({
        to: "/ticket/$publicId",
        params: { publicId: res.publicId },
        search: { k: res.secret },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir o ticket.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell>
      <main className="mx-auto max-w-xl px-4 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Atendimento</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Abrir ticket</h1>
        <p className="mt-2 text-sm text-muted">
          A equipe responde neste mesmo fio. Guarde o link: ele é o seu acesso ao chamado.
        </p>
        <form className="mt-8 space-y-4 rounded-xl border border-line bg-surface p-6" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order">Código do pedido (opcional)</Label>
            <Input
              id="order"
              placeholder="RBX-…"
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Assunto</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              required
              minLength={10}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Enviando…" : "Enviar ticket"}
          </Button>
        </form>
      </main>
    </SiteShell>
  );
}
