import { Request, Response } from 'express';
import { db, setDatabaseContext, withTransaction } from '../config/database';
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

// Stripe subscription events activate a pending tenant. The operation is idempotent.
export async function stripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'];

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, webhookSecret);
  } catch (err) {
    console.error('Invalid Stripe webhook signature:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as StripeSubscriptionLike;

    if (subscription.status === 'active') {
      try {
        await activateTenantBySubscription(subscription.id);
      } catch (err) {
        console.error('Failed to activate tenant from Stripe webhook:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  return res.status(200).json({ received: true });
}

async function activateTenantBySubscription(stripeSubscriptionId: string) {
  // Public SELECT is allowed for tenants with a slug.
  const result = await db.query(
    'SELECT id, status FROM tenants WHERE stripe_subscription_id = $1',
    [stripeSubscriptionId]
  );

  const tenant = result.rows[0];

  if (!tenant) {
    console.warn(`Stripe webhook: no tenant found for subscription ${stripeSubscriptionId}`);
    return;
  }

  if (tenant.status === 'active') {
    return;
  }

  try {
    await withTransaction(async (client) => {
      await setDatabaseContext(client, { tenantId: tenant.id });
      await client.query(
      `UPDATE tenants SET status = 'active' WHERE id = $1`,
      [tenant.id]
      );
    });
  } catch (err) {
    throw err;
  }
}
