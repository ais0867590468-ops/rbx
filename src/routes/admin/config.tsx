import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminSettings, listStaff, saveAdminSettings } from "@/admin/admin-fn";

export const Route = createFileRoute("/admin/config")({ component: ConfigPage });

function ConfigPage() {
  const [name, setName] = useState("RecargasBuxs");
  const [hours, setHours] = useState("");
  const [staff, setStaff] = useState<Array<{ user_id: string; role: string; email: string | null }>>([]);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setName(s.site_name);
        setHours(s.support_hours);
      })
      .catch((e: Error) => toast.error(e.message));
    listStaff()
      .then((r) => setStaff(r as typeof staff))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-3xl font-semibold">Configurações</h1>
      <Card className="space-y-3 p-5">
        <div className="space-y-1.5">
          <Label>Nome da loja</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Horário de suporte</Label>
          <Input value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <Button
          type="button"
          onClick={async () => {
            await saveAdminSettings({ data: { site_name: name, support_hours: hours } });
            toast.success("Salvo.");
          }}
        >
          Salvar
        </Button>
      </Card>
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Equipe</h2>
        <p className="mt-1 text-sm text-muted">O primeiro login vira dono. Contas da equipe:</p>
        <ul className="mt-3 space-y-2 text-sm">
          {staff.map((s) => (
            <li key={s.user_id} className="rounded-md border border-line px-3 py-2">
              <span className="font-medium">{s.role}</span>
              <span className="ml-2 text-muted">{s.email || s.user_id}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
