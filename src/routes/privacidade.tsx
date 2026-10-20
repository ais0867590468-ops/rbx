import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/site/components/site-shell";

export const Route = createFileRoute("/privacidade")({
  component: Privacidade,
  head: () => ({
    meta: [
      { title: "Privacidade | RecargasBuxs" },
      { name: "description", content: "Como a RecargasBuxs trata os seus dados e protege o seu pedido." },
    ],
  }),
});

function Privacidade() {
  return (
    <SiteShell>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-display text-3xl font-semibold">Privacidade</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            A RecargasBuxs trata dados pessoais com base na Lei nº 13.709/2018 (LGPD), para executar
            o contrato de compra, prevenir fraude e atender o suporte.
          </p>
          <h2 className="font-display text-xl font-semibold text-fg">O que coletamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Conta do Roblox e e-mail informados no checkout.</li>
            <li>Nome, quando você optar por preencher.</li>
            <li>Dados necessários para confirmar PIX ou cartão (sem armazenar o número completo do cartão).</li>
            <li>Conteúdo dos tickets de suporte.</li>
            <li>
              Dados de navegação para medir anúncios: origem do acesso (UTMs e identificadores de clique), página de
              entrada, idioma, tipo de aparelho, IP e um identificador anônimo do navegador.
            </li>
          </ul>
          <h2 className="font-display text-xl font-semibold text-fg">Para que usamos</h2>
          <p>
            Entregar o pedido, confirmar o pagamento, detectar abuso, notificar a equipe internamente
            e cumprir obrigações legais. Também medimos de onde vêm os acessos e as compras, com ferramentas
            de análise de campanhas (como a UTMify), para saber quais anúncios funcionam. Nesse envio vão o
            pedido, o e-mail e os dados de origem — nunca o CPF, a senha ou dados de cartão.
          </p>
          <h2 className="font-display text-xl font-semibold text-fg">Seus direitos</h2>
          <p>
            Você pode pedir acesso, correção ou exclusão abrindo um ticket em Suporte. Pedidos de
            exclusão de registros de fraude podem ser atendidos parcialmente quando houver dever
            legal de retenção.
          </p>
          <p className="text-faint">Controlador: operação RecargasBuxs.</p>
        </div>
      </main>
    </SiteShell>
  );
}
