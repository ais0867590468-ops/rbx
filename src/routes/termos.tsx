import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/site/components/site-shell";

export const Route = createFileRoute("/termos")({
  component: Termos,
  head: () => ({
    meta: [
      { title: "Termos de uso | RecargasBuxs" },
      { name: "description", content: "Regras de compra, entrega e uso da RecargasBuxs." },
    ],
  }),
});

function Termos() {
  return (
    <SiteShell>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl font-semibold">Termos de uso</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            A RecargasBuxs comercializa pacotes de Robux com pagamento via PIX ou cartão e entrega
            automática após a confirmação. Ao comprar, você declara que a conta do Roblox informada
            é sua ou que possui autorização para receber os Robux nessa conta. Nick errado não gera
            reenvio automático.
          </p>
          <p>
            O checkout é protegido. A entrega inicia depois que o pagamento é confirmado pelo
            processador. Picos de fila podem atrasar a liberação — o status do pedido permanece
            visível no checkout e no suporte.
          </p>
          <p>
            Fraude, chargeback indevido ou uso de dados de terceiros sem autorização podem resultar
            em recusa de novos pedidos.
          </p>
          <p>
            O nome no checkout é opcional. E-mail e conta do Roblox são obrigatórios para entregar o
            pedido e enviar o comprovante.
          </p>
          <p>
            Roblox e Robux são marcas de seus respectivos titulares. A RecargasBuxs não é afiliada à
            Roblox Corporation.
          </p>
        </div>
      </main>
    </SiteShell>
  );
}
