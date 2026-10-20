import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CheckoutStepName } from "@/lib/discord-logs";
import { CardMark, PixMark } from "@/site/components/pay-marks";
import { createCheckout, logCheckoutStep, type Product } from "@/site/store-fn";
import { getAttribution } from "@/site/tracking-client";
import { cn } from "@/lib/utils";

const ROBLOX_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type StepOverride = {
  method?: "pix" | "card";
  methodChosen?: boolean;
  privacy?: boolean;
};

export function CheckoutForm({ product }: { product: Product }) {
  const navigate = useNavigate();
  const [robloxUsername, setRobloxUsername] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState("");
  const [methodChosen, setMethodChosen] = useState(false);
  // Step logging: a stable session id, a counter and the last value reported per step.
  const sessionId = useRef("");
  const seq = useRef(0);
  const reported = useRef<Record<string, string>>({});

  /**
   * Tells the server a field was just completed (one Discord log per field).
   * Card data never leaves as text: only "this field is filled" booleans are sent.
   */
  function reportStep(step: CheckoutStepName, key: string, over: StepOverride = {}) {
    if (reported.current[step] === key) return;
    reported.current[step] = key;
    if (!sessionId.current) {
      sessionId.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    seq.current += 1;
    const roblox = robloxUsername.trim();
    const expOk = /^\d{1,2}\s*\/\s*\d{2,4}$/.test(cardExp.trim());
    logCheckoutStep({
      data: {
        slug: product.slug,
        step,
        seq: seq.current,
        sessionId: sessionId.current,
        tracking: getAttribution(),
        state: {
          roblox: ROBLOX_RE.test(roblox) ? roblox : undefined,
          email: EMAIL_RE.test(customerEmail.trim()) ? customerEmail.trim() : undefined,
          name: customerName.trim() || undefined,
          method: over.method ?? method,
          methodChosen: over.methodChosen ?? methodChosen,
          card: {
            number: cardNumber.replace(/\D/g, "").length >= 13,
            name: cardName.trim().length >= 2,
            exp: expOk,
            cvv: /^\d{3,4}$/.test(cardCvv.trim()),
          },
          privacy: over.privacy ?? privacy,
        },
      },
    }).catch(() => {});
  }

  function chooseMethod(next: "pix" | "card") {
    setMethod(next);
    setMethodChosen(true);
    reportStep("method", next, { method: next, methodChosen: true });
  }

  async function onBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!privacy) {
      toast.error("Aceite a política de privacidade para continuar.");
      return;
    }
    setBusy(true);
    try {
      const res = await createCheckout({
        data: {
          slug: product.slug,
          robloxUsername,
          customerEmail,
          customerName: customerName.trim() || undefined,
          privacy: true,
          method,
          website,
          tracking: getAttribution(),
        },
      });
      if (method === "card" && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        await navigate({ to: "/checkout/$orderId", params: { orderId: res.orderId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível iniciar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onBuy}>
      <div className="space-y-1.5">
        <Label htmlFor="account">Conta do Roblox</Label>
        <Input
          id="account"
          placeholder="seuNick"
          value={robloxUsername}
          onChange={(e) => setRobloxUsername(e.target.value)}
          onBlur={() => {
            const v = robloxUsername.trim();
            if (ROBLOX_RE.test(v)) reportStep("roblox", v.toLowerCase());
          }}
          required
          minLength={3}
          maxLength={20}
          autoComplete="username"
        />
        <p className="text-xs text-faint">
          {robloxUsername.trim().length >= 3
            ? `Os Robux vão para ${robloxUsername.trim()}. Confira o nick.`
            : "A entrega vai para esta conta. Confira o nick com atenção."}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="voce@email.com"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          onBlur={() => {
            const v = customerEmail.trim().toLowerCase();
            if (EMAIL_RE.test(v)) reportStep("email", v);
          }}
          required
          autoComplete="email"
        />
        <p className="text-xs text-faint">Enviamos o comprovante e o código do pedido aqui.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="name">
          Nome <span className="font-normal text-faint">(opcional)</span>
        </Label>
        <Input
          id="name"
          placeholder="Como podemos te chamar"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          onBlur={() => {
            const v = customerName.trim();
            if (v.length >= 2) reportStep("name", v.toLowerCase());
          }}
          autoComplete="name"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Forma de pagamento</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => chooseMethod("pix")}
            className={cn(
              "flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              method === "pix" ? "border-accent bg-accent/10" : "border-line bg-surface",
            )}
          >
            <PixMark className="size-8" />
            <span>
              <span className="block text-sm font-semibold">PIX</span>
              <span className="block text-xs text-muted">QR Code na hora · recomendado</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => chooseMethod("card")}
            className={cn(
              "flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              method === "card" ? "border-accent bg-accent/10" : "border-line bg-surface",
            )}
          >
            <CardMark />
            <span>
              <span className="block text-sm font-semibold">Cartão</span>
              <span className="block text-xs text-muted">Visa, Mastercard ou Elo</span>
            </span>
          </button>
        </div>
      </fieldset>

      {method === "card" ? (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4 fillet">
          <div className="overflow-hidden rounded-xl bg-ink p-5 text-accent-fg fillet">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                Checkout Seguro Stripe
              </span>
              <CardMark />
            </div>
            <p className="mt-4 font-display text-lg font-semibold tracking-wide text-white">
              Cartão de Crédito
            </p>
            <p className="mt-1 text-xs text-accent-fg/80 leading-relaxed">
              Visa, Mastercard, Elo, Hipercard e American Express. Criptografia de ponta a ponta e liberação imediata após aprovação.
            </p>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-bg p-3 text-xs text-muted">
            <span className="text-base leading-none">🔒</span>
            <p className="leading-relaxed">
              Ao clicar no botão abaixo, você será redirecionado para a página oficial do <strong>Checkout Seguro (Stripe)</strong> para preencher os dados do cartão com total proteção.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
          <PixMark className="size-8" />
          <div>
            <p className="text-sm font-semibold">Pagamento instantâneo com PIX</p>
            <p className="text-xs text-muted">O QR e o copia e cola aparecem na próxima tela.</p>
          </div>
        </div>
      )}

      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-accent"
          checked={privacy}
          onChange={(e) => {
            setPrivacy(e.target.checked);
            if (e.target.checked) reportStep("privacy", "ok", { privacy: true });
          }}
        />
        <span>
          Li e aceito os{" "}
          <Link to="/termos" className="text-fg underline">
            termos
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="text-fg underline">
            política de privacidade
          </Link>
          .
        </span>
      </label>
      <Button type="submit" size="lg" className="cta-pulse w-full" disabled={busy}>
        {busy ? "Processando…" : method === "pix" ? "Pagar com PIX agora" : "Pagar com cartão"}
      </Button>
      <p className="text-center text-xs text-faint">
        Após o pagamento, a entrega automática começa na hora.
      </p>
    </form>
  );
}
