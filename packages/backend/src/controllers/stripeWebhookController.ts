import { Request, Response } from 'express';
import { db } from '../config/database';
import { stripe } from '../config/stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// So os campos que realmente lemos do objeto do evento — evita depender do
// namespace de tipos do pacote `stripe`, que nao fica acessivel por import default
// nesta versao (StripeConstructor.Event/.Subscription nao existem; so
// StripeConstructor.Stripe, que por sua vez e um alias de tipo, nao namespace).
type StripeSubscriptionLike = {
  id: string;
  status: string;
};

// UC-02 (docs/specs/tenant.md): quando o Processador de Pagamentos confirma que a
// assinatura esta ativa, o Tenant transita pendente_pagamento -> ativo. Idempotente
// por design: se ja estiver ativo, o evento e apenas confirmado sem efeito.
export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'];

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, webhookSecret);
  } catch (err) {
    console.error('Assinatura invalida no webhook do Stripe:', err);
    return res.status(400).json({ error: 'Assinatura invalida' });
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as StripeSubscriptionLike;

    if (subscription.status === 'active') {
      try {
        await ativarTenantPorAssinatura(subscription.id);
      } catch (err) {
        console.error('Erro ao ativar Tenant a partir do webhook do Stripe:', err);
        return res.status(500).json({ error: 'Erro interno' });
      }
    }
  }

  return res.status(200).json({ received: true });
}

async function ativarTenantPorAssinatura(stripeSubscriptionId: string) {
  // SELECT publico: a policy tenant_select ja permite consulta por Tenant com slug
  // definido (sempre o caso apos onboarding), sem precisar de app.current_tenant.
  const result = await db.query(
    'SELECT id, status FROM "Tenant" WHERE "stripeSubscriptionId" = $1',
    [stripeSubscriptionId]
  );

  const tenant = result.rows[0];

  if (!tenant) {
    console.warn(`Webhook do Stripe: nenhum Tenant encontrado para subscription ${stripeSubscriptionId}`);
    return;
  }

  if (tenant.status === 'ativo') {
    return;
  }

  try {
    await db.query('BEGIN');
    await db.query(
      'SELECT set_config($1, $2, true)',
      ['app.current_tenant', tenant.id]
    );
    await db.query(
      `UPDATE "Tenant" SET status = 'ativo' WHERE id = $1`,
      [tenant.id]
    );
    await db.query('COMMIT');
  } catch (err) {
    // ROLLBACK pode falhar tambem (ex: banco indisponivel) — nao deixar isso virar
    // uma segunda excecao nao tratada, que derrubaria o processo inteiro.
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
