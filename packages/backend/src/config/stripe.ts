import Stripe from 'stripe';
import crypto from 'crypto';
import { externalServicesMocked } from './externalServices';

const stripeSecretKey = externalServicesMocked
  ? 'sk_test_mock_local'
  : process.env.STRIPE_SECRET_KEY!;

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-04-22.dahlia',
});

export async function createCustomer(email: string, name: string): Promise<{ id: string }> {
  if (externalServicesMocked) {
    const id = `cus_mock_${crypto.randomUUID().replaceAll('-', '')}`;
    console.log(`[mock] Cliente Stripe ${id} para ${email} (${name})`);
    return { id };
  }

  return stripe.customers.create({ email, name });
}

export async function createSubscription(customerId: string, priceId: string): Promise<{ id: string }> {
  if (externalServicesMocked) {
    const id = `sub_mock_${crypto.randomUUID().replaceAll('-', '')}`;
    console.log(`[mock] Assinatura Stripe ${id} para ${customerId} (preco: ${priceId})`);
    return { id };
  }

  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
}
