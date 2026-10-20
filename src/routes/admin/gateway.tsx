import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminSettings, saveAdminSettings } from "@/admin/admin-fn";

export const Route = createFileRoute("/admin/gateway")({ component: GatewayPage });

function GatewayPage() {
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [maskedSecret, setMaskedSecret] = useState("");
  const [auto, setAuto] = useState(true);
  const [keyEnv, setKeyEnv] = useState(false);
  const [secretEnv, setSecretEnv] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setMaskedKey(s.gateway_api_key_masked);
        setMaskedSecret(s.gateway_webhook_secret_masked);
        setAuto(s.auto_deliver !== "false");
        setKeyEnv(s.gatewayKeyFromEnv);
        setSecretEnv(s.gatewaySecretFromEnv);
      })
      .catch((e: Error) => toast.error(e.message));
  }, []);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Pagamentos</h1>
        <p className="mt-2 text-sm text-muted">
          Cole a chave e o segredo aqui. Eles ficam só no banco, nunca na página da loja. Sem chave,
          o PIX do checkout é só demonstração e não recebe dinheiro. O webhook é{" "}
          <span className="font-mono text-xs">/api/webhook/pagamento</span>.
        </p>
      </div>
      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>
            Chave da API {keyEnv ? <span className="ml-2 text-xs text-success">● vem do ambiente (protegida)</span> : null}
          </Label>
          <Input
            type="password"
            disabled={keyEnv}
            placeholder={maskedKey || "chave"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Segredo do webhook {secretEnv ? <span className="ml-2 text-xs text-success">● vem do ambiente (protegido)</span> : null}
          </Label>
          <Input
            type="password"
            disabled={secretEnv}
            placeholder={maskedSecret || "secret"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Entrega automática quando o pagamento confirmar
        </label>
        <Button
          type="button"
          onClick={async () => {
            await saveAdminSettings({
              data: {
                purincash_api_key: key || undefined,
                purincash_webhook_secret: secret || undefined,
                auto_deliver: auto ? "true" : "false",
              },
            });
            toast.success("Pagamentos salvos.");
          }}
        >
          Salvar
        </Button>
      </Card>
    </div>
  );
}
